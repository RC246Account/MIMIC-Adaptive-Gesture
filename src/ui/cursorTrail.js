// Fruit-Ninja style glowing cursor trail for the menu screens.
// Lightweight: max 22 points, one stroke per segment, no shadowBlur, and the animation loop
// stops by itself when the cursor stops moving (zero cost while idle).
let canvas = null;
let ctx = null;
let raf = 0;
let running = false;
let pts = [];
let w = 0;
let h = 0;
const MAX_POINTS = 22;
const LIFE_MS = 450;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  w = window.innerWidth;
  h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function onMove(e) {
  if (!running) return;
  pts.push({ x: e.clientX, y: e.clientY, t: performance.now() });
  if (pts.length > MAX_POINTS) pts.shift();
  if (!raf) raf = requestAnimationFrame(draw);
}

function draw() {
  raf = 0;
  const now = performance.now();
  while (pts.length && now - pts[0].t > LIFE_MS) pts.shift();
  ctx.clearRect(0, 0, w, h);
  if (!pts.length) return; // nothing to draw: the loop stops here
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (let i = 1; i < pts.length; i++) {
    const life = 1 - (now - pts[i].t) / LIFE_MS;
    const k = i / pts.length;
    ctx.strokeStyle = `rgba(0,229,255,${Math.max(0, life * k * 0.9)})`;
    ctx.lineWidth = 2 + k * 10;
    ctx.beginPath();
    ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
    ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }
  // glowing round head
  const p = pts[pts.length - 1];
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 26);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.3, "rgba(0,229,255,0.55)");
  g.addColorStop(1, "rgba(0,229,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  raf = requestAnimationFrame(draw);
}

export function initTrail(c) {
  canvas = c;
  ctx = c.getContext("2d");
  resize();
  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerdown", onMove, { passive: true });
}

export function startTrail() {
  running = true;
  canvas.style.display = "block";
}

export function stopTrail() {
  running = false;
  cancelAnimationFrame(raf);
  raf = 0;
  pts = [];
  canvas.style.display = "none";
}
