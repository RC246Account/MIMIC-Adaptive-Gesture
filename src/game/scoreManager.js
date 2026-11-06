export function createScore() {
  return { points: 0, streak: 0, bestStreak: 0, attempts: 0, passes: 0 };
}

export function addResult(s, passed, score, streakOn = false) {
  s.attempts++;
  if (passed) {
    s.passes++;
    if (streakOn) {
      s.streak++;
      s.bestStreak = Math.max(s.bestStreak, s.streak);
    }
    s.points += Math.round(score);
  } else {
    s.streak = 0;
  }
}
