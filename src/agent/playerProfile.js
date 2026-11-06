import { CONFIG } from "../config.js";

export const FINGER_NAMES = ["thumb", "index", "middle", "ring", "pinky"];
const KEY = "mimic_profile_v2"; // OLD: "mimic_profile_v1" (v1 had no levels or pose stats)

export function createProfile() {
  return {
    fingerWeakness: [0.5, 0.5, 0.5, 0.5, 0.5], // 0 = solid, 1 = very weak
    // OLD: level: 1,                          // auto-adjusted from the last 5 rounds
    unlockedLevel: 1, // highest campaign level reached
    levelPoints: 0, // points collected toward the next level
    totalPoints: 0,
    history: [], // one entry per finished round (last 300)
    poseStats: {}, // id -> { attempts, passes, bestScore, scoreSum }
    completed: {}, // V3: poseId -> true once passed (unlocks next campaign level, reveals the name)
  };
}

// r = { pose, passed, perFinger, score?, timeMs? }
export function updateProfile(profile, r) {
  const a = CONFIG.EMA_ALPHA;
  // only fingers the pose actually tests get updated
  profile.fingerWeakness = profile.fingerWeakness.map((w, i) =>
    r.pose.fingerDemand[i] >= 0.5
      ? (1 - a) * w + a * Math.min(1, r.perFinger[i] / CONFIG.K)
      : w,
  );
  profile.history.push({
    poseId: r.pose.id,
    category: r.pose.category,
    passed: r.passed,
    score: r.score ?? null,
    timeMs: r.timeMs ?? null,
  });
  if (profile.history.length > 300) profile.history.shift();

  const st =
    profile.poseStats[r.pose.id] ||
    (profile.poseStats[r.pose.id] = {
      attempts: 0,
      passes: 0,
      bestScore: 0,
      scoreSum: 0,
    });
  st.attempts++;
  if (r.passed) st.passes++;
  st.bestScore = Math.max(st.bestScore, Math.round(r.score || 0));
  st.scoreSum += r.score || 0;

  // OLD level rule (removed, level now comes from points, see awardPoints):
  // const recent = profile.history.slice(-5);
  // if (recent.length === 5) {
  //   const rate = recent.filter((h) => h.passed).length / 5;
  //   if (rate >= 0.8) profile.level = Math.min(3, profile.level + 1);
  //   else if (rate <= 0.4) profile.level = Math.max(1, profile.level - 1);
  // }
}

// Adds points. In campaign mode they also count toward the next level.
// Returns true if this unlocked a new level.
export function awardPoints(profile, pts, campaign) {
  profile.totalPoints += pts;
  if (!campaign || profile.unlockedLevel >= CONFIG.MAX_LEVEL) return false;
  profile.levelPoints += pts;
  if (
    profile.levelPoints >= CONFIG.LEVEL_UP_POINTS[profile.unlockedLevel - 1]
  ) {
    profile.unlockedLevel++;
    profile.levelPoints = 0;
    return true;
  }
  return false;
}

export function weakestFingers(profile, n = 2) {
  return profile.fingerWeakness
    .map((w, i) => ({ name: FINGER_NAMES[i], w }))
    .sort((a, b) => b.w - a.w)
    .slice(0, n);
}

export function saveProfile(profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {}
}

export function loadProfile() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY));
    // basic shape check so a broken save never crashes the game
    if (
      p &&
      Array.isArray(p.fingerWeakness) &&
      p.unlockedLevel &&
      p.poseStats
    ) {
      p.completed = p.completed || {}; // V3: older saves have no "completed"
      return p;
    }
    return null;
  } catch {
    return null;
  }
}
