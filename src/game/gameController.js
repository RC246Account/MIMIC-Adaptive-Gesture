import { CONFIG } from "../config.js";
import {
  createProfile,
  updateProfile,
  awardPoints,
  loadProfile,
  saveProfile,
} from "../agent/playerProfile.js";
import { selectNextChallenge } from "../agent/challengeAgent.js";
import { comparePose } from "../gestures/poseMatcher.js";
import { createScore, addResult } from "./scoreManager.js";

// Raw measurements for the Results section of the paper.
export const metrics = {
  frameMs: [], // per-frame processing time (detect + match), last 5000 frames
  decisionMs: [], // time for the agent to pick the next pose
  framesTotal: 0,
  framesTracked: 0,
  rounds: [],
};

export const state = {
  active: false,
  mode: "campaign", // "campaign" | "arcade" | "practice"
  pool: [], // poses this session may use
  profile: null,
  score: null,
  current: null,
  message: "",
  roundId: 0,
  stableSince: null,
  roundStart: 0,
  timeLimit: Infinity, // Infinity in practice mode (no timer)
  bestScore: 0,
  pauseUntil: 0,
  pendingNext: false,
  finished: false, // campaign: round over, waiting for Retry / Next
  practiceIdx: 0,
  recentPF: [],
};

// campaign: base time of the pose | arcade: a bit shorter | practice: no timer
export function timeLimitFor(pose, mode) {
  if (mode === "practice") return Infinity;
  const base = CONFIG.BASE_TIME_MS[pose.difficulty] || CONFIG.BASE_TIME_MS[4];
  return mode === "arcade"
    ? Math.max(CONFIG.MIN_TIME_MS, base * CONFIG.ARCADE_TIME_FACTOR)
    : base;
}

// campaign: pass the level's pose. arcade/practice: pass the pool of unlocked poses.
export function startSession(
  allPoses,
  { mode = "campaign", pose = null, pool = [] } = {},
) {
  state.profile = loadProfile() || createProfile();
  state.mode = mode;
  const ok = (p) => p.hands && p.hands.length === p.handsRequired;
  state.pool =
    mode === "campaign" ? (pose && ok(pose) ? [pose] : []) : pool.filter(ok);
  if (!state.pool.length) {
    return {
      ok: false,
      error:
        mode === "campaign"
          ? "This level has no captured pose."
          : "No poses unlocked yet. Clear a campaign level first.",
    };
  }
  state.score = createScore();
  state.active = true;
  state.pendingNext = false;
  state.finished = false;
  state.practiceIdx = 0;
  nextChallenge(performance.now(), mode === "campaign" ? state.pool[0] : null);
  return { ok: true };
}

export function stopGame() {
  state.active = false;
  if (state.profile) saveProfile(state.profile);
}

export function resetProgress() {
  state.profile = createProfile();
  saveProfile(state.profile);
}

// campaign: try the same level again
export function retryLevel() {
  if (!state.active) return;
  state.finished = false;
  state.pendingNext = false;
  nextChallenge(performance.now(), state.current);
}

// practice: move to the previous (-1) or next (+1) unlocked pose
export function stepPractice(dir) {
  if (!state.active || state.mode !== "practice") return;
  const n = state.pool.length;
  state.practiceIdx = (state.practiceIdx + dir + n) % n;
  state.pendingNext = false;
  nextChallenge(performance.now());
}

function nextChallenge(now, forced = null) {
  const t0 = performance.now();
  let pose;
  let message;
  if (forced) {
    pose = forced;
    message =
      state.mode === "campaign" ? "Copy the shape and hold it steady." : "";
  } else if (state.mode === "practice") {
    pose = state.pool[state.practiceIdx % state.pool.length];
    message = "Practice mode: no timer. Take your time.";
  } else {
    // level = 99 so the agent's old level filter lets every pool pose through
    ({ pose, message } = selectNextChallenge(state.profile, state.pool, 99));
  }
  metrics.decisionMs.push(performance.now() - t0);
  state.current = pose;
  state.message = message;
  state.stableSince = null;
  state.bestScore = 0;
  state.roundStart = now;
  state.timeLimit = timeLimitFor(pose, state.mode);
  state.recentPF = [];
  state.roundId++;
}

const avgPF = (list) =>
  [0, 1, 2, 3, 4].map((i) => list.reduce((s, v) => s + v[i], 0) / list.length);

function finishRound(passed, now) {
  const elapsed = now - state.roundStart;
  const campaign = state.mode === "campaign";
  state.finished = campaign; // campaign waits for the player's choice
  state.pendingNext = !campaign;
  state.pauseUntil = now + CONFIG.RESULT_PAUSE_MS;

  if (state.recentPF.length === 0) {
    return {
      skipped: true,
      passed: false,
      score: 0,
      points: 0,
      poseName: state.current.name,
    };
  }
  const perFinger = avgPF(state.recentPF);
  const remainingFrac =
    state.timeLimit === Infinity
      ? 0.5
      : Math.max(0, 1 - elapsed / state.timeLimit);
  const points =
    passed && state.mode !== "practice"
      ? Math.round(state.bestScore * 0.5 + remainingFrac * 50)
      : 0;

  updateProfile(state.profile, {
    pose: state.current,
    passed,
    perFinger,
    score: state.bestScore,
    timeMs: elapsed,
  });
  const firstClear = passed && !state.profile.completed[state.current.id];
  if (passed) state.profile.completed[state.current.id] = true;
  if (state.mode !== "practice") awardPoints(state.profile, points, false);
  addResult(state.score, passed, points);

  metrics.rounds.push({
    mode: state.mode,
    poseId: state.current.id,
    category: state.current.category,
    difficulty: state.current.difficulty,
    passed,
    bestScore: Math.round(state.bestScore),
    timeMs: Math.round(elapsed),
    timeLimitMs:
      state.timeLimit === Infinity ? null : Math.round(state.timeLimit),
    points,
    fingerWeakness: state.profile.fingerWeakness.map((w) => +w.toFixed(3)),
  });
  saveProfile(state.profile);
  return {
    skipped: false,
    passed,
    score: state.bestScore,
    points,
    poseName: state.current.name,
    timeMs: elapsed,
    firstClear,
  };
}

// Called once per camera frame while the game is active.
export function processFrame(detected, now) {
  if (!state.active || state.finished) return { phase: "idle" };
  if (state.pendingNext) {
    if (now < state.pauseUntil) return { phase: "pause" };
    state.pendingNext = false;
    if (state.mode === "practice") state.practiceIdx++;
    nextChallenge(now);
  }
  metrics.framesTotal++;
  const out = comparePose(state.current, detected);
  if (out.tracked) {
    metrics.framesTracked++;
    state.recentPF.push(out.perFinger);
    if (state.recentPF.length > 15) state.recentPF.shift();
    state.bestScore = Math.max(state.bestScore, out.score);
  }

  if (out.tracked && out.score >= CONFIG.PASS_SCORE) {
    if (state.stableSince === null) state.stableSince = now;
  } else {
    state.stableSince = null;
  }
  const holdFrac =
    state.stableSince === null
      ? 0
      : Math.min(1, (now - state.stableSince) / CONFIG.HOLD_MS);
  const remainingMs =
    state.timeLimit === Infinity
      ? Infinity
      : Math.max(0, state.timeLimit - (now - state.roundStart));

  let ended = null;
  if (holdFrac >= 1) ended = finishRound(true, now);
  else if (remainingMs <= 0) ended = finishRound(false, now);

  return {
    phase: "play",
    out,
    holdFrac,
    remainingMs,
    timeFrac: state.timeLimit === Infinity ? 1 : remainingMs / state.timeLimit,
    ended,
  };
}

export function buildSummary() {
  const f = [...metrics.frameMs].sort((a, b) => a - b);
  const mean = (a) =>
    a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  return {
    config: CONFIG,
    trackingSuccessRate: metrics.framesTotal
      ? metrics.framesTracked / metrics.framesTotal
      : null,
    meanFrameMs: mean(f),
    p95FrameMs: f.length ? f[Math.floor(f.length * 0.95)] : null,
    meanDecisionMs: mean(metrics.decisionMs),
    profile: state.profile,
    rounds: metrics.rounds,
  };
}
