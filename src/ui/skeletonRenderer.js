const CONNECTIONS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
];

// OLD: function drawSkeleton(ctx, pts, color) {  (fixed line width 2, dot radius 3)
function drawSkeleton(ctx, pts, color, lw = 2, r = 3) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (const [a, b] of CONNECTIONS) {
    ctx.moveTo(pts[a].x, pts[a].y);
    ctx.lineTo(pts[b].x, pts[b].y);
  }
  ctx.stroke();
  ctx.fillStyle = color;
  for (const p of pts) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Live hands on top of the video. rawLandmarks are 0..1; canvas is CSS-mirrored with the video.
export function drawLiveHands(canvas, detected) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const lw = Math.max(2, canvas.width / 240);
  for (const d of detected) {
    const pts = d.raw.map((p) => ({
      x: p.x * canvas.width,
      y: p.y * canvas.height,
    }));
    drawSkeleton(ctx, pts, "#00e5ff", lw, lw * 1.5);
  }
}

// Places the normalized target hand(s) on the canvas. x is flipped so the picture matches
// what the player saw on the mirrored camera view when the pose was captured.
function layout(canvas, pose) {
  const n = pose.hands.length;
  const w = canvas.width;
  const h = canvas.height;
  // a normalized hand is about 3.4 palm-units wide and 2.8 tall (wrist at the bottom)
  const scale = Math.min(w / n / 4.2, (h * 0.8) / 2.8);
  return pose.hands.map((hand, k) => {
    const slot = n - 1 - k; // raw-left hand appears on the right in a mirrored view
    const cx = (w * (slot + 0.5)) / n;
    const cy = h * 0.92;
    return hand.map((p) => ({ x: cx - p.x * scale, y: cy + p.y * scale }));
  });
}

// fill = null  -> plain amber skeleton (thumbnails, collection, preview)
// fill = 0..1  -> Shadowmatic-style: dim outline, bright part rising from the bottom
// OLD: export function drawTarget(canvas, pose) {
export function drawTarget(canvas, pose, fill = null, litColor = "#ffb300") {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!pose || !pose.hands) return;
  const all = layout(canvas, pose);
  const lw = Math.max(2, canvas.width / 70);

  if (fill === null) {
    for (const pts of all) drawSkeleton(ctx, pts, litColor, lw * 0.6, lw * 0.9);
    return;
  }
  for (const pts of all)
    drawSkeleton(ctx, pts, "rgba(255,255,255,0.30)", lw, lw * 1.4);

  const ys = all.flat().map((p) => p.y);
  const top = Math.min(...ys) - lw;
  const bottom = Math.max(...ys) + lw;
  const litTop = bottom - Math.max(0, Math.min(1, fill)) * (bottom - top);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, litTop, canvas.width, canvas.height - litTop);
  ctx.clip();
  for (const pts of all) drawSkeleton(ctx, pts, litColor, lw, lw * 1.4);
  ctx.restore();
}

// Locked card / placeholder
export function drawLocked(canvas, text) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#16213f";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#5b6b94";
  ctx.font = `${Math.round(canvas.height / 5)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
}
