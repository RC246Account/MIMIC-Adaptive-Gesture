import { FINGER_NAMES, weakestFingers } from "../agent/playerProfile.js";
import { CONFIG } from "../config.js";
import { levelState } from "../game/campaign.js";

const $ = (id) => document.getElementById(id);

export const setHomeStatus = (t) => ($("home-status").textContent = t);
export const setStatus = (t) => ($("play-status").textContent = t);
export const setAgentMessage = (t) => ($("agent-message").textContent = t);

let toastTimer = 0;
export function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

// Show only the elements whose data-show list contains the current play mode.
export function applyModeVisibility(mode) {
  document.querySelectorAll("#screen-play [data-show]").forEach((el) => {
    el.hidden = !el.dataset.show.split(" ").includes(mode);
  });
}

// reveal = true -> real name; otherwise "?????" (name is discovered after the first pass)
export function setTargetInfo(pose, reveal) {
  $("target-name").textContent = pose ? (reveal ? pose.name : "?????") : "";
}

export function setHandHint(pose) {
  const el = $("hand-hint");
  if (!pose) return (el.textContent = "");
  if (pose.handsRequired === 2) el.textContent = "Use BOTH hands";
  else if (pose.hand === "left") el.textContent = "Suggested: LEFT hand";
  else if (pose.hand === "right") el.textContent = "Suggested: RIGHT hand";
  else el.textContent = "Either hand";
}

export function setScore(out) {
  const chip = $("score-value");
  chip.textContent =
    out && out.tracked ? `${Math.round(out.score)}%` : "no hands";
  $("score-chip").className =
    out && out.tracked && out.score >= CONFIG.PASS_SCORE ? "good" : "";
}

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

// ---------- live per-finger similarity (guides the player) ----------
export function renderLive(perFinger) {
  const box = $("live-bars");
  if (!box.children.length) {
    box.innerHTML = FINGER_NAMES.map(
      (n) =>
        `<div class="frow"><span>${n}</span><div class="bar"><div class="fill"></div></div><b>--</b></div>`,
    ).join("");
  }
  FINGER_NAMES.forEach((_, i) => {
    const row = box.children[i];
    const fill = row.querySelector(".fill");
    const val = row.querySelector("b");
    if (!perFinger) {
      fill.style.width = "0%";
      val.textContent = "--";
      return;
    }
    const pct = Math.round(100 * Math.max(0, 1 - perFinger[i] / CONFIG.K));
    fill.style.width = `${pct}%`;
    fill.className = "fill " + (pct >= CONFIG.PASS_SCORE ? "green" : "amber");
    val.textContent = `${pct}%`;
  });
}

// ---------- long-term stats (agent's estimate of finger weakness) ----------
export function renderWeak(profile) {
  const weak = weakestFingers(profile, 2);
  const has = profile.history.length > 0;
  $("weak-text").textContent = has
    ? `Weakest now: ${weak.map((w) => w.name).join(" and ")}. The agent picks poses that train them.`
    : "Play a few rounds and the agent will learn which fingers need work.";
  $("weak-bars").innerHTML = profile.fingerWeakness
    .map(
      (w, i) =>
        `<div class="frow"><span>${FINGER_NAMES[i]}</span><div class="bar"><div class="fill amber" style="width:${Math.round(w * 100)}%"></div></div><b>${Math.round(w * 100)}%</b></div>`,
    )
    .join("");
}

export function renderProgress(profile, session, streakOn = false) {
  $("points").textContent = profile.totalPoints;
  // streak mode only unlocks when every campaign level is cleared
  $("streak").textContent = streakOn
    ? session
      ? session.streak
      : 0
    : "locked";
  $("streak").title = streakOn ? "" : "Clear all levels to unlock streak mode";
  $("accuracy").textContent =
    session && session.attempts
      ? `${Math.round((100 * session.passes) / session.attempts)}%`
      : "--";
  $("cleared").textContent = Object.keys(profile.completed).length;
}

// ---------- campaign level select ----------
export function renderTiers(tiers, profile, onPick) {
  const box = $("tiers");
  box.innerHTML = "";
  for (const t of tiers) {
    if (!t.levels.length) continue;
    const sec = document.createElement("div");
    sec.className = `tier tier-${t.id}`;
    const h = document.createElement("h3");
    h.textContent = t.label;
    const row = document.createElement("div");
    row.className = "lv-row";
    for (const lv of t.levels) {
      const { open, done } = levelState(tiers, profile, lv);
      const cell = document.createElement("div");
      cell.className = "lv-cell";
      const b = document.createElement("button");
      b.className = "lv" + (open ? "" : " locked") + (done ? " done" : "");
      b.disabled = !open;
      b.textContent = lv.number;
      b.onclick = () => onPick(lv);
      cell.append(b);
      if (done) {
        const l = document.createElement("div"); // label only once the level is done
        l.className = "lv-label";
        l.textContent = lv.pose.name;
        cell.append(l);
      }
      row.append(cell);
    }
    sec.append(h, row);
    box.append(sec);
  }
  if (!box.children.length) box.textContent = "No poses captured yet.";
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
