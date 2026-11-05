import { CONFIG } from "../config.js";
import { FINGER_NAMES } from "./playerProfile.js";

const sum = (a) => a.reduce((x, y) => x + y, 0);

// Perceive -> (profile already updated) -> Decide -> Act (returns the next pose).
// V2: the pool is every pose up to the player's selected level (review poses included).
// Utility of a candidate = how much it exercises the player's weak fingers
//                          + small bonus for poses of the current level
//                          - small penalty for poses seen very recently.
// OLD signature: selectNextChallenge(profile, poses, eps = CONFIG.EPSILON)
export function selectNextChallenge(profile, poses, level = profile.unlockedLevel, eps = CONFIG.EPSILON) {
  const last = profile.history.length ? profile.history[profile.history.length - 1].poseId : null;
  const recent = profile.history.slice(-3).map((h) => h.poseId);
  let allowed = poses.filter((p) => p.difficulty <= level);
  if (allowed.length === 0) allowed = poses;
  let pool = allowed.filter((p) => p.id !== last);
  if (pool.length === 0) pool = allowed;

  if (Math.random() < eps) {
    const pose = pool[Math.floor(Math.random() * pool.length)];
    return { pose, reason: "explore", message: "Mixing it up with a random pose." };
  }

  const scored = pool
    .map((p) => {
      const coverage =
        p.fingerDemand.reduce((s, d, i) => s + d * profile.fingerWeakness[i], 0) / sum(p.fingerDemand);
      // OLD (v1 ceiling rule): const levelGap = Math.max(0, p.difficulty - profile.level - 1);
      // OLD: return { p, u: coverage - CONFIG.LEVEL_WEIGHT * levelGap - novelty };
      const levelBonus = p.difficulty === level ? CONFIG.LEVEL_BONUS : 0;
      const novelty = recent.includes(p.id) ? CONFIG.NOVELTY_PENALTY : 0;
      return { p, u: coverage + levelBonus - novelty };
    })
    .sort((a, b) => b.u - a.u);

  const best = scored[0].p;

  // the weakest finger this pose tests, used for the on-screen message
  let wi = 0;
  let wv = -1;
  best.fingerDemand.forEach((d, i) => {
    const v = d * profile.fingerWeakness[i];
    if (v > wv) {
      wv = v;
      wi = i;
    }
  });

  let message;
  if (profile.history.length === 0) {
    message = `Warm-up at level ${level}.`;
  } else if (profile.fingerWeakness[wi] > 0.6) {
    message = `Your ${FINGER_NAMES[wi]} has been the shakiest, so this pose works it.`;
  } else {
    message = `You are steady, so here is a level ${best.difficulty} pose.`;
  }
  return { pose: best, reason: FINGER_NAMES[wi], message };
}
