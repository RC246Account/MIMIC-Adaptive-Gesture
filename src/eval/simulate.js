// Offline experiment: 3 challenge policies vs simulated players in the V2 campaign.
// Run:  node src/eval/simulate.js          (LEARN = 0.02)
//       node src/eval/simulate.js 0        (ablation: players never improve)
// V2: all policies use the same level system (points unlock levels). They differ in HOW the next pose is chosen.
//   random      : any pose in the whole library (ignores levels)
//   levelRandom : random among poses up to the player's unlocked level (campaign without the agent)
//   mimic       : the per-finger error-aware agent, same pool as levelRandom
import { poseMeta as poseLibrary } from "../gestures/poseLibrary.js";
import {
  createProfile,
  updateProfile,
  awardPoints,
} from "../agent/playerProfile.js";
import { selectNextChallenge } from "../agent/challengeAgent.js";
import { CONFIG } from "../config.js";

const ROUNDS = 40;
const RUNS = 300;
const POINTS_PER_PASS = 75; // simplified: real points depend on similarity and speed
let LEARN = process.argv[2] !== undefined ? Number(process.argv[2]) : 0.02;

const rnd = (a) => a[Math.floor(Math.random() * a.length)];

const policies = {
  random: (_prof, poses) => rnd(poses),
  levelRandom: (prof, poses) =>
    rnd(poses.filter((p) => p.difficulty <= prof.unlockedLevel)),
  mimic: (prof, poses) =>
    selectNextChallenge(prof, poses, prof.unlockedLevel).pose,
};

function simulateOne(name) {
  // each simulated player has a skill (0..1) per finger
  const skill = Array.from({ length: 5 }, () => 0.4 + Math.random() * 0.5);
  const weakest = skill.indexOf(Math.min(...skill));
  const prof = createProfile();
  let passes = 0;
  let exposure = 0;

  for (let r = 0; r < ROUNDS; r++) {
    const pose = policies[name](prof, poseLibrary);
    const dsum = pose.fingerDemand.reduce((a, b) => a + b, 0);
    const ability =
      pose.fingerDemand.reduce((s, d, i) => s + d * skill[i], 0) / dsum -
      0.08 * pose.difficulty;
    const passed = Math.random() < Math.max(0, Math.min(1, ability));
    // simulated per-finger error: worse skill -> larger error
    const perFinger = skill.map((s) =>
      Math.max(0, (1 - s) * CONFIG.K + (Math.random() - 0.5) * 0.1),
    );

    if (pose.fingerDemand[weakest] >= 0.7) exposure++;
    if (passed) passes++;
    // assumed learning model: practicing a finger improves it a little
    pose.fingerDemand.forEach((d, i) => {
      if (d >= 0.5) skill[i] += LEARN * (1 - skill[i]);
    });
    updateProfile(prof, { pose, passed, perFinger, score: passed ? 80 : 40 });
    awardPoints(prof, passed ? POINTS_PER_PASS : 0, true);
  }
  return {
    passRate: passes / ROUNDS,
    weakExposure: exposure / ROUNDS,
    weakestSkillEnd: skill[weakest],
    levelEnd: prof.unlockedLevel,
  };
}

const stat = (xs) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
  return `${m.toFixed(3)} +/- ${sd.toFixed(3)}`;
};

console.log(`Simulation: ${RUNS} runs x ${ROUNDS} rounds, LEARN=${LEARN}`);
const rows = {};
for (const name of Object.keys(policies)) {
  const rs = Array.from({ length: RUNS }, () => simulateOne(name));
  rows[name] = {
    weakFingerExposure: stat(rs.map((r) => r.weakExposure)),
    passRate: stat(rs.map((r) => r.passRate)),
    weakestSkillEnd: stat(rs.map((r) => r.weakestSkillEnd)),
    levelEnd: stat(rs.map((r) => r.levelEnd)),
  };
}
console.table(rows);
