// Finger-length calibration.
// Problem: fingers differ in length between people, so a long-fingered player gets a lower
// score than the developer who recorded the target poses.
// Fix: the player shows an OPEN PALM once. We measure each finger's length (in palm units, after
// normalization) and compare it with the same finger in the developer's open_palm target.
// factor[i] = targetLength / playerLength. Every later frame, each finger is rescaled
// from its base joint by that factor before matching.
import { CONFIG } from "../config.js";

const KEY = "mimic_calib_v1";
// finger chains: base joint first, tip last (thumb, index, middle, ring, pinky)
const FINGERS = [
  [1, 2, 3, 4],
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// length of each finger = sum of its 3 bone segments (normalized hand, palm size = 1)
export function fingerLengths(hand) {
  return FINGERS.map((f) => {
    let s = 0;
    for (let k = 0; k < 3; k++)
      s += Math.hypot(
        hand[f[k + 1]].x - hand[f[k]].x,
        hand[f[k + 1]].y - hand[f[k]].y,
      );
    return s;
  });
}

export function meanLengths(list) {
  return [0, 1, 2, 3, 4].map(
    (i) => list.reduce((s, l) => s + l[i], 0) / list.length,
  );
}

export function computeFactors(refLengths, playerLengths) {
  return refLengths.map((r, i) =>
    clamp(r / (playerLengths[i] || 1e-6), CONFIG.CALIB_MIN, CONFIG.CALIB_MAX),
  );
}

// Returns a new hand with each finger rescaled from its base joint.
export function applyCalibration(hand, factors) {
  if (!factors) return hand;
  const out = hand.map((p) => ({ x: p.x, y: p.y }));
  FINGERS.forEach((idx, i) => {
    const b = hand[idx[0]];
    for (let k = 1; k < 4; k++) {
      out[idx[k]] = {
        x: b.x + (hand[idx[k]].x - b.x) * factors[i],
        y: b.y + (hand[idx[k]].y - b.y) * factors[i],
      };
    }
  });
  return out;
}

export function loadCalibration() {
  try {
    const f = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(f) && f.length === 5 ? f : null;
  } catch {
    return null;
  }
}
export function saveCalibration(f) {
  try {
    localStorage.setItem(KEY, JSON.stringify(f));
  } catch {}
}
export function clearCalibration() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
