// Landmark storage.
// V2 data format per pose: { hands: [normalizedHand, ...], hand: "right" | "left" | "both" }
// OLD (v1): value was just the hands array, key "mimic_poses_v1".
// Player build: ONLY /poses.json is used (the poses you ship). Dev mode (?dev=1 or npm run dev)
// also reads poses captured in this browser (localStorage), which override the shipped ones.
const KEY = "mimic_poses_v2"; // OLD: "mimic_poses_v1"

function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

export function saveLandmarks(id, entry) {
  const all = readLocal();
  all[id] = entry; // { hands, hand }
  localStorage.setItem(KEY, JSON.stringify(all));
}

async function readShipped() {
  try {
    const res = await fetch("/poses.json");
    if (!res.ok) return {};
    return await res.json(); // throws if the dev server returned index.html instead
  } catch {
    return {};
  }
}

// OLD: export async function loadPoses(meta) {
export async function loadPoses(meta, useLocal = false) {
  const shipped = await readShipped();
  const local = useLocal ? readLocal() : {};
  return meta.map((m) => {
    const e = local[m.id] || shipped[m.id];
    // V3: accept both formats. v1 file = plain array of hands, v2 = { hands, hand }
    const hands = Array.isArray(e)
      ? e
      : e && Array.isArray(e.hands)
        ? e.hands
        : null;
    const hand = e && !Array.isArray(e) ? e.hand || null : null;
    const ok = hands && hands.length === m.handsRequired;
    return {
      ...m,
      hands: ok ? hands : null,
      hand: ok ? hand : null,
    };
  });
}

// Map of id -> { hands, hand } for every captured pose (for export to public/poses.json)
export function collectLandmarks(poses) {
  const out = {};
  for (const p of poses)
    if (p.hands) out[p.id] = { hands: p.hands, hand: p.hand };
  return out;
}
