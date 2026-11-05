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
  frameMs: [], // per-frame processing time (detect + match)
  decisionMs: [], // time for the agent to pick the next pose
  framesTotal: 0,
  framesTracked: 0, // frames where the required number of hands was visible
  rounds: [], // one record per finished round
};

export const state = {
  active: false,
  mode: "campaign", // "campaign" | "practice"
  level: 1, // level being played
  poses: [],
  profile: null,
  score: null, // session score (points, streak, accuracy)
  current: null,
  message: "",
  roundId: 0,
  // OLD: stable: 0,  (frame counter)
  stableSince: null, // time the pose first went above PASS_SCORE (null = not matching)
  roundStart: 0,
  timeLimit: 0,
  bestScore: 0,
  pauseUntil: 0,
  pendingNext: false,
  recentPF: [],
};

// Time limit rules:
//  - easy poses get less time, hard poses more (BASE_TIME_MS by pose difficulty)
//  - campaign: every level above 1 shrinks the time (pressure), never below MIN_TIME_MS
//  - practice: relaxed, longer time, no pressure
export function timeLimitFor(pose, level, mode) {
  const base = CONFIG.BASE_TIME_MS[pose.difficulty];
  if (mode === "practice") return base * CONFIG.PRACTICE_TIME_FACTOR;
  const pressure = Math.max(0.5, 1 - CONFIG.LEVEL_PRESSURE * (level - 1));
  return Math.max(CONFIG.MIN_TIME_MS, base * pressure);
}

// OLD: export function startGame(allPoses, { fresh = false } = {}) {
export function startGame(
  allPoses,
  { mode = "campaign", level = 1, fresh = false } = {},
) {
  state.poses = allPoses.filter(
    (p) => p.hands && p.hands.length === p.handsRequired,
  );
  state.profile = fresh ? createProfile() : loadProfile() || createProfile();
  state.mode = mode;
  state.level =
    mode === "campaign"
      ? state.profile.unlockedLevel
      : Math.min(level, state.profile.unlockedLevel);
  // OLD: if (state.poses.length < 3) return { ok: false, error: "Capture at least 3 poses first." };
  const usable = state.poses.filter((p) => p.difficulty <= state.level);
  if (usable.length < 3) {
    return {
      ok: false,
      error: `Need at least 3 captured poses up to level ${state.level}.`,
    };
  }
  state.score = createScore();
  state.active = true;
  state.pendingNext = false;
  nextChallenge(performance.now());
  return { ok: true };
}

export function stopGame() {
  state.active = false;
  if (state.profile) saveProfile(state.profile);
}

// OLD name: resetProfile (it now wipes levels, points and pose stats too)
export function resetProgress() {
  state.profile = createProfile();
  saveProfile(state.profile);
}

function nextChallenge(now) {
  const t0 = performance.now();
  // OLD: const { pose, message } = selectNextChallenge(state.profile, state.poses);
  const { pose, message } = selectNextChallenge(
    state.profile,
    state.poses,
    state.level,
  );
  metrics.decisionMs.push(performance.now() - t0);
  state.current = pose;
  state.message = message;
  state.stableSince = null;
  state.bestScore = 0;
  state.roundStart = now;
  state.timeLimit = timeLimitFor(pose, state.level, state.mode);
  state.recentPF = [];
  state.roundId++;
}

function avgPF(list) {
  return [0, 1, 2, 3, 4].map(
    (i) => list.reduce((s, v) => s + v[i], 0) / list.length,
  );
}

function finishRound(passed, now) {
  const elapsed = now - state.roundStart;
  state.pendingNext = true;
  state.pauseUntil = now + CONFIG.RESULT_PAUSE_MS;
  if (state.recentPF.length === 0) {
    // hands were never tracked, so there is nothing to learn from this round
    return {
      skipped: true,
      passed: false,
      score: 0,
      points: 0,
      poseName: state.current.name,
    };
  }
  const perFinger = avgPF(state.recentPF);
  const remainingFrac = Math.max(0, 1 - elapsed / state.timeLimit);
  // points: similarity (max 50) + speed bonus (max 50), only for a pass
  const points = passed
    ? Math.round(state.bestScore * 0.5 + remainingFrac * 50)
    : 0;
  const levelPlayed = state.level;

  updateProfile(state.profile, {
    pose: state.current,
    passed,
    perFinger,
    score: state.bestScore,
    timeMs: elapsed,
  });
  const leveledUp = awardPoints(
    state.profile,
    points,
    state.mode === "campaign",
  );
  if (leveledUp) state.level = state.profile.unlockedLevel;
  // OLD: addResult(state.score, passed, score);
  addResult(state.score, passed, points);

  metrics.rounds.push({
    mode: state.mode,
    level: levelPlayed,
    poseId: state.current.id,
    category: state.current.category,
    difficulty: state.current.difficulty,
    passed,
    bestScore: Math.round(state.bestScore),
    timeMs: Math.round(elapsed),
    timeLimitMs: Math.round(state.timeLimit),
    points,
    unlockedLevelAfter: state.profile.unlockedLevel,
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
    leveledUp,
    newLevel: state.profile.unlockedLevel,
  };
}

// Called once per camera frame while the game is active.
export function processFrame(detected, now) {
  if (state.pendingNext) {
    if (now < state.pauseUntil) return { phase: "pause" };
    state.pendingNext = false;
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

  // OLD: state.stable = out.tracked && out.score >= CONFIG.PASS_SCORE ? state.stable + 1 : 0;
  if (out.tracked && out.score >= CONFIG.PASS_SCORE) {
    if (state.stableSince === null) state.stableSince = now;
  } else {
    state.stableSince = null;
  }
  const holdFrac =
    state.stableSince === null
      ? 0
      : Math.min(1, (now - state.stableSince) / CONFIG.HOLD_MS);
  const remainingMs = Math.max(0, state.timeLimit - (now - state.roundStart));

  let ended = null;
  if (holdFrac >= 1) ended = finishRound(true, now);
  else if (remainingMs <= 0) ended = finishRound(false, now);

  return {
    phase: "play",
    out,
    holdFrac,
    remainingMs,
    timeFrac: remainingMs / state.timeLimit,
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
