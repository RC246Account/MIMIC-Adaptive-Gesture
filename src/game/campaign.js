// Campaign structure. One level = one captured pose.
// Tiers come from CONFIG.TIERS; levels are numbered 1..N across all tiers.
// A level is unlocked when the previous level is completed (level 1 is always open).
import { CONFIG } from "../config.js";

export function buildLevels(poses) {
  const usable = poses.filter(
    (p) => p.hands && p.hands.length === p.handsRequired,
  );
  let n = 0;
  return CONFIG.TIERS.map((t) => ({
    ...t,
    levels: usable
      .filter((p) => t.diffs.includes(p.difficulty))
      .map((p) => ({ number: ++n, pose: p })),
  }));
}

export const flatLevels = (tiers) => tiers.flatMap((t) => t.levels);

export function levelState(tiers, profile, lv) {
  const flat = flatLevels(tiers);
  const done = !!profile.completed[lv.pose.id];
  const prev = flat[lv.number - 2];
  const open = done || !prev || !!profile.completed[prev.pose.id];
  return { open, done };
}

// Poses that Arcade / Practice may use = only levels already CLEARED (their names are revealed,
// so no "?????" poses). No cleared level yet = empty list = Arcade/Practice stay locked.
export function unlockedPoses(tiers, profile) {
  return flatLevels(tiers)
    .filter((lv) => profile.completed[lv.pose.id])
    .map((lv) => lv.pose);
}

// Streak mode turns on only when EVERY level is cleared.
export function allCleared(tiers, profile) {
  const flat = flatLevels(tiers);
  return flat.length > 0 && flat.every((lv) => profile.completed[lv.pose.id]);
}
