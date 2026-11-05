import { FINGER_NAMES, weakestFingers } from "../agent/playerProfile.js";
import { CONFIG } from "../config.js";
import { drawTarget, drawLocked } from "./skeletonRenderer.js";

const $ = (id) => document.getElementById(id);

export const setStatus = (t) => ($("status").textContent = t);
export const setAgentMessage = (t) => ($("agent-message").textContent = t);

export function setTargetInfo(pose) {
  $("target-name").textContent = pose
    ? `${pose.name}  (level ${pose.difficulty})`
    : "Press Start";
}

// Suggested hand for the pose (from the "hand" the developer used when capturing it)
export function setHandHint(pose) {
  const el = $("hand-hint");
  if (!pose) return (el.textContent = "");
  if (pose.handsRequired === 2) el.textContent = "Use BOTH hands";
  else if (pose.hand === "left") el.textContent = "Suggested: LEFT hand";
  else if (pose.hand === "right") el.textContent = "Suggested: RIGHT hand";
  else el.textContent = "Either hand";
}

export function setScore(out) {
  $("score-value").textContent =
    out && out.tracked ? `${Math.round(out.score)}%` : "no hands";
}

// frac 1 = full time left, 0 = out of time
export function setTime(frac) {
  const f = $("time-fill");
  f.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
  f.className = frac < 0.3 ? "low" : "";
}
export const setHold = (frac) =>
  ($("hold-fill").style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`);

export function flashResult(text, ok) {
  const el = $("result");
  el.textContent = text;
  el.className = ok ? "ok" : "bad";
}

export function renderProgress(profile, session, mode) {
  $("level").textContent = profile.unlockedLevel;
  $("points").textContent = profile.totalPoints;
  $("streak").textContent = session ? session.streak : 0;
  $("accuracy").textContent =
    session && session.attempts
      ? `${Math.round((100 * session.passes) / session.attempts)}%`
      : "--";
  const need = CONFIG.LEVEL_UP_POINTS[profile.unlockedLevel - 1];
  const maxed = profile.unlockedLevel >= CONFIG.MAX_LEVEL;
  $("level-fill").style.width = maxed
    ? "100%"
    : `${Math.min(100, (profile.levelPoints / need) * 100)}%`;
  $("level-label").textContent = maxed
    ? "Max level"
    : `${profile.levelPoints}/${need} to level ${profile.unlockedLevel + 1}`;
}

export function fillLevelSelect(unlocked) {
  const sel = $("level-select");
  const keep = sel.value;
  sel.innerHTML = "";
  for (let l = 1; l <= unlocked; l++) {
    const o = document.createElement("option");
    o.value = l;
    o.textContent = `Practice levels 1-${l}`;
    sel.appendChild(o);
  }
  sel.value = keep && Number(keep) <= unlocked ? keep : String(unlocked);
}

// ---------- collection ----------
export function renderCollection(poses, profile, onOpen) {
  const box = $("collection");
  box.innerHTML = "";
  for (const p of poses) {
    if (!p.hands) continue; // not captured, so not shown to players
    const locked = p.difficulty > profile.unlockedLevel;
    const st = profile.poseStats[p.id];
    const card = document.createElement("button");
    card.className = "card" + (locked ? " locked" : "");
    const cv = document.createElement("canvas");
    cv.width = 160;
    cv.height = 120;
    if (locked) drawLocked(cv, `Lv ${p.difficulty}`);
    else drawTarget(cv, p);
    const label = document.createElement("div");
    label.className = "card-label";
    label.textContent = `${locked ? "?" : p.name}${st && st.passes ? "  \u2605" : ""}`;
    card.append(cv, label);
    card.onclick = () => onOpen(p, locked);
    box.appendChild(card);
  }
}

export function openPoseModal(pose, stats, locked) {
  $("modal-title").textContent = locked
    ? `Locked (reach level ${pose.difficulty})`
    : pose.name;
  const cv = $("modal-canvas");
  if (locked) drawLocked(cv, `Level ${pose.difficulty}`);
  else drawTarget(cv, pose);
  if (locked) {
    $("modal-body").textContent =
      "Keep earning points in Campaign mode to unlock this pose.";
  } else {
    const tested = pose.fingerDemand
      .map((d, i) => (d >= 0.7 ? FINGER_NAMES[i] : null))
      .filter(Boolean);
    const hand =
      pose.handsRequired === 2
        ? "Both hands"
        : pose.hand
          ? `${pose.hand} hand`
          : "either hand";
    const avg =
      stats && stats.attempts
        ? Math.round(stats.scoreSum / stats.attempts)
        : null;
    $("modal-body").innerHTML =
      `Level ${pose.difficulty} &middot; ${hand}<br>` +
      `Fingers that matter: ${tested.length ? tested.join(", ") : "whole hand"}<br>` +
      (stats && stats.attempts
        ? `Attempts ${stats.attempts} &middot; Passed ${stats.passes}<br>Best match ${stats.bestScore}% &middot; Average ${avg}%`
        : "Not attempted yet.");
  }
  $("pose-modal").showModal();
}

// ---------- stats ----------
export function renderStats(profile, poses) {
  const weak = weakestFingers(profile, 2);
  const bars = profile.fingerWeakness
    .map(
      (w, i) =>
        `<div class="frow"><span>${FINGER_NAMES[i]}</span><div class="bar"><div class="fill amber" style="width:${Math.round(w * 100)}%"></div></div></div>`,
    )
    .join("");
  const rows = poses
    .filter((p) => profile.poseStats[p.id])
    .map((p) => {
      const s = profile.poseStats[p.id];
      return `<tr><td>${p.name}</td><td>${s.attempts}</td><td>${s.passes}</td><td>${s.bestScore}%</td><td>${Math.round(s.scoreSum / s.attempts)}%</td></tr>`;
    })
    .join("");
  const hasData = profile.history.length > 0;
  $("stats").innerHTML =
    `<p>${hasData ? `Your weakest fingers right now: ${weak.map((w) => w.name).join(" and ")}. Expect more poses that use them.` : "Play a few rounds and the game will learn which fingers need work."}</p>` +
    bars +
    (rows
      ? `<table><tr><th>Pose</th><th>Tries</th><th>Passed</th><th>Best</th><th>Avg</th></tr>${rows}</table>`
      : "");
}

// ---------- developer capture ----------
export function fillPoseSelect(poses) {
  const sel = $("pose-select");
  const keep = sel.value;
  sel.innerHTML = "";
  for (const p of poses) {
    const o = document.createElement("option");
    o.value = p.id;
    o.textContent = `${p.hands ? "[x] " : "[ ] "}L${p.difficulty} ${p.name}`;
    sel.appendChild(o);
  }
  if (keep) sel.value = keep;
}

export function downloadJSON(name, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
