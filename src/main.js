import "./style.css";
import { CONFIG } from "./config.js";
import { initHandTracker, detectHands } from "./camera/handTracker.js";
import { normalizeHand } from "./gestures/poseNormalizer.js";
import { poseMeta } from "./gestures/poseLibrary.js";
import {
  loadPoses,
  saveLandmarks,
  collectLandmarks,
} from "./gestures/poseStore.js";
import { createProfile, loadProfile } from "./agent/playerProfile.js";
import {
  startGame,
  stopGame,
  resetProgress,
  processFrame,
  state,
  metrics,
  buildSummary,
} from "./game/gameController.js";
import { drawLiveHands, drawTarget } from "./ui/skeletonRenderer.js";
import * as ui from "./ui/interface.js";
import * as sound from "./ui/sound.js";

// Developer mode = capture tools visible. Players on the deployed site never see them
// (unless they add ?dev=1, and poses captured that way only live in their own browser).
const DEV =
  import.meta.env.DEV || new URLSearchParams(location.search).has("dev");

const $ = (id) => document.getElementById(id);
const video = $("video");
const overlay = $("overlay");
const stage = $("stage");
const targetCanvas = $("target-canvas");
const modalCanvas = $("modal-canvas");

let poses = [];
let captureState = null;
let lastRoundId = -1;
let lastVideoTime = -1;
let lastTs = 0;
let loopStarted = false;
let lastTickSec = null;
let lastCountSec = null;

const viewProfile = () => state.profile || loadProfile() || createProfile();

function refreshPanels() {
  const prof = viewProfile();
  ui.renderProgress(prof, state.score, state.mode);
  ui.fillLevelSelect(prof.unlockedLevel);
  ui.renderCollection(poses, prof, openPose);
  ui.renderStats(prof, poses);
}

function openPose(pose, locked) {
  const prof = viewProfile();
  ui.openPoseModal(pose, prof.poseStats[pose.id], locked);
}

// ---------- boot ----------
async function boot() {
  try {
    ui.setStatus("Loading hand model...");
    await initHandTracker();
    poses = await loadPoses(poseMeta, DEV);
    $("dev-panel").hidden = !DEV;
    if (DEV) {
      ui.fillPoseSelect(poses);
      previewSelected();
    }
    refreshPanels();
    ui.setStatus("Ready. Enable the camera.");
  } catch (e) {
    console.error(e);
    ui.setStatus(
      "Model failed to load. Check public/wasm and public/models (see console).",
    );
  }
}

// ---------- camera ----------
async function enableCamera() {
  sound.unlockAudio();
  try {
    // OLD: video: { width: 1280, height: 720, facingMode: "user" }  (forced landscape, bad on phones)
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 960 },
        height: { ideal: 720 },
        facingMode: "user",
      },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    overlay.width = vw;
    overlay.height = vh;
    // keep the stage the same shape as the camera (works for portrait phones too)
    const ratio = vw / vh;
    stage.style.aspectRatio = `${vw} / ${vh}`;
    stage.style.width = `min(100%, ${(72 * ratio).toFixed(1)}vh)`;
    ui.setStatus("Camera on.");
    if (!loopStarted) {
      loopStarted = true;
      requestAnimationFrame(loop);
    }
  } catch (e) {
    console.error(e);
    ui.setStatus("Camera blocked or unavailable (needs HTTPS or localhost).");
  }
}

// ---------- per-frame work ----------
function toDetected(res) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const list = res.landmarks.map((lm) => {
    // landmarks come as 0..1 per axis; convert to pixels so the hand is not stretched
    const px = lm.map((p) => ({ x: p.x * vw, y: p.y * vh }));
    return { raw: lm, norm: normalizeHand(px), wristX: lm[0].x };
  });
  return list.sort((a, b) => a.wristX - b.wristX); // order by raw wrist x
}

function loop() {
  requestAnimationFrame(loop);
  if (video.readyState < 2 || video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;

  const t0 = performance.now();
  let ts = t0;
  if (ts <= lastTs) ts = lastTs + 1; // MediaPipe needs strictly increasing timestamps
  lastTs = ts;

  const detected = toDetected(detectHands(video, ts));
  drawLiveHands(overlay, detected);

  if (captureState) {
    handleCapture(detected, t0);
    return;
  }
  if (!state.active) return;

  const info = processFrame(detected, t0);
  metrics.frameMs.push(performance.now() - t0);

  if (state.roundId !== lastRoundId) newRound();

  if (info.phase === "play") {
    // Shadowmatic-style fill: the target lights up from the bottom as your hand matches it.
    // fill reaches 1 exactly when the score reaches PASS_SCORE.
    const fill = info.out.tracked
      ? Math.min(1, info.out.score / CONFIG.PASS_SCORE)
      : 0;
    drawTarget(
      targetCanvas,
      state.current,
      fill,
      fill >= 1 ? "#4dff88" : "#ffb300",
    );
    ui.setScore(info.out);
    ui.setTime(info.timeFrac);
    ui.setHold(info.holdFrac);
    handleTicks(info.remainingMs);
    if (info.ended) onRoundEnd(info.ended);
  }
}

function newRound() {
  lastRoundId = state.roundId;
  lastTickSec = null;
  ui.setTargetInfo(state.current);
  ui.setHandHint(state.current);
  ui.setAgentMessage(state.message);
  ui.flashResult("", true);
  drawTarget(targetCanvas, state.current, 0);
}

// ticking sound during the last seconds of a round
function handleTicks(remainingMs) {
  if (remainingMs > CONFIG.TICK_FROM_MS || remainingMs <= 0) return;
  const sec = Math.ceil(remainingMs / 1000);
  if (sec !== lastTickSec) {
    lastTickSec = sec;
    if (sec <= 2) sound.tickUrgent();
    else sound.tick();
  }
}

function onRoundEnd(e) {
  if (e.skipped) {
    ui.flashResult("Hands not detected, round skipped", false);
  } else if (e.passed) {
    sound.success();
    ui.flashResult(`Matched! +${e.points}`, true);
  } else {
    sound.fail();
    ui.flashResult("Time up", false);
  }
  if (e.leveledUp) {
    sound.levelUp();
    ui.flashResult(`LEVEL ${e.newLevel} UNLOCKED!`, true);
    ui.setAgentMessage(`New poses unlocked. Timers are getting shorter.`);
  }
  refreshPanels();
}

// ---------- developer pose capture ----------
function previewSelected() {
  const p = poses.find((x) => x.id === $("pose-select").value);
  drawTarget(targetCanvas, p);
  ui.setTargetInfo(p);
  ui.setHandHint(p);
}

function handleCapture(detected, now) {
  const cs = captureState;
  if (now < cs.startAt) {
    // countdown: shrinking time bar + a beep every second
    const left = cs.startAt - now;
    ui.setTime(left / CONFIG.CAPTURE_DELAY_MS);
    ui.setStatus(`Get into "${cs.pose.name}": ${Math.ceil(left / 1000)}`);
    const sec = Math.ceil(left / 1000);
    if (sec !== lastCountSec) {
      lastCountSec = sec;
      sound.countdownBeep();
    }
    return;
  }
  if (!cs.shutterDone) {
    cs.shutterDone = true;
    sound.shutter(); // "snapshot" starts now
  }
  ui.setTime(0);
  if (detected.length !== cs.pose.handsRequired) {
    ui.setStatus(`Need exactly ${cs.pose.handsRequired} hand(s) visible`);
    return;
  }
  cs.frames.push(detected.map((d) => d.norm));
  ui.setHold(cs.frames.length / CONFIG.CAPTURE_FRAMES);
  ui.setStatus(`Capturing ${cs.frames.length}/${CONFIG.CAPTURE_FRAMES}`);
  if (cs.frames.length >= CONFIG.CAPTURE_FRAMES) {
    const n = cs.frames.length;
    const avg = Array.from({ length: cs.pose.handsRequired }, (_, h) =>
      Array.from({ length: 21 }, (_, i) => ({
        x: cs.frames.reduce((s, f) => s + f[h][i].x, 0) / n,
        y: cs.frames.reduce((s, f) => s + f[h][i].y, 0) / n,
      })),
    );
    const hand = cs.pose.handsRequired === 2 ? "both" : $("hand-select").value;
    saveLandmarks(cs.pose.id, { hands: avg, hand });
    cs.pose.hands = avg;
    cs.pose.hand = hand;
    captureState = null;
    sound.success();
    ui.setHold(0);
    ui.fillPoseSelect(poses);
    previewSelected();
    refreshPanels();
    ui.setStatus(`Saved "${cs.pose.name}" (${hand}).`);
  }
}

// ---------- buttons ----------
$("btn-camera").onclick = enableCamera;

$("mode-select").onchange = () => {
  $("level-select").hidden = $("mode-select").value !== "practice";
};

$("btn-start").onclick = () => {
  if (!loopStarted) return ui.setStatus("Enable the camera first.");
  sound.unlockAudio();
  const mode = $("mode-select").value;
  const level = Number($("level-select").value) || 1;
  const r = startGame(poses, { mode, level });
  if (!r.ok) return ui.setStatus(r.error);
  lastRoundId = -1;
  refreshPanels();
  ui.setStatus(
    mode === "campaign"
      ? `Campaign, level ${state.level}`
      : `Practice, levels 1-${state.level}`,
  );
};

$("btn-stop").onclick = () => {
  stopGame();
  ui.setStatus("Stopped.");
  refreshPanels();
};

$("btn-reset").onclick = () => {
  if (!confirm("Reset all progress on this device?")) return;
  stopGame();
  resetProgress();
  state.score = null;
  refreshPanels();
  ui.setStatus("Progress reset.");
};

$("btn-sound").onclick = () => {
  sound.setMuted(!sound.isMuted());
  $("btn-sound").textContent = `Sound: ${sound.isMuted() ? "off" : "on"}`;
};

$("btn-log").onclick = () =>
  ui.downloadJSON("mimic_session.json", buildSummary());
$("modal-close").onclick = () => $("pose-modal").close();

// developer-only
$("btn-capture").onclick = () => {
  if (!loopStarted) return ui.setStatus("Enable the camera first.");
  if (state.active) return ui.setStatus("Stop the game before capturing.");
  sound.unlockAudio();
  const pose = poses.find((x) => x.id === $("pose-select").value);
  lastCountSec = null;
  captureState = {
    pose,
    frames: [],
    startAt: performance.now() + CONFIG.CAPTURE_DELAY_MS,
    shutterDone: false,
  };
};
$("btn-export-poses").onclick = () =>
  ui.downloadJSON("poses.json", collectLandmarks(poses));
$("pose-select").onchange = previewSelected;

boot();
