// All tunable numbers live here so you can change them in one place
// and report them in the paper (Methodology, "parameter settings").
// V2: changed lines keep the old version as an "OLD:" comment.
export const CONFIG = {
  K: 0.6, // tolerance in toScore(); bigger = more forgiving
  PASS_SCORE: 75, // minimum similarity (0-100) to count as a match
  // OLD: HOLD_FRAMES: 10,   // frame-based hold (frame rate differs a lot on phones)
  HOLD_MS: 700, // pose must stay above PASS_SCORE this long (time-based)
  // OLD: TIMEOUT_MS: 15000, // one fixed timeout for every pose
  BASE_TIME_MS: { 1: 6000, 2: 9000, 3: 12000, 4: 14000 }, // easy poses get LESS time
  LEVEL_PRESSURE: 0.1, // campaign: each level above 1 removes 10% of the time
  MIN_TIME_MS: 3500, // timer never goes below this
  PRACTICE_TIME_FACTOR: 1.5, // practice mode is more relaxed
  TICK_FROM_MS: 5000, // ticking sound starts when this much time is left
  RESULT_PAUSE_MS: 1200, // pause between rounds so the player can read the result
  CAPTURE_FRAMES: 30, // frames averaged when saving a target pose (developer)
  CAPTURE_DELAY_MS: 3000,
  EPSILON: 0.1, // exploration rate of the agent
  EMA_ALPHA: 0.3, // how fast finger weakness reacts to new results
  // OLD: LEVEL_WEIGHT: 1.0,  // ceiling-rule penalty, replaced by the pool filter (difficulty <= level)
  LEVEL_BONUS: 0.15, // agent: small bonus for poses of the current level (vs review poses)
  NOVELTY_PENALTY: 0.15, // agent: penalty for a pose seen in the last 3 rounds
  MAX_LEVEL: 4,
  LEVEL_UP_POINTS: [300, 400, 500], // campaign points needed to leave level 1, 2, 3
};
