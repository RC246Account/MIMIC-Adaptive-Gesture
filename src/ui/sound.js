// Tiny WebAudio sound effects (no audio files needed, works offline and on phones).
// Browsers only allow audio after a tap, so main.js calls unlockAudio() on the Start/Capture click.
let ctx = null;
let muted = false;

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function beep(freq, dur = 0.08, type = "square", vol = 0.06, delay = 0) {
  if (muted) return;
  const a = ac();
  if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(a.destination);
  o.start(t);
  o.stop(t + dur);
}

export const unlockAudio = () => ac();
export const setMuted = (m) => (muted = m);
export const isMuted = () => muted;

export const tick = () => beep(900, 0.05, "square", 0.05);
export const tickUrgent = () => beep(1400, 0.07, "square", 0.08);
export const countdownBeep = () => beep(700, 0.09, "sine", 0.1);
export const shutter = () => beep(1500, 0.18, "sine", 0.12);
export const success = () => {
  beep(660, 0.1, "triangle", 0.1, 0);
  beep(880, 0.1, "triangle", 0.1, 0.1);
  beep(1175, 0.18, "triangle", 0.1, 0.2);
};
export const click = () => beep(520, 0.05, "sine", 0.07);
export const fail = () => beep(170, 0.35, "sawtooth", 0.07);
export const levelUp = () => {
  [523, 659, 784, 1046].forEach((f, i) =>
    beep(f, 0.14, "triangle", 0.1, i * 0.12),
  );
};
