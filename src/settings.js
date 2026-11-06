// Persistent preferences (camera + sound), remembered for the next visit.
const KEY = "mimic_settings_v1";
const DEFAULTS = { camera: false, sound: true };

export function loadSettings() {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY)) || {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}
