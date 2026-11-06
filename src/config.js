// All tunable numbers live here (report them in the paper, "parameter settings").
// V3: campaign levels = one pose per level, tiers EASY/MEDIUM/HARD, calibration, reset-by-clicks.
export const CONFIG = {
  K: 0.6, // tolerance in toScore(); bigger = more forgiving
  PASS_SCORE: 75, // minimum similarity (0-100) to count as a match
  HOLD_MS: 700, // pose must stay above PASS_SCORE this long
  BASE_TIME_MS: { 1: 8000, 2: 10000, 3: 13000, 4: 15000 }, // time limit by pose difficulty
  ARCADE_TIME_FACTOR: 0.8, // arcade = a little faster than campaign
  MIN_TIME_MS: 3500,
  TICK_FROM_MS: 5000, // ticking sound starts when this much time is left
  RESULT_PAUSE_MS: 1200, // pause between rounds
  CAPTURE_FRAMES: 30, // developer capture
  CAPTURE_DELAY_MS: 3000,
  EPSILON: 0.1, // agent exploration rate
  EMA_ALPHA: 0.3, // finger weakness smoothing
  LEVEL_BONUS: 0.15, // (used by simulate.js)
  NOVELTY_PENALTY: 0.15, // agent: penalty for a pose seen in the last 3 rounds
  MAX_LEVEL: 4, // (used by simulate.js)
  LEVEL_UP_POINTS: [300, 400, 500], // (used by simulate.js)

  // ---- V3 ----
  // Campaign tiers. A tier holds every CAPTURED pose whose difficulty is in `diffs`.
  TIERS: [
    { id: "easy", label: "EASY", diffs: [1] },
    { id: "medium", label: "MEDIUM", diffs: [2] },
    { id: "hard", label: "HARD", diffs: [3, 4] },
  ],
  RESET_CLICKS: 20, // successive clicks needed to reset progress
  RESET_GAP_MS: 2000, // clicks further apart than this restart the count
  CALIB_FRAMES: 25, // good open-palm frames needed for finger calibration
  CALIB_MIN_SCORE: 55, // open-palm similarity needed for a frame to count
  CALIB_MIN: 0.75, // per-finger correction is clamped to this range
  CALIB_MAX: 1.3,
  CAMERA_W: 640, // lower camera resolution = lighter on weak phones
  CAMERA_H: 480,
};
