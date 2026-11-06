import "./style.css";
import { CONFIG } from "./config.js";
import { initHandTracker, detectHands } from "./camera/handTracker.js";
import { normalizeHand } from "./gestures/poseNormalizer.js";
import { comparePose } from "./gestures/poseMatcher.js";
import { poseMeta } from "./gestures/poseLibrary.js";
import {
  loadPoses,
  saveLandmarks,
  collectLandmarks,
} from "./gestures/poseStore.js";
import {
  fingerLengths,
  meanLengths,
  computeFactors,
  applyCalibration,
  loadCalibration,
  saveCalibration,
} from "./gestures/calibration.js";
import { createProfile, loadProfile } from "./agent/playerProfile.js";
import {
  startSession,
  stopGame,
  retryLevel,
  stepPractice,
  resetProgress,
  processFrame,
  state,
  metrics,
} from "./game/gameController.js";
import {
  buildLevels,
  flatLevels,
  unlockedPoses,
  allCleared,
} from "./game/campaign.js";
import { drawLiveHands, drawTarget } from "./ui/skeletonRenderer.js";
import { loadSettings, saveSettings } from "./settings.js";
import * as ui from "./ui/interface.js";
import * as sound from "./ui/sound.js";

// Developer tools (pose capture) only appear with `npm run dev` or ?dev=1.
const isLocalhost = ["localhost", "127.0.0.1", "[::1]"].includes(
  location.hostname,
);
const DEV =
  import.meta.env.DEV ||
  (isLocalhost && new URLSearchParams(location.search).has("dev"));

const $ = (id) => document.getElementById(id);
const video = $("video");
const overlay = $("overlay");
const stage = $("stage");
const targetCanvas = $("target-canvas");

const settings = loadSettings();
let calib = loadCalibration(); // per-finger length factors, or null
let poses = [];
let tiers = [];
let modelReady = false;
let camOn = false;
let stream = null;
let screen = "home";
let playMode = "campaign"; // campaign | arcade | practice | calibrate | dev
let currentLevel = null;
let captureState = null;
let calibState = null;
let afterCalib = null;
let lastRoundId = -1;
let lastVideoTime = -1;
let lastTs = 0;
let lastTickSec = null;
let lastCountSec = null;
let lastLive = 0;

const viewProfile = () => state.profile || loadProfile() || createProfile();
const openPalm = () => poses.find((p) => p.id === "open_palm" && p.hands);
// both hands must be calibrated (left, then right) before Campaign / Arcade / Practice
const calibrated = () => !!(calib && calib.Left && calib.Right);
const needsCalib = () => !!openPalm() && !calibrated();
// Arcade / Practice need at least one cleared campaign level
const hasCleared = () => unlockedPoses(tiers, viewProfile()).length > 0;

function updateModeLocks() {
  const cleared = hasCleared();
  $("mode-arcade").classList.toggle("locked", !cleared);
  $("mode-practice").classList.toggle("locked", !cleared);
  $("modes-note").textContent = needsCalib()
    ? "First, calibrate: left hand, then right hand. Tap any mode to start."
    : !cleared
      ? "Arcade and Practice unlock after you clear one campaign level."
      : "";
}

// run fn once both hands are calibrated (starts the calibration first if needed)
function gateCalibration(fn) {
  if (!needsCalib()) return fn();
  afterCalib = fn;
  enterPlay("calibrate");
}
// a pose's name is shown only after it has been passed once
const revealed = (pose) => !!viewProfile().completed[pose.id];

// ---------- navigation ----------
function show(name) {
  screen = name;
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.toggle("active", s.id === `screen-${name}`));
  if (name === "play") requestAnimationFrame(fitStage);
  if (name === "modes") updateModeLocks();
  clearResetCount(); // leaving / changing screen breaks the reset click streak
}

document.querySelectorAll("[data-back]").forEach((b) => {
  b.onclick = () => {
    if (b.dataset.back === "modes") rebuildLevels();
    show(b.dataset.back);
  };
});

// keep the camera view the same shape as the video, inside whatever space the layout gives it.
// portrait: camera on top, stats below | landscape: camera left, stats right (pure CSS grid)
function fitStage() {
  const wrap = $("stage-wrap").getBoundingClientRect();
  const ratio =
    video.videoWidth && video.videoHeight
      ? video.videoWidth / video.videoHeight
      : 4 / 3;
  let w = wrap.width;
  let h = w / ratio;
  if (h > wrap.height) {
    h = wrap.height;
    w = h * ratio;
  }
  stage.style.width = `${Math.floor(w)}px`;
  stage.style.height = `${Math.floor(h)}px`;
}
window.addEventListener("resize", fitStage);
window.addEventListener("orientationchange", () => setTimeout(fitStage, 250));

function rebuildLevels() {
  tiers = buildLevels(poses);
  ui.renderTiers(tiers, viewProfile(), pickLevel);
}

// ---------- settings toggles ----------
function updateToggles() {
  $("btn-camera").textContent = `Camera: ${camOn ? "ON" : "OFF"}`;
  $("btn-camera").classList.toggle("on", camOn);
  $("btn-sound").textContent = `Sound: ${settings.sound ? "ON" : "OFF"}`;
  $("btn-sound").classList.toggle("on", settings.sound);
}

async function setCamera(on) {
  // always release the old stream first, so the browser camera light really turns off
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
  video.srcObject = null;
  camOn = false;
  if (on) {
    try {
      // Every time the camera is switched ON we ask the browser for camera permission again.
      // getUserMedia IS the permission request: it shows the prompt if access is not granted yet.
      const big = window.innerWidth >= CONFIG.BIG_SCREEN_PX;
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: big ? CONFIG.CAMERA_W_BIG : CONFIG.CAMERA_W },
          height: { ideal: big ? CONFIG.CAMERA_H_BIG : CONFIG.CAMERA_H },
          facingMode: "user",
        },
        audio: false,
      });
      // permission removed in the browser (or camera taken by another app) while playing
      stream.getVideoTracks().forEach((t) => {
        t.onended = () => {
          camOn = false;
          stream = null;
          settings.camera = false;
          saveSettings(settings);
          updateToggles();
          ui.toast("Camera stopped. Check the browser camera permission.");
        };
      });
      video.srcObject = stream;
      await video.play();
      overlay.width = video.videoWidth;
      overlay.height = video.videoHeight;
      lastVideoTime = -1;
      camOn = true;
      fitStage();
    } catch (e) {
      console.error(e);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      stream = null;
      camOn = false;
      ui.toast(
        e && e.name === "NotAllowedError"
          ? "Camera permission denied. Allow the camera in the browser's site settings, then turn Camera ON again."
          : "Camera unavailable (needs HTTPS or localhost).",
      );
    }
  }
  settings.camera = camOn; // remembered for next time
  saveSettings(settings);
  updateToggles();
}

$("btn-camera").onclick = () => {
  sound.unlockAudio();
  setCamera(!camOn);
};
$("btn-sound").onclick = () => {
  settings.sound = !settings.sound;
  sound.setMuted(!settings.sound);
  saveSettings(settings);
  updateToggles();
  if (settings.sound) sound.success();
};

// reset progress: 20 successive clicks. Each click must come within RESET_GAP_MS of the previous
// one, and clicking anything else in between starts the count again from zero.
let resetClicks = 0;
let resetLast = 0;
let resetTimer = 0;
function setResetLabel() {
  $("btn-reset").textContent = resetClicks
    ? `Reset progress (${resetClicks}/${CONFIG.RESET_CLICKS})`
    : "Reset progress";
}
function clearResetCount() {
  clearTimeout(resetTimer);
  resetClicks = 0;
  setResetLabel();
}
$("btn-reset").onclick = () => {
  const now = performance.now();
  resetClicks = now - resetLast <= CONFIG.RESET_GAP_MS ? resetClicks + 1 : 1;
  resetLast = now;
  clearTimeout(resetTimer);
  if (resetClicks >= CONFIG.RESET_CLICKS) {
    clearResetCount();
    stopGame();
    resetProgress();
    state.score = null;
    rebuildLevels(); // levels refresh: everything is locked again except level 1
    updateModeLocks();
    ui.toast("Progress reset. Levels refreshed.");
    return;
  }
  resetTimer = setTimeout(clearResetCount, CONFIG.RESET_GAP_MS);
  setResetLabel();
};
// a click on anything other than the reset button breaks the streak of clicks
document.addEventListener(
  "pointerdown",
  (e) => {
    if (resetClicks && !e.target.closest("#btn-reset")) clearResetCount();
  },
  true,
);

// click sound on every enabled button (only plays when Sound is ON)
document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b && !b.disabled && b.id !== "btn-sound") sound.click();
});

// ---------- home / modes / campaign ----------
$("btn-start").onclick = () => {
  sound.unlockAudio();
  rebuildLevels();
  show("modes");
};
$("mode-campaign").onclick = () =>
  gateCalibration(() => {
    rebuildLevels();
    show("campaign");
  });
function openIfCleared(mode) {
  if (!hasCleared())
    return ui.toast("Clear at least one campaign level first.");
  enterPlay(mode);
}
$("mode-arcade").onclick = () => openIfCleared("arcade");
$("mode-practice").onclick = () => openIfCleared("practice");
$("btn-calibrate").onclick = () => {
  afterCalib = null;
  enterPlay("calibrate");
};
$("btn-dev").onclick = () => enterPlay("dev");

function pickLevel(lv) {
  currentLevel = lv;
  enterPlay("campaign", { pose: lv.pose });
}

async function enterPlay(mode, opts = {}) {
  sound.unlockAudio();
  if (!modelReady) return ui.toast("Hand model is still loading...");
  if (!camOn) await setCamera(true);
  if (!camOn) return;
  // both hands must be calibrated (left, then right) before any game mode
  if (!["calibrate", "dev"].includes(mode) && needsCalib()) {
    afterCalib = () => enterPlay(mode, opts);
    return enterPlay("calibrate");
  }
  playMode = mode;
  captureState = null;
  calibState = null;
  lastRoundId = -1;
  ui.applyModeVisibility(mode);
  $("end-panel").hidden = true;
  ui.flashResult("", true);
  ui.setHold(0);
  ui.setTime(1);
  ui.setScore(null);
  drawTarget(targetCanvas, null);
  show("play");

  if (mode === "calibrate") {
    $("play-title").textContent = "Finger calibration";
    ui.setTargetInfo(null);
    ui.setHandHint(null);
    ui.setStatus("");
    ui.setAgentMessage(calibMessage(0));
    calibState = {
      step: 0, // 0 = first hand (LEFT), 1 = second hand (RIGHT)
      good: 0,
      lens: [],
      labels: [],
      firstLabel: null,
      factors: {},
      done: false,
    };
    calibState = { good: 0, lens: [], done: false };
    drawTarget(targetCanvas, openPalm(), 0);
    return;
  }
  if (mode === "dev") {
    $("play-title").textContent = "Developer: capture";
    ui.fillPoseSelect(poses);
    previewSelected();
    ui.setAgentMessage("Pick a pose, press Capture, hold it for 3s + 1s.");
    return;
  }
  const prof = viewProfile();
  const r = startSession(poses, {
    mode,
    pose: opts.pose,
    pool: unlockedPoses(tiers, prof), // cleared levels only (names already revealed)
    streakMode: allCleared(tiers, prof), // streak only counts once every level is cleared
  });
  if (!r.ok) {
    ui.toast(r.error);
    show(mode === "campaign" ? "campaign" : "modes");
    return;
  }
  $("play-title").textContent =
    mode === "campaign"
      ? `Level ${currentLevel.number}`
      : mode === "arcade"
        ? "Arcade"
        : "Practice";
  ui.setStatus(
    mode === "campaign"
      ? ""
      : mode === "arcade"
        ? "Endless, timed"
        : "No timer",
  );
  if (mode === "campaign")
    $("level-info").textContent = `Level ${currentLevel.number}`;
  refreshSide();
  ui.renderLive(null);
}

function leavePlay() {
  const was = playMode;
  stopGame();
  captureState = null;
  calibState = null;
  afterCalib = null;
  if (was === "campaign") {
    rebuildLevels();
    show("campaign");
  } else if (was === "dev") {
    show("home");
  } else {
    show("modes");
  }
}
$("btn-play-back").onclick = leavePlay;

function refreshSide() {
  const prof = viewProfile();
  ui.renderProgress(prof, state.score, state.streakMode);
  ui.renderWeak(prof);
}

// ---------- per-frame work ----------
function toDetected(res) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const hd = res.handedness || res.handednesses || [];
  const list = res.landmarks.map((lm, i) => {
    const label = (hd[i] && hd[i][0] && hd[i][0].categoryName) || "Left";
    // landmarks are 0..1 per axis; convert to pixels so the hand is not stretched
    const px = lm.map((p) => ({ x: p.x * vw, y: p.y * vh }));
    const base = normalizeHand(px);
    return {
      raw: lm,
      base, // uncalibrated (used when the developer captures poses)
      norm: applyCalibration(base, calib && calib[label]), // this hand's calibration
      label, // tracker's own "Left" / "Right" label (calibration is saved under it)
      wristX: lm[0].x,
    };
  });
  return list.sort((a, b) => a.wristX - b.wristX);
}

function loop() {
  requestAnimationFrame(loop);
  if (screen !== "play" || !camOn) return; // no tracking in menus
  if (video.readyState < 2 || video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;

  const t0 = performance.now();
  let ts = t0;
  if (ts <= lastTs) ts = lastTs + 1; // MediaPipe needs strictly increasing timestamps
  lastTs = ts;

  const detected = toDetected(detectHands(video, ts));
  drawLiveHands(overlay, detected);

  if (playMode === "calibrate") return handleCalibration(detected);
  if (captureState) return handleCapture(detected, t0);
  if (!state.active) return;

  const info = processFrame(detected, t0);
  if (info.phase === "idle") return;
  metrics.frameMs.push(performance.now() - t0);
  if (metrics.frameMs.length > 5000) metrics.frameMs.shift();

  if (state.roundId !== lastRoundId) newRound();

  if (info.phase === "play") {
    // the target lights up from the bottom as the hand matches it (full at PASS_SCORE)
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
    if (state.mode !== "practice") ui.setTime(info.timeFrac);
    ui.setHold(info.holdFrac);
    if (t0 - lastLive > 100) {
      lastLive = t0;
      ui.renderLive(info.out.tracked ? info.out.perFinger : null);
    }
    handleTicks(info.remainingMs);
    if (info.ended) onRoundEnd(info.ended);
  }
}

function newRound() {
  lastRoundId = state.roundId;
  lastTickSec = null;
  // arcade / practice only use cleared poses, so their names are always shown (no "?????")
  ui.setTargetInfo(
    state.current,
    state.mode !== "campaign" || revealed(state.current),
  );
  ui.setHandHint(state.current);
  ui.setAgentMessage(state.message);
  ui.flashResult("", true);
  $("end-panel").hidden = true;
  drawTarget(targetCanvas, state.current, 0);
}

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
    ui.setTargetInfo(state.current, true); // name is now discovered
    ui.flashResult(e.points ? `Matched! +${e.points}` : "Matched!", true);
    if (e.firstClear) ui.setAgentMessage(`Discovered: ${e.poseName}`);
  } else {
    sound.fail();
    ui.flashResult("Time up", false);
  }
  refreshSide();
  if (state.mode === "campaign") showEndPanel(e);
}

function showEndPanel(e) {
  const flat = flatLevels(tiers);
  const next = e.passed ? flat[currentLevel.number] : null; // number is 1-based = index of next
  $("end-title").textContent = e.passed
    ? `Level ${currentLevel.number} cleared: ${e.poseName}`
    : "Try again?";
  $("end-retry").hidden = e.passed;
  $("end-next").hidden = !next;
  $("end-panel").hidden = false;
}
$("end-retry").onclick = () => {
  $("end-panel").hidden = true;
  retryLevel();
};
$("end-next").onclick = () => {
  const next = flatLevels(tiers)[currentLevel.number];
  if (next) pickLevel(next);
};
$("end-levels").onclick = leavePlay;

// ---------- practice ----------
$("prac-prev").onclick = () => stepPractice(-1);
$("prac-next").onclick = () => stepPractice(1);

// ---------- finger calibration (left hand first, then right hand) ----------
const calibMessage = (step) =>
  `Calibration ${step + 1}/2: show your ${step === 0 ? "LEFT" : "RIGHT"} hand, OPEN PALM, fingers spread. Hold still.`;

function handleCalibration(detected) {
  const cs = calibState;
  const open = openPalm();
  if (!cs || cs.done || !open) return;
  // best open-palm match among visible hands (uncalibrated)
  let best = null;
  for (const d of detected) {
    if (cs.step === 1 && d.label === cs.firstLabel) continue; // 2nd step must be the other hand
    const r = comparePose(open, [{ norm: d.base }]);
    if (r.tracked && (!best || r.score > best.score))
      best = { score: r.score, d };
  }
  if (best && best.score >= CONFIG.CALIB_MIN_SCORE) {
    cs.good++;
    cs.lens.push(fingerLengths(best.d.base));
    cs.labels.push(best.d.label);
  } else {
    cs.good = Math.max(0, cs.good - 2);
  }
  ui.setHold(cs.good / CONFIG.CALIB_FRAMES);
  drawTarget(targetCanvas, open, cs.good / CONFIG.CALIB_FRAMES, "#00e5ff");
  ui.setScore(best ? { tracked: true, score: best.score } : null);
  if (cs.good < CONFIG.CALIB_FRAMES) return;

  const lens = cs.lens.slice(-CONFIG.CALIB_FRAMES);
  const labels = cs.labels.slice(-CONFIG.CALIB_FRAMES);
  const label =
    labels.filter((l) => l === "Left").length * 2 >= labels.length
      ? "Left"
      : "Right";
  cs.factors[label] = computeFactors(
    fingerLengths(open.hands[0]),
    meanLengths(lens),
  );
  sound.success();

  if (cs.step === 0) {
    // first hand saved, now ask for the other one
    cs.firstLabel = label;
    cs.step = 1;
    cs.good = 0;
    cs.lens = [];
    cs.labels = [];
    ui.setHold(0);
    ui.flashResult("First hand done!", true);
    ui.setAgentMessage(calibMessage(1));
    return;
  }

  cs.done = true;
  calib = cs.factors; // { Left: [...], Right: [...] }
  saveCalibration(calib);
  ui.flashResult("Both hands calibrated!", true);
  ui.setAgentMessage("Calibration saved for both hands.");
  const go = afterCalib;
  afterCalib = null;
  setTimeout(() => {
    if (screen !== "play" || playMode !== "calibrate") return; // player already left
    if (go) go();
    else show("modes");
  }, 1000);
}

// ---------- developer pose capture ----------
function previewSelected() {
  const p = poses.find((x) => x.id === $("pose-select").value);
  drawTarget(targetCanvas, p);
  ui.setTargetInfo(p, true);
  ui.setHandHint(p);
}
$("pose-select").onchange = previewSelected;

$("btn-capture").onclick = () => {
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

function handleCapture(detected, now) {
  const cs = captureState;
  if (now < cs.startAt) {
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
    sound.shutter();
  }
  ui.setTime(0);
  if (detected.length !== cs.pose.handsRequired) {
    ui.setStatus(`Need exactly ${cs.pose.handsRequired} hand(s) visible`);
    return;
  }
  cs.frames.push(detected.map((d) => d.base)); // UNcalibrated: targets must be the raw hand
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
    ui.setStatus(`Saved "${cs.pose.name}" (${hand}).`);
  }
}

// ---------- boot ----------
async function boot() {
  sound.setMuted(!settings.sound);
  window.addEventListener("pointerdown", () => sound.unlockAudio(), {
    once: true,
  });
  $("btn-dev").hidden = !DEV;
  updateToggles();
  requestAnimationFrame(loop);
  try {
    ui.setHomeStatus("Loading hand model...");
    await initHandTracker();
    poses = await loadPoses(poseMeta, DEV);
    modelReady = true;
    rebuildLevels();
    updateModeLocks();
    const n = poses.filter((p) => p.hands).length;
    ui.setHomeStatus(`Ready. ${n} poses loaded.`);
  } catch (e) {
    console.error(e);
    ui.setHomeStatus(
      "Model failed to load. Check public/wasm and public/models (see console).",
    );
  }
  if (settings.camera) setCamera(true); // remembered from last time
}

boot();
