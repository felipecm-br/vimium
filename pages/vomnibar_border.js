/**
 * Vomnibar border motion: rotation speed and gradient angle of the animated border.
 *
 * Modeled on Omarchy's border switcher (hypr-border): speed steps from Off to Fastest, the angle
 * turns in 45 degree steps, changes preview live, Enter keeps them and Esc reverts them.
 */

import "../lib/settings.js";

// Where earlier versions kept these values; migrated into Settings on load.
const LEGACY_STORAGE_KEY = "vimium.vomnibarBorderMotion";
const SETTINGS_KEY = "vomnibarBorderMotion";

// Seconds per full turn of the gradient. `null` keeps the gradient but stops the rotation.
export const borderSpeeds = [
  { label: "Off", seconds: null },
  { label: "Slow", seconds: 8 },
  { label: "Normal", seconds: 4 },
  { label: "Fast", seconds: 2 },
  { label: "Faster", seconds: 1 },
  { label: "Fastest", seconds: 0.5 },
];

export const ANGLE_STEP = 45;
const DEFAULT_SPEED_INDEX = 2; // Normal, the rotation the Vomnibar always had.
const DEFAULT_ANGLE = 0;

const clampSpeedIndex = (i) => Math.max(0, Math.min(borderSpeeds.length - 1, i));
const normalizeAngle = (a) => ((a % 360) + 360) % 360;

export class BorderMotion {
  constructor() {
    this.speedIndex = DEFAULT_SPEED_INDEX;
    this.angle = DEFAULT_ANGLE;
    this.element = null;
    // Values to restore on cancel while a preview is pending, otherwise null.
    this.snapshot = null;
  }

  // Load the saved values, apply them to `element` (the #vomnibar box) and follow later changes
  // (another tab, or another device through chrome.storage.sync).
  init(element) {
    this.element = element;
    this.migrateLegacyValues();
    this.loadFromSettings();
    if (!this.listeningForSettings && Settings.isLoaded()) {
      this.listeningForSettings = true;
      Settings.addEventListener("change", () => {
        if (!this.hasPendingPreview()) this.loadFromSettings();
      });
    }
  }

  loadFromSettings() {
    const saved = Settings.isLoaded() ? Settings.get(SETTINGS_KEY) : null;
    const speedIndex = borderSpeeds.findIndex((s) => s.label === saved?.speed);
    this.speedIndex = speedIndex >= 0 ? speedIndex : DEFAULT_SPEED_INDEX;
    this.angle = Number.isFinite(saved?.angle) ? normalizeAngle(saved.angle) : DEFAULT_ANGLE;
    this.apply();
  }

  migrateLegacyValues() {
    try {
      const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || "null");
      if (legacy == null) return;
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      if (!Settings.isLoaded() || !Number.isInteger(legacy.speedIndex)) return;
      this.speedIndex = clampSpeedIndex(legacy.speedIndex);
      this.angle = Number.isFinite(legacy.angle) ? normalizeAngle(legacy.angle) : DEFAULT_ANGLE;
      this.save();
    } catch {
      // localStorage may be unavailable or hold bad data; Settings is the source of truth.
    }
  }

  save() {
    if (!Settings.isLoaded()) return;
    Settings.set(SETTINGS_KEY, { speed: this.speed.label, angle: this.angle }).catch(() => {});
  }

  get speed() {
    return borderSpeeds[this.speedIndex];
  }

  apply() {
    if (!this.element) return;
    const { seconds } = this.speed;
    this.element.style.setProperty("--vomnibar-border-offset", `${this.angle}deg`);
    if (seconds != null) {
      this.element.style.setProperty("--vomnibar-border-duration", `${seconds}s`);
    }
    this.element.classList.toggle("static-border", seconds == null);
  }

  beginPreview() {
    if (!this.snapshot) this.snapshot = { speedIndex: this.speedIndex, angle: this.angle };
  }

  // delta: +1 is faster, -1 is slower. Stops at Off and Fastest, like hypr-border.
  changeSpeed(delta) {
    this.beginPreview();
    this.speedIndex = clampSpeedIndex(this.speedIndex + delta);
    this.apply();
  }

  // delta: +1 turns the gradient clockwise by ANGLE_STEP, -1 counterclockwise.
  rotate(delta) {
    this.beginPreview();
    this.angle = normalizeAngle(this.angle + delta * ANGLE_STEP);
    this.apply();
  }

  hasPendingPreview() {
    return this.snapshot != null;
  }

  confirmPreview() {
    if (!this.snapshot) return;
    const changed = this.snapshot.speedIndex !== this.speedIndex ||
      this.snapshot.angle !== this.angle;
    this.snapshot = null;
    if (changed) this.save();
  }

  cancelPreview() {
    if (!this.snapshot) return;
    ({ speedIndex: this.speedIndex, angle: this.angle } = this.snapshot);
    this.snapshot = null;
    this.apply();
  }

  describe() {
    const { label, seconds } = this.speed;
    return {
      speed: seconds == null ? label : `${label} (${seconds}s)`,
      angle: `${this.angle}°`,
    };
  }
}

export const borderMotion = new BorderMotion();
