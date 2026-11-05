// Takes 21 landmarks in PIXEL units (x*videoWidth, y*videoHeight) and returns
// landmarks with: wrist at (0,0), palm size = 1, hand rotated so the middle
// finger base points up. Distance and tilt no longer change the score.
export function normalizeHand(lm) {
  const w = lm[0];
  const m = lm[9]; // middle finger MCP
  const dx = m.x - w.x;
  const dy = m.y - w.y;
  const scale = Math.hypot(dx, dy) || 1e-6;
  const theta = -Math.PI / 2 - Math.atan2(dy, dx);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return lm.map((p) => {
    const x = (p.x - w.x) / scale;
    const y = (p.y - w.y) / scale;
    return { x: x * c - y * s, y: x * s + y * c };
  });
}
