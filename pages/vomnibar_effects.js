/**
 * Vomnibar effects level: how much motion and blur Vimium's UI uses.
 *
 * Picked like a theme: type "effects" in OmniSearch, move through the levels to preview them live,
 * Enter keeps the selection and Esc reverts it. Saved in Settings, so content scripts (the glass
 * backdrop, the keystroke popup) follow it too.
 */

import "../lib/settings.js";

const SETTINGS_KEY = "vomnibarEffects";

export const effectLevels = [
  {
    name: "Full",
    icon: "✨",
    description: "Rotating border, slide, glass backdrop, Google mode shake",
  },
  {
    name: "Calm",
    icon: "🌙",
    description: "Slide and glass backdrop; border and Google mode stay still",
  },
  {
    name: "Quick",
    icon: "🚀",
    description: "Opens and closes instantly; keeps the rotating border and glass",
  },
  {
    name: "Fast",
    icon: "⚡",
    description: "No animation or blur: opens and closes instantly",
  },
];

const DEFAULT_LEVEL = "Full";
export const INSTANT_LEVELS = ["Quick", "Fast"];
const isLevel = (name) => effectLevels.some((level) => level.name === name);

// The saved level, from anywhere Settings is loaded (the Vomnibar page or a content script).
export function savedEffectsLevel() {
  const saved = Settings.isLoaded() ? Settings.get(SETTINGS_KEY) : null;
  return isLevel(saved) ? saved : DEFAULT_LEVEL;
}

export class EffectsManager {
  constructor() {
    this.level = DEFAULT_LEVEL;
    // The level to restore on cancel while a preview is pending, otherwise null.
    this.snapshot = null;
  }

  // Apply the saved level and follow later changes (another tab, another device).
  init() {
    this.level = savedEffectsLevel();
    this.apply();
    if (!this.listeningForSettings && Settings.isLoaded()) {
      this.listeningForSettings = true;
      Settings.addEventListener("change", () => {
        if (this.snapshot == null) {
          this.level = savedEffectsLevel();
          this.apply();
        }
      });
    }
  }

  // The stylesheet keys off this attribute (see "Effects levels" in vomnibar_page.css).
  apply() {
    document.documentElement.dataset.vomnibarEffects = this.level.toLowerCase();
  }

  isFast() {
    return this.level === "Fast";
  }

  // Quick and Fast both show and hide the Vomnibar at once, without the slide.
  isInstant() {
    return INSTANT_LEVELS.includes(this.level);
  }

  getCurrentLevel() {
    return this.snapshot ?? this.level;
  }

  preview(name) {
    if (!isLevel(name)) return;
    if (this.snapshot == null) this.snapshot = this.level;
    this.level = name;
    this.apply();
  }

  confirmPreview() {
    if (this.snapshot == null) return;
    const changed = this.snapshot !== this.level;
    this.snapshot = null;
    if (changed && Settings.isLoaded()) Settings.set(SETTINGS_KEY, this.level).catch(() => {});
  }

  cancelPreview() {
    if (this.snapshot == null) return;
    this.level = this.snapshot;
    this.snapshot = null;
    this.apply();
  }
}

export const effectsManager = new EffectsManager();
