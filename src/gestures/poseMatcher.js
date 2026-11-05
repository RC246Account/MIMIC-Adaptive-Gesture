import { CONFIG } from "../config.js";

// landmark indices per finger: thumb, index, middle, ring, pinky
const FINGERS = [
  [1, 2, 3, 4],
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
];

// Mean landmark distance per finger, plus overall mean (D).
export function compareHand(target, player) {
  const perFinger = FINGERS.map(
    (idx) =>
      idx.reduce(
        (s, i) =>
          s + Math.hypot(target[i].x - player[i].x, target[i].y - player[i].y),
        0,
      ) / idx.length,
  );
  const D = perFinger.reduce((a, b) => a + b, 0) / 5;
  return { D, perFinger };
}

export function toScore(D) {
  return 100 * Math.max(0, 1 - D / CONFIG.K);
}

const mirror = (hand) => hand.map((p) => ({ x: -p.x, y: p.y }));

// pose.hands: array of normalized hands (1 or 2), sorted by raw wrist x.
// detected: [{ norm, ... }] sorted by raw wrist x (same order as pose.hands).
export function comparePose(pose, detected) {
  const need = pose.handsRequired;
  if (!pose.hands || detected.length < need) {
    return { tracked: false, score: 0, D: null, perFinger: null };
  }
  let parts;
  if (need === 1) {
    // try every visible hand, and its mirror image so left/right hand both work
    let best = null;
    for (const h of detected) {
      for (const cand of [h.norm, mirror(h.norm)]) {
        const r = compareHand(pose.hands[0], cand);
        if (!best || r.D < best.D) best = r;
      }
    }
    parts = [best];
  } else {
    parts = [0, 1].map((i) => compareHand(pose.hands[i], detected[i].norm));
  }
  const D = parts.reduce((s, p) => s + p.D, 0) / parts.length;
  // two-hand poses: finger errors of both hands are averaged (limitation to state in paper)
  const perFinger = [0, 1, 2, 3, 4].map(
    (i) => parts.reduce((s, p) => s + p.perFinger[i], 0) / parts.length,
  );
  return { tracked: true, score: toScore(D), D, perFinger };
}
