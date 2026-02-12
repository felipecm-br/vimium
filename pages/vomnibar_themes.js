/**
 * Vomnibar Theme System
 * 
 * Provides theme management for the Vomnibar using CSS custom properties.
 * Themes are applied efficiently by setting CSS variables on the document root.
 */

// Storage key for persisting theme preference
const THEME_STORAGE_KEY = "vimium.vomnibarTheme";

import "../lib/settings.js";

/**
 * Theme definitions using CSS custom properties.
 * Each theme overrides the :root variables defined in vomnibar_page.css.
 */
export const themeDefinitions = [
  {
    name: "Default",
    icon: "◐",
    description: "Default dark theme",
    vars: {} // Uses defaults from vomnibar_page.css
  },
  {
    name: "Midnight Glass",
    icon: "🌙",
    description: "Deep blue glass aesthetic",
    vars: {
      "--vomnibar-bg-color": "rgba(0, 0, 0, 0.85)",
      "--vomnibar-inner-bg": "#0d1117",
      "--vomnibar-text-color": "#e6edf3",
      "--vomnibar-secondary-text": "#7d8590",
      "--vomnibar-selected-bg": "rgba(56, 139, 253, 0.15)",
      "--vomnibar-hover-bg": "rgba(56, 139, 253, 0.08)",
      "--vomnibar-border-color": "#30363d",
      "--vomnibar-accent-color": "#388bfd",
      "--vomnibar-url-color": "#58a6ff",
      "--vomnibar-match-color": "#79c0ff",
      "--vomnibar-gradient-1": "#388bfd",
      "--vomnibar-gradient-2": "#1f6feb",
      "--vomnibar-gradient-3": "#58a6ff"
    }
  },
  {
    name: "Paper Light",
    icon: "☀️",
    description: "Clean light theme",
    vars: {
      "--vomnibar-bg-color": "rgba(255, 255, 255, 0.95)",
      "--vomnibar-inner-bg": "#ffffff",
      "--vomnibar-text-color": "#24292f",
      "--vomnibar-secondary-text": "#57606a",
      "--vomnibar-selected-bg": "#ddf4ff",
      "--vomnibar-hover-bg": "#f6f8fa",
      "--vomnibar-border-color": "#d0d7de",
      "--vomnibar-accent-color": "#0969da",
      "--vomnibar-url-color": "#0550ae",
      "--vomnibar-match-color": "#0969da",
      "--vomnibar-gradient-1": "#0969da",
      "--vomnibar-gradient-2": "#0550ae",
      "--vomnibar-gradient-3": "#54aeff",
      "--vomnibar-input-text": "#24292f",
      "--vomnibar-icon-color": "#57606a"
    }
  },
  {
    name: "Ocean Depth",
    icon: "🌊",
    description: "Deep ocean blue tones",
    vars: {
      "--vomnibar-bg-color": "rgba(0, 20, 40, 0.92)",
      "--vomnibar-inner-bg": "#0a1929",
      "--vomnibar-text-color": "#b2ccd6",
      "--vomnibar-secondary-text": "#5c7a8a",
      "--vomnibar-selected-bg": "rgba(0, 150, 199, 0.2)",
      "--vomnibar-hover-bg": "rgba(0, 150, 199, 0.1)",
      "--vomnibar-border-color": "#1e3a4c",
      "--vomnibar-accent-color": "#0096c7",
      "--vomnibar-url-color": "#48cae4",
      "--vomnibar-match-color": "#90e0ef",
      "--vomnibar-gradient-1": "#0096c7",
      "--vomnibar-gradient-2": "#023e8a",
      "--vomnibar-gradient-3": "#48cae4"
    }
  },
  {
    name: "Forest",
    icon: "🌲",
    description: "Natural green tones",
    vars: {
      "--vomnibar-bg-color": "rgba(0, 20, 10, 0.92)",
      "--vomnibar-inner-bg": "#0d1912",
      "--vomnibar-text-color": "#c9e4ca",
      "--vomnibar-secondary-text": "#6b8f71",
      "--vomnibar-selected-bg": "rgba(76, 175, 80, 0.2)",
      "--vomnibar-hover-bg": "rgba(76, 175, 80, 0.1)",
      "--vomnibar-border-color": "#2d4a32",
      "--vomnibar-accent-color": "#4caf50",
      "--vomnibar-url-color": "#81c784",
      "--vomnibar-match-color": "#a5d6a7",
      "--vomnibar-gradient-1": "#4caf50",
      "--vomnibar-gradient-2": "#1b5e20",
      "--vomnibar-gradient-3": "#81c784"
    }
  },
  {
    name: "Sunset",
    icon: "🌅",
    description: "Warm sunset colors",
    vars: {
      "--vomnibar-bg-color": "rgba(30, 10, 20, 0.92)",
      "--vomnibar-inner-bg": "#1a0a12",
      "--vomnibar-text-color": "#fce4ec",
      "--vomnibar-secondary-text": "#ce93a0",
      "--vomnibar-selected-bg": "rgba(244, 67, 54, 0.2)",
      "--vomnibar-hover-bg": "rgba(244, 67, 54, 0.1)",
      "--vomnibar-border-color": "#4a2030",
      "--vomnibar-accent-color": "#f44336",
      "--vomnibar-url-color": "#ef9a9a",
      "--vomnibar-match-color": "#ffcdd2",
      "--vomnibar-gradient-1": "#f44336",
      "--vomnibar-gradient-2": "#b71c1c",
      "--vomnibar-gradient-3": "#ff8a80"
    }
  },
  {
    name: "Purple Haze",
    icon: "💜",
    description: "Elegant purple tones",
    vars: {
      "--vomnibar-bg-color": "rgba(20, 10, 30, 0.92)",
      "--vomnibar-inner-bg": "#110a1a",
      "--vomnibar-text-color": "#e1bee7",
      "--vomnibar-secondary-text": "#9575a8",
      "--vomnibar-selected-bg": "rgba(156, 39, 176, 0.2)",
      "--vomnibar-hover-bg": "rgba(156, 39, 176, 0.1)",
      "--vomnibar-border-color": "#3d2050",
      "--vomnibar-accent-color": "#9c27b0",
      "--vomnibar-url-color": "#ce93d8",
      "--vomnibar-match-color": "#e1bee7",
      "--vomnibar-gradient-1": "#9c27b0",
      "--vomnibar-gradient-2": "#4a148c",
      "--vomnibar-gradient-3": "#ce93d8"
    }
  },
  {
    name: "Dracula",
    icon: "🧛",
    description: "Dracula color scheme",
    vars: {
      "--vomnibar-bg-color": "rgba(40, 42, 54, 0.95)",
      "--vomnibar-inner-bg": "#282a36",
      "--vomnibar-text-color": "#f8f8f2",
      "--vomnibar-secondary-text": "#6272a4",
      "--vomnibar-selected-bg": "rgba(68, 71, 90, 0.8)",
      "--vomnibar-hover-bg": "rgba(68, 71, 90, 0.5)",
      "--vomnibar-border-color": "#44475a",
      "--vomnibar-accent-color": "#bd93f9",
      "--vomnibar-url-color": "#8be9fd",
      "--vomnibar-match-color": "#50fa7b",
      "--vomnibar-gradient-1": "#bd93f9",
      "--vomnibar-gradient-2": "#ff79c6",
      "--vomnibar-gradient-3": "#8be9fd"
    }
  },
  {
    name: "Nord",
    icon: "❄️",
    description: "Arctic, north-bluish palette",
    vars: {
      "--vomnibar-bg-color": "rgba(46, 52, 64, 0.95)",
      "--vomnibar-inner-bg": "#2e3440",
      "--vomnibar-text-color": "#eceff4",
      "--vomnibar-secondary-text": "#81a1c1",
      "--vomnibar-selected-bg": "rgba(136, 192, 208, 0.2)",
      "--vomnibar-hover-bg": "rgba(136, 192, 208, 0.1)",
      "--vomnibar-border-color": "#3b4252",
      "--vomnibar-accent-color": "#88c0d0",
      "--vomnibar-url-color": "#81a1c1",
      "--vomnibar-match-color": "#a3be8c",
      "--vomnibar-gradient-1": "#88c0d0",
      "--vomnibar-gradient-2": "#5e81ac",
      "--vomnibar-gradient-3": "#81a1c1"
    }
  },
  {
    name: "Monokai",
    icon: "🎨",
    description: "Classic Monokai colors",
    vars: {
      "--vomnibar-bg-color": "rgba(39, 40, 34, 0.95)",
      "--vomnibar-inner-bg": "#272822",
      "--vomnibar-text-color": "#f8f8f2",
      "--vomnibar-secondary-text": "#75715e",
      "--vomnibar-selected-bg": "rgba(102, 217, 239, 0.15)",
      "--vomnibar-hover-bg": "rgba(102, 217, 239, 0.08)",
      "--vomnibar-border-color": "#49483e",
      "--vomnibar-accent-color": "#66d9ef",
      "--vomnibar-url-color": "#a6e22e",
      "--vomnibar-match-color": "#f92672",
      "--vomnibar-gradient-1": "#66d9ef",
      "--vomnibar-gradient-2": "#ae81ff",
      "--vomnibar-gradient-3": "#a6e22e"
    }
  }
];

// Create a lookup map for efficient theme access
export const themeMap = new Map(themeDefinitions.map(t => [t.name, t]));

/**
 * Theme Manager Class
 * Handles theme application, persistence, and preview functionality.
 */
export class ThemeManager {
  constructor() {
    this.currentTheme = null;
    this.previousTheme = null;
    this.isPreviewMode = false;
  }

  /**
   * Initialize the theme manager and apply saved theme.
   */
  init() {
    this.loadSavedTheme();
  }

  /**
   * Load and apply the saved theme from localStorage.
   */
  loadSavedTheme() {
    try {
      const savedName = localStorage.getItem(THEME_STORAGE_KEY);
      if (savedName && themeMap.has(savedName)) {
        this.applyTheme(savedName, false);
      } else {
        // Apply default theme
        this.applyTheme("Default", false);
      }
    } catch (e) {
      // localStorage might be unavailable, use default
      this.applyTheme("Default", false);
    }
  }

  /**
   * Apply a theme by name.
   * @param {string} themeName - Name of the theme to apply.
   * @param {boolean} save - Whether to persist the theme choice.
   */
  applyTheme(themeName, save = true) {
    const theme = themeMap.get(themeName);
    if (!theme) return false;

    // Store previous theme for undo functionality
    if (!this.isPreviewMode && this.currentTheme) {
      this.previousTheme = this.currentTheme;
    }

    // Clear all theme variables first
    this.clearThemeVars();

    // Apply new theme variables
    if (theme.vars && typeof theme.vars === "object") {
      const root = document.documentElement;
      Object.entries(theme.vars).forEach(([key, value]) => {
        root.style.setProperty(key, value);
      });
    }

    // Set data attribute for per-theme CSS selectors (e.g. Google badge colors)
    document.documentElement.setAttribute("data-vomnibar-theme", themeName);

    this.currentTheme = themeName;

    // Sync the selected theme so content scripts (e.g. link hints) can theme consistently.
    if (!this.isPreviewMode && Settings.isLoaded()) {
      // Fire-and-forget to avoid blocking UI updates.
      Settings.set("vomnibarTheme", themeName).catch(() => {});
    }

    // Persist theme choice if requested
    if (save && !this.isPreviewMode) {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, themeName);
      } catch (e) {
        // Ignore storage errors
      }
    }

    return true;
  }

  /**
   * Clear all theme CSS variables from the root element.
   */
  clearThemeVars() {
    const root = document.documentElement;
    themeDefinitions.forEach(theme => {
      Object.keys(theme.vars).forEach(key => {
        root.style.removeProperty(key);
      });
    });
  }

  /**
   * Preview a theme without persisting it.
   * @param {string} themeName - Name of the theme to preview.
   */
  previewTheme(themeName) {
    if (!this.isPreviewMode) {
      this.previousTheme = this.currentTheme;
      this.isPreviewMode = true;
    }
    this.applyTheme(themeName, false);
  }

  /**
   * Confirm the currently previewed theme (persist it).
   */
  confirmPreview() {
    if (this.isPreviewMode) {
      this.isPreviewMode = false;
      try {
        localStorage.setItem(THEME_STORAGE_KEY, this.currentTheme);
      } catch (e) {
        // Ignore storage errors
      }
      this.previousTheme = null;
    }
  }

  /**
   * Cancel preview and revert to previous theme.
   */
  cancelPreview() {
    if (this.isPreviewMode && this.previousTheme) {
      this.isPreviewMode = false;
      this.applyTheme(this.previousTheme, false);
      this.previousTheme = null;
    }
  }

  /**
   * Get the current theme name.
   * @returns {string} Current theme name.
   */
  getCurrentTheme() {
    return this.currentTheme;
  }

  /**
   * Get all available themes.
   * @returns {Array} Array of theme definitions.
   */
  getThemes() {
    return themeDefinitions;
  }

  /**
   * Check if we're in preview mode.
   * @returns {boolean} True if previewing a theme.
   */
  isInPreviewMode() {
    return this.isPreviewMode;
  }
}

// Export singleton instance
export const themeManager = new ThemeManager();
