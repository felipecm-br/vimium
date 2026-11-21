/**
 * Vomnibar Theme System
 *
 * Provides theme management for the Vomnibar using CSS custom properties.
 * Themes are applied efficiently by setting CSS variables on the document root.
 */

// Where earlier versions kept the theme; migrated into Settings on load.
const LEGACY_THEME_STORAGE_KEY = "vimium.vomnibarTheme";

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
    vars: {}, // Uses defaults from vomnibar_page.css
  },
  {
    name: "Midnight Glass",
    icon: "🌙",
    description: "Deep blue glass aesthetic",
    vars: {
      "--vomnibar-bg-color": "rgba(0, 0, 0, 0.85)",
      "--vomnibar-inner-bg": "#0d1117",
      "--vomnibar-text-color": "#e6edf3",
      "--vomnibar-secondary-text": "#919aa6",
      "--vomnibar-selected-bg": "rgba(56, 139, 253, 0.15)",
      "--vomnibar-hover-bg": "rgba(56, 139, 253, 0.08)",
      "--vomnibar-border-color": "#3b434d",
      "--vomnibar-accent-color": "#388bfd",
      "--vomnibar-url-color": "#58a6ff",
      "--vomnibar-match-color": "#79c0ff",
      "--vomnibar-gradient-1": "#388bfd",
      "--vomnibar-gradient-2": "#1f6feb",
      "--vomnibar-gradient-3": "#58a6ff",
    },
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
      "--vomnibar-icon-color": "#57606a",
    },
  },
  {
    name: "Ocean Depth",
    icon: "🌊",
    description: "Deep ocean blue tones",
    vars: {
      "--vomnibar-bg-color": "rgba(0, 20, 40, 0.92)",
      "--vomnibar-inner-bg": "#0a1929",
      "--vomnibar-text-color": "#b2ccd6",
      "--vomnibar-secondary-text": "#92b7ca",
      "--vomnibar-selected-bg": "rgba(0, 150, 199, 0.2)",
      "--vomnibar-hover-bg": "rgba(0, 150, 199, 0.1)",
      "--vomnibar-border-color": "#26485e",
      "--vomnibar-accent-color": "#00a8de",
      "--vomnibar-url-color": "#48cae4",
      "--vomnibar-match-color": "#90e0ef",
      "--vomnibar-gradient-1": "#0096c7",
      "--vomnibar-gradient-2": "#023e8a",
      "--vomnibar-gradient-3": "#48cae4",
    },
  },
  {
    name: "Forest",
    icon: "🌲",
    description: "Natural green tones",
    vars: {
      "--vomnibar-bg-color": "rgba(0, 20, 10, 0.92)",
      "--vomnibar-inner-bg": "#0d1912",
      "--vomnibar-text-color": "#c9e4ca",
      "--vomnibar-secondary-text": "#92ba98",
      "--vomnibar-selected-bg": "rgba(76, 175, 80, 0.2)",
      "--vomnibar-hover-bg": "rgba(76, 175, 80, 0.1)",
      "--vomnibar-border-color": "#34573a",
      "--vomnibar-accent-color": "#4caf50",
      "--vomnibar-url-color": "#81c784",
      "--vomnibar-match-color": "#a5d6a7",
      "--vomnibar-gradient-1": "#4caf50",
      "--vomnibar-gradient-2": "#1b5e20",
      "--vomnibar-gradient-3": "#81c784",
    },
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
      "--vomnibar-border-color": "#5c2a3d",
      "--vomnibar-accent-color": "#f44336",
      "--vomnibar-url-color": "#ef9a9a",
      "--vomnibar-match-color": "#ffcdd2",
      "--vomnibar-gradient-1": "#f44336",
      "--vomnibar-gradient-2": "#b71c1c",
      "--vomnibar-gradient-3": "#ff8a80",
    },
  },
  {
    name: "Purple Haze",
    icon: "💜",
    description: "Elegant purple tones",
    vars: {
      "--vomnibar-bg-color": "rgba(20, 10, 30, 0.92)",
      "--vomnibar-inner-bg": "#110a1a",
      "--vomnibar-text-color": "#e1bee7",
      "--vomnibar-secondary-text": "#b092c4",
      "--vomnibar-selected-bg": "rgba(156, 39, 176, 0.2)",
      "--vomnibar-hover-bg": "rgba(156, 39, 176, 0.1)",
      "--vomnibar-border-color": "#4c2b63",
      "--vomnibar-accent-color": "#c054d4",
      "--vomnibar-url-color": "#ce93d8",
      "--vomnibar-match-color": "#e1bee7",
      "--vomnibar-gradient-1": "#9c27b0",
      "--vomnibar-gradient-2": "#4a148c",
      "--vomnibar-gradient-3": "#ce93d8",
    },
  },
  {
    name: "Dracula",
    icon: "🧛",
    description: "Dracula color scheme",
    vars: {
      "--vomnibar-bg-color": "rgba(40, 42, 54, 0.95)",
      "--vomnibar-inner-bg": "#282a36",
      "--vomnibar-text-color": "#f8f8f2",
      "--vomnibar-secondary-text": "#b0bce0",
      "--vomnibar-selected-bg": "rgba(68, 71, 90, 0.65)",
      "--vomnibar-hover-bg": "rgba(68, 71, 90, 0.45)",
      "--vomnibar-border-color": "#545870",
      "--vomnibar-accent-color": "#bd93f9",
      "--vomnibar-url-color": "#8be9fd",
      "--vomnibar-match-color": "#50fa7b",
      "--vomnibar-gradient-1": "#bd93f9",
      "--vomnibar-gradient-2": "#ff79c6",
      "--vomnibar-gradient-3": "#8be9fd",
    },
  },
  {
    name: "Nord",
    icon: "❄️",
    description: "Arctic, north-bluish palette",
    vars: {
      "--vomnibar-bg-color": "rgba(46, 52, 64, 0.95)",
      "--vomnibar-inner-bg": "#2e3440",
      "--vomnibar-text-color": "#eceff4",
      "--vomnibar-secondary-text": "#c0d3e6",
      "--vomnibar-selected-bg": "rgba(136, 192, 208, 0.2)",
      "--vomnibar-hover-bg": "rgba(136, 192, 208, 0.1)",
      "--vomnibar-border-color": "#4c566a",
      "--vomnibar-accent-color": "#88c0d0",
      "--vomnibar-url-color": "#9ec0e0",
      "--vomnibar-match-color": "#c2dba8",
      "--vomnibar-gradient-1": "#88c0d0",
      "--vomnibar-gradient-2": "#5e81ac",
      "--vomnibar-gradient-3": "#81a1c1",
    },
  },
  {
    name: "Monokai",
    icon: "🎨",
    description: "Classic Monokai colors",
    vars: {
      "--vomnibar-bg-color": "rgba(39, 40, 34, 0.95)",
      "--vomnibar-inner-bg": "#272822",
      "--vomnibar-text-color": "#f8f8f2",
      "--vomnibar-secondary-text": "#b8b49e",
      "--vomnibar-selected-bg": "rgba(102, 217, 239, 0.15)",
      "--vomnibar-hover-bg": "rgba(102, 217, 239, 0.08)",
      "--vomnibar-border-color": "#59584d",
      "--vomnibar-accent-color": "#66d9ef",
      "--vomnibar-url-color": "#a6e22e",
      "--vomnibar-match-color": "#ff85b3",
      "--vomnibar-gradient-1": "#66d9ef",
      "--vomnibar-gradient-2": "#ae81ff",
      "--vomnibar-gradient-3": "#a6e22e",
    },
  },
  {
    name: "Tokyo Night",
    icon: "🌃",
    description: "Neon blues and violets of Tokyo at night",
    vars: {
      "--vomnibar-bg-color": "rgba(26, 27, 38, 0.92)",
      "--vomnibar-inner-bg": "#1a1b26",
      "--vomnibar-text-color": "#a9b1d6",
      "--vomnibar-secondary-text": "#99a0c2",
      "--vomnibar-selected-bg": "rgba(122, 162, 247, 0.2)",
      "--vomnibar-hover-bg": "rgba(122, 162, 247, 0.1)",
      "--vomnibar-border-color": "#343646",
      "--vomnibar-accent-color": "#7aa2f7",
      "--vomnibar-url-color": "#7dcfff",
      "--vomnibar-match-color": "#e0af68",
      "--vomnibar-gradient-1": "#7aa2f7",
      "--vomnibar-gradient-2": "#bb9af7",
      "--vomnibar-gradient-3": "#7dcfff",
      "--vomnibar-input-text": "#a9b1d6",
      "--vomnibar-icon-color": "#99a0c2",
    },
  },
  {
    name: "Catppuccin Mocha",
    icon: "🐈",
    description: "Soothing pastel mocha",
    vars: {
      "--vomnibar-bg-color": "rgba(30, 30, 46, 0.92)",
      "--vomnibar-inner-bg": "#1e1e2e",
      "--vomnibar-text-color": "#cdd6f4",
      "--vomnibar-secondary-text": "#a2a8c3",
      "--vomnibar-selected-bg": "rgba(137, 180, 250, 0.2)",
      "--vomnibar-hover-bg": "rgba(137, 180, 250, 0.1)",
      "--vomnibar-border-color": "#3e3f52",
      "--vomnibar-accent-color": "#89b4fa",
      "--vomnibar-url-color": "#a6e3a1",
      "--vomnibar-match-color": "#f9e2af",
      "--vomnibar-gradient-1": "#89b4fa",
      "--vomnibar-gradient-2": "#cba6f7",
      "--vomnibar-gradient-3": "#a6e3a1",
      "--vomnibar-input-text": "#cdd6f4",
      "--vomnibar-icon-color": "#a2a8c3",
    },
  },
  {
    name: "Catppuccin Latte",
    icon: "🥛",
    description: "Soft pastel light theme",
    vars: {
      "--vomnibar-bg-color": "rgba(239, 241, 245, 0.95)",
      "--vomnibar-inner-bg": "#eff1f5",
      "--vomnibar-text-color": "#4c4f69",
      "--vomnibar-secondary-text": "#5b5e76",
      "--vomnibar-selected-bg": "rgba(30, 102, 245, 0.14)",
      "--vomnibar-hover-bg": "rgba(30, 102, 245, 0.07)",
      "--vomnibar-border-color": "#d2d4dc",
      "--vomnibar-accent-color": "#1e66f5",
      "--vomnibar-url-color": "#2a681c",
      "--vomnibar-match-color": "#865511",
      "--vomnibar-gradient-1": "#1e66f5",
      "--vomnibar-gradient-2": "#8839ef",
      "--vomnibar-gradient-3": "#40a02b",
      "--vomnibar-input-text": "#4c4f69",
      "--vomnibar-icon-color": "#5b5e76",
    },
  },
  {
    name: "Gruvbox",
    icon: "🪵",
    description: "Warm retro leather tones",
    vars: {
      "--vomnibar-bg-color": "rgba(40, 40, 40, 0.92)",
      "--vomnibar-inner-bg": "#282828",
      "--vomnibar-text-color": "#ebdbb2",
      "--vomnibar-secondary-text": "#ada287",
      "--vomnibar-selected-bg": "rgba(214, 93, 14, 0.2)",
      "--vomnibar-hover-bg": "rgba(214, 93, 14, 0.1)",
      "--vomnibar-border-color": "#4b4841",
      "--vomnibar-accent-color": "#d65d0e",
      "--vomnibar-url-color": "#8ec07c",
      "--vomnibar-match-color": "#b8bb26",
      "--vomnibar-gradient-1": "#d65d0e",
      "--vomnibar-gradient-2": "#b16286",
      "--vomnibar-gradient-3": "#8ec07c",
      "--vomnibar-input-text": "#ebdbb2",
      "--vomnibar-icon-color": "#ada287",
    },
  },
  {
    name: "Rosé Pine",
    icon: "🌹",
    description: "Muted rose and pine, low contrast glare",
    vars: {
      "--vomnibar-bg-color": "rgba(25, 23, 36, 0.92)",
      "--vomnibar-inner-bg": "#191724",
      "--vomnibar-text-color": "#e0def4",
      "--vomnibar-secondary-text": "#9d9bae",
      "--vomnibar-selected-bg": "rgba(235, 111, 146, 0.2)",
      "--vomnibar-hover-bg": "rgba(235, 111, 146, 0.1)",
      "--vomnibar-border-color": "#3d3b49",
      "--vomnibar-accent-color": "#eb6f92",
      "--vomnibar-url-color": "#9ccfd8",
      "--vomnibar-match-color": "#f6c177",
      "--vomnibar-gradient-1": "#eb6f92",
      "--vomnibar-gradient-2": "#c4a7e7",
      "--vomnibar-gradient-3": "#9ccfd8",
      "--vomnibar-input-text": "#e0def4",
      "--vomnibar-icon-color": "#9d9bae",
    },
  },
  {
    name: "One Dark",
    icon: "⚛️",
    description: "Atom's iconic One Dark",
    vars: {
      "--vomnibar-bg-color": "rgba(33, 37, 43, 0.92)",
      "--vomnibar-inner-bg": "#21252b",
      "--vomnibar-text-color": "#abb2bf",
      "--vomnibar-secondary-text": "#a5acb8",
      "--vomnibar-selected-bg": "rgba(97, 175, 239, 0.2)",
      "--vomnibar-hover-bg": "rgba(97, 175, 239, 0.1)",
      "--vomnibar-border-color": "#3a3e46",
      "--vomnibar-accent-color": "#61afef",
      "--vomnibar-url-color": "#98c379",
      "--vomnibar-match-color": "#e5c07b",
      "--vomnibar-gradient-1": "#61afef",
      "--vomnibar-gradient-2": "#c678dd",
      "--vomnibar-gradient-3": "#98c379",
      "--vomnibar-input-text": "#abb2bf",
      "--vomnibar-icon-color": "#a5acb8",
    },
  },
  {
    name: "One Light",
    icon: "📄",
    description: "Atom's One Light",
    vars: {
      "--vomnibar-bg-color": "rgba(250, 250, 250, 0.95)",
      "--vomnibar-inner-bg": "#fafafa",
      "--vomnibar-text-color": "#383a42",
      "--vomnibar-secondary-text": "#64656c",
      "--vomnibar-selected-bg": "rgba(64, 120, 242, 0.14)",
      "--vomnibar-hover-bg": "rgba(64, 120, 242, 0.07)",
      "--vomnibar-border-color": "#d7d7d9",
      "--vomnibar-accent-color": "#4078f2",
      "--vomnibar-url-color": "#a626a4",
      "--vomnibar-match-color": "#875c01",
      "--vomnibar-gradient-1": "#4078f2",
      "--vomnibar-gradient-2": "#a626a4",
      "--vomnibar-gradient-3": "#50a14f",
      "--vomnibar-input-text": "#383a42",
      "--vomnibar-icon-color": "#64656c",
    },
  },
  {
    name: "Solarized Dark",
    icon: "🔆",
    description: "Precision cyan on deep teal",
    vars: {
      "--vomnibar-bg-color": "rgba(0, 43, 54, 0.92)",
      "--vomnibar-inner-bg": "#002b36",
      "--vomnibar-text-color": "#98a6a6",
      "--vomnibar-secondary-text": "#98a6a6",
      "--vomnibar-selected-bg": "rgba(38, 139, 210, 0.2)",
      "--vomnibar-hover-bg": "rgba(38, 139, 210, 0.1)",
      "--vomnibar-border-color": "#1b414a",
      "--vomnibar-accent-color": "#268bd2",
      "--vomnibar-url-color": "#55b4ad",
      "--vomnibar-match-color": "#c4a133",
      "--vomnibar-gradient-1": "#268bd2",
      "--vomnibar-gradient-2": "#6c71c4",
      "--vomnibar-gradient-3": "#2aa198",
      "--vomnibar-input-text": "#98a6a6",
      "--vomnibar-icon-color": "#98a6a6",
    },
  },
  {
    name: "Solarized Light",
    icon: "🌤️",
    description: "Precision tones on warm cream",
    vars: {
      "--vomnibar-bg-color": "rgba(253, 246, 227, 0.95)",
      "--vomnibar-inner-bg": "#fdf6e3",
      "--vomnibar-text-color": "#56696f",
      "--vomnibar-secondary-text": "#56696f",
      "--vomnibar-selected-bg": "rgba(38, 139, 210, 0.14)",
      "--vomnibar-hover-bg": "rgba(38, 139, 210, 0.07)",
      "--vomnibar-border-color": "#dfddce",
      "--vomnibar-accent-color": "#268bd2",
      "--vomnibar-url-color": "#1d716a",
      "--vomnibar-match-color": "#7f6000",
      "--vomnibar-gradient-1": "#268bd2",
      "--vomnibar-gradient-2": "#6c71c4",
      "--vomnibar-gradient-3": "#2aa198",
      "--vomnibar-input-text": "#56696f",
      "--vomnibar-icon-color": "#56696f",
    },
  },
  {
    name: "GitHub Light",
    icon: "🐙",
    description: "Crisp GitHub light",
    vars: {
      "--vomnibar-bg-color": "rgba(255, 255, 255, 0.95)",
      "--vomnibar-inner-bg": "#ffffff",
      "--vomnibar-text-color": "#24292f",
      "--vomnibar-secondary-text": "#64676c",
      "--vomnibar-selected-bg": "rgba(9, 105, 218, 0.14)",
      "--vomnibar-hover-bg": "rgba(9, 105, 218, 0.07)",
      "--vomnibar-border-color": "#d8d8da",
      "--vomnibar-accent-color": "#0969da",
      "--vomnibar-url-color": "#197934",
      "--vomnibar-match-color": "#915b00",
      "--vomnibar-gradient-1": "#0969da",
      "--vomnibar-gradient-2": "#8250df",
      "--vomnibar-gradient-3": "#1a7f37",
      "--vomnibar-input-text": "#24292f",
      "--vomnibar-icon-color": "#64676c",
    },
  },
  {
    name: "Kanagawa",
    icon: "🌊",
    description: "The Great Wave off Kanagawa",
    vars: {
      "--vomnibar-bg-color": "rgba(31, 31, 40, 0.92)",
      "--vomnibar-inner-bg": "#1f1f28",
      "--vomnibar-text-color": "#dcd7ba",
      "--vomnibar-secondary-text": "#a9a592",
      "--vomnibar-selected-bg": "rgba(126, 156, 216, 0.2)",
      "--vomnibar-hover-bg": "rgba(126, 156, 216, 0.1)",
      "--vomnibar-border-color": "#414042",
      "--vomnibar-accent-color": "#7e9cd8",
      "--vomnibar-url-color": "#ffa066",
      "--vomnibar-match-color": "#8ba6dc",
      "--vomnibar-gradient-1": "#7e9cd8",
      "--vomnibar-gradient-2": "#957fb8",
      "--vomnibar-gradient-3": "#76946a",
      "--vomnibar-input-text": "#dcd7ba",
      "--vomnibar-icon-color": "#a9a592",
    },
  },
  {
    name: "Everforest",
    icon: "🌿",
    description: "Deep moss green comfort",
    vars: {
      "--vomnibar-bg-color": "rgba(43, 51, 57, 0.92)",
      "--vomnibar-inner-bg": "#2b3339",
      "--vomnibar-text-color": "#d3c6aa",
      "--vomnibar-secondary-text": "#c8bca2",
      "--vomnibar-selected-bg": "rgba(167, 192, 128, 0.2)",
      "--vomnibar-hover-bg": "rgba(167, 192, 128, 0.1)",
      "--vomnibar-border-color": "#494d4d",
      "--vomnibar-accent-color": "#a7c080",
      "--vomnibar-url-color": "#dbbc7f",
      "--vomnibar-match-color": "#b0c68d",
      "--vomnibar-gradient-1": "#a7c080",
      "--vomnibar-gradient-2": "#7fbbb3",
      "--vomnibar-gradient-3": "#83c092",
      "--vomnibar-input-text": "#d3c6aa",
      "--vomnibar-icon-color": "#c8bca2",
    },
  },
  {
    name: "Synthwave 84",
    icon: "🕹️",
    description: "Hot pink and cyan retro horizon",
    vars: {
      "--vomnibar-bg-color": "rgba(17, 11, 41, 0.92)",
      "--vomnibar-inner-bg": "#110b29",
      "--vomnibar-text-color": "#ffe6ff",
      "--vomnibar-secondary-text": "#9988a4",
      "--vomnibar-selected-bg": "rgba(255, 42, 133, 0.2)",
      "--vomnibar-hover-bg": "rgba(255, 42, 133, 0.1)",
      "--vomnibar-border-color": "#3c3250",
      "--vomnibar-accent-color": "#ff2a85",
      "--vomnibar-url-color": "#ffbe0b",
      "--vomnibar-match-color": "#00e5ff",
      "--vomnibar-gradient-1": "#ff2a85",
      "--vomnibar-gradient-2": "#8a2be2",
      "--vomnibar-gradient-3": "#ffbe0b",
      "--vomnibar-input-text": "#ffe6ff",
      "--vomnibar-icon-color": "#9988a4",
    },
  },
  {
    name: "Outrun",
    icon: "🏎️",
    description: "Hypergrid neon on black",
    vars: {
      "--vomnibar-bg-color": "rgba(13, 2, 33, 0.92)",
      "--vomnibar-inner-bg": "#0d0221",
      "--vomnibar-text-color": "#e6fbff",
      "--vomnibar-secondary-text": "#848b9b",
      "--vomnibar-selected-bg": "rgba(255, 56, 100, 0.2)",
      "--vomnibar-hover-bg": "rgba(255, 56, 100, 0.1)",
      "--vomnibar-border-color": "#342f49",
      "--vomnibar-accent-color": "#ff3864",
      "--vomnibar-url-color": "#00f6ff",
      "--vomnibar-match-color": "#ff9e00",
      "--vomnibar-gradient-1": "#ff3864",
      "--vomnibar-gradient-2": "#7b2cbf",
      "--vomnibar-gradient-3": "#00f6ff",
      "--vomnibar-input-text": "#e6fbff",
      "--vomnibar-icon-color": "#848b9b",
    },
  },
  {
    name: "Cyber Ronin",
    icon: "⚔️",
    description: "Crimson and gold on obsidian",
    vars: {
      "--vomnibar-bg-color": "rgba(18, 18, 20, 0.92)",
      "--vomnibar-inner-bg": "#121214",
      "--vomnibar-text-color": "#f4f4f5",
      "--vomnibar-secondary-text": "#8e8e90",
      "--vomnibar-selected-bg": "rgba(225, 29, 72, 0.2)",
      "--vomnibar-hover-bg": "rgba(225, 29, 72, 0.1)",
      "--vomnibar-border-color": "#3b3b3d",
      "--vomnibar-accent-color": "#e11d48",
      "--vomnibar-url-color": "#10b981",
      "--vomnibar-match-color": "#f59e0b",
      "--vomnibar-gradient-1": "#e11d48",
      "--vomnibar-gradient-2": "#f59e0b",
      "--vomnibar-gradient-3": "#10b981",
      "--vomnibar-input-text": "#f4f4f5",
      "--vomnibar-icon-color": "#8e8e90",
    },
  },
  {
    name: "Matrix",
    icon: "💊",
    description: "Green rain on black",
    vars: {
      "--vomnibar-bg-color": "rgba(5, 22, 11, 0.92)",
      "--vomnibar-inner-bg": "#05160b",
      "--vomnibar-text-color": "#a7f3d0",
      "--vomnibar-secondary-text": "#6da489",
      "--vomnibar-selected-bg": "rgba(16, 185, 129, 0.2)",
      "--vomnibar-hover-bg": "rgba(16, 185, 129, 0.1)",
      "--vomnibar-border-color": "#223e2e",
      "--vomnibar-accent-color": "#10b981",
      "--vomnibar-url-color": "#00ff66",
      "--vomnibar-match-color": "#34d399",
      "--vomnibar-gradient-1": "#10b981",
      "--vomnibar-gradient-2": "#059669",
      "--vomnibar-gradient-3": "#00ff66",
      "--vomnibar-input-text": "#a7f3d0",
      "--vomnibar-icon-color": "#6da489",
    },
  },
  {
    name: "Firewatch",
    icon: "🔥",
    description: "Purple dusk over a burning sky",
    vars: {
      "--vomnibar-bg-color": "rgba(26, 10, 46, 0.92)",
      "--vomnibar-inner-bg": "#1a0a2e",
      "--vomnibar-text-color": "#f0c0e0",
      "--vomnibar-secondary-text": "#ad87a8",
      "--vomnibar-selected-bg": "rgba(232, 96, 138, 0.2)",
      "--vomnibar-hover-bg": "rgba(232, 96, 138, 0.1)",
      "--vomnibar-border-color": "#412b4e",
      "--vomnibar-accent-color": "#e8608a",
      "--vomnibar-url-color": "#06b6d4",
      "--vomnibar-match-color": "#f7c96e",
      "--vomnibar-gradient-1": "#e8608a",
      "--vomnibar-gradient-2": "#9b59b6",
      "--vomnibar-gradient-3": "#06b6d4",
      "--vomnibar-input-text": "#f0c0e0",
      "--vomnibar-icon-color": "#ad87a8",
    },
  },
  {
    name: "Dune",
    icon: "🏜️",
    description: "Arrakis spice desert",
    vars: {
      "--vomnibar-bg-color": "rgba(31, 17, 14, 0.92)",
      "--vomnibar-inner-bg": "#1f110e",
      "--vomnibar-text-color": "#ffedd5",
      "--vomnibar-secondary-text": "#9f8f80",
      "--vomnibar-selected-bg": "rgba(234, 88, 12, 0.2)",
      "--vomnibar-hover-bg": "rgba(234, 88, 12, 0.1)",
      "--vomnibar-border-color": "#473932",
      "--vomnibar-accent-color": "#ea580c",
      "--vomnibar-url-color": "#f59e0b",
      "--vomnibar-match-color": "#ed7130",
      "--vomnibar-gradient-1": "#ea580c",
      "--vomnibar-gradient-2": "#d97706",
      "--vomnibar-gradient-3": "#0284c7",
      "--vomnibar-input-text": "#ffedd5",
      "--vomnibar-icon-color": "#9f8f80",
    },
  },
  {
    name: "Sakura",
    icon: "🌸",
    description: "Cherry blossom pinks",
    vars: {
      "--vomnibar-bg-color": "rgba(32, 24, 36, 0.92)",
      "--vomnibar-inner-bg": "#201824",
      "--vomnibar-text-color": "#fce7f3",
      "--vomnibar-secondary-text": "#a898a4",
      "--vomnibar-selected-bg": "rgba(244, 114, 182, 0.2)",
      "--vomnibar-hover-bg": "rgba(244, 114, 182, 0.1)",
      "--vomnibar-border-color": "#483d49",
      "--vomnibar-accent-color": "#f472b6",
      "--vomnibar-url-color": "#fb7185",
      "--vomnibar-match-color": "#fbcfe8",
      "--vomnibar-gradient-1": "#f472b6",
      "--vomnibar-gradient-2": "#c084fc",
      "--vomnibar-gradient-3": "#fb7185",
      "--vomnibar-input-text": "#fce7f3",
      "--vomnibar-icon-color": "#a898a4",
    },
  },
  {
    name: "Matcha",
    icon: "🍵",
    description: "Matcha tea and zen greens",
    vars: {
      "--vomnibar-bg-color": "rgba(21, 32, 23, 0.92)",
      "--vomnibar-inner-bg": "#152017",
      "--vomnibar-text-color": "#ecfccb",
      "--vomnibar-secondary-text": "#95a382",
      "--vomnibar-selected-bg": "rgba(101, 163, 13, 0.2)",
      "--vomnibar-hover-bg": "rgba(101, 163, 13, 0.1)",
      "--vomnibar-border-color": "#3c4837",
      "--vomnibar-accent-color": "#65a30d",
      "--vomnibar-url-color": "#10b981",
      "--vomnibar-match-color": "#a3e635",
      "--vomnibar-gradient-1": "#65a30d",
      "--vomnibar-gradient-2": "#4d7c0f",
      "--vomnibar-gradient-3": "#10b981",
      "--vomnibar-input-text": "#ecfccb",
      "--vomnibar-icon-color": "#95a382",
    },
  },
  {
    name: "Klimt Gold",
    icon: "🖼️",
    description: "Gold leaf from The Kiss",
    vars: {
      "--vomnibar-bg-color": "rgba(26, 18, 8, 0.92)",
      "--vomnibar-inner-bg": "#1a1208",
      "--vomnibar-text-color": "#e8d9a0",
      "--vomnibar-secondary-text": "#998d66",
      "--vomnibar-selected-bg": "rgba(138, 105, 20, 0.2)",
      "--vomnibar-hover-bg": "rgba(138, 105, 20, 0.1)",
      "--vomnibar-border-color": "#3f3623",
      "--vomnibar-accent-color": "#8a6914",
      "--vomnibar-url-color": "#b8860b",
      "--vomnibar-match-color": "#e8d9a0",
      "--vomnibar-gradient-1": "#8a6914",
      "--vomnibar-gradient-2": "#b8860b",
      "--vomnibar-gradient-3": "#b8860b",
      "--vomnibar-input-text": "#e8d9a0",
      "--vomnibar-icon-color": "#998d66",
    },
  },
  {
    name: "Starry Night",
    icon: "✨",
    description: "Cobalt sky and golden stars",
    vars: {
      "--vomnibar-bg-color": "rgba(11, 29, 58, 0.92)",
      "--vomnibar-inner-bg": "#0b1d3a",
      "--vomnibar-text-color": "#f4ecd8",
      "--vomnibar-secondary-text": "#8b8f91",
      "--vomnibar-selected-bg": "rgba(28, 79, 145, 0.2)",
      "--vomnibar-hover-bg": "rgba(28, 79, 145, 0.1)",
      "--vomnibar-border-color": "#354256",
      "--vomnibar-accent-color": "#4972a7",
      "--vomnibar-url-color": "#f4c542",
      "--vomnibar-match-color": "#7795bd",
      "--vomnibar-gradient-1": "#1c4f91",
      "--vomnibar-gradient-2": "#2e6f95",
      "--vomnibar-gradient-3": "#2e6f95",
      "--vomnibar-input-text": "#f4ecd8",
      "--vomnibar-icon-color": "#8b8f91",
    },
  },
  {
    name: "Espresso",
    icon: "☕",
    description: "Velvet espresso roast",
    vars: {
      "--vomnibar-bg-color": "rgba(24, 18, 16, 0.92)",
      "--vomnibar-inner-bg": "#181210",
      "--vomnibar-text-color": "#fef3c7",
      "--vomnibar-secondary-text": "#978e75",
      "--vomnibar-selected-bg": "rgba(180, 83, 9, 0.2)",
      "--vomnibar-hover-bg": "rgba(180, 83, 9, 0.1)",
      "--vomnibar-border-color": "#413b31",
      "--vomnibar-accent-color": "#b45309",
      "--vomnibar-url-color": "#d97706",
      "--vomnibar-match-color": "#c77e47",
      "--vomnibar-gradient-1": "#b45309",
      "--vomnibar-gradient-2": "#78350f",
      "--vomnibar-gradient-3": "#a16207",
      "--vomnibar-input-text": "#fef3c7",
      "--vomnibar-icon-color": "#978e75",
    },
  },
  {
    name: "Omarchy",
    icon: "🖥️",
    description: "Omarchy cyan glow",
    vars: {
      "--vomnibar-bg-color": "rgba(18, 18, 18, 0.92)",
      "--vomnibar-inner-bg": "#121212",
      "--vomnibar-text-color": "#e0e0e0",
      "--vomnibar-secondary-text": "#9f9f9f",
      "--vomnibar-selected-bg": "rgba(0, 215, 215, 0.2)",
      "--vomnibar-hover-bg": "rgba(0, 215, 215, 0.1)",
      "--vomnibar-border-color": "#373737",
      "--vomnibar-accent-color": "#00d7d7",
      "--vomnibar-url-color": "#5fd7ff",
      "--vomnibar-match-color": "#87d7ff",
      "--vomnibar-gradient-1": "#00d7d7",
      "--vomnibar-gradient-2": "#5fffd7",
      "--vomnibar-gradient-3": "#5fd7ff",
      "--vomnibar-input-text": "#e0e0e0",
      "--vomnibar-icon-color": "#9f9f9f",
    },
  },
];

// Create a lookup map for efficient theme access
export const themeMap = new Map(themeDefinitions.map((t) => [t.name, t]));

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
   * Apply the saved theme and follow changes to it (e.g. made in another tab or synced from
   * another device). The theme lives in Settings (chrome.storage.sync), the same source the link
   * hints read, so the two always agree.
   */
  init() {
    this.loadSavedTheme();
    if (!this.listeningForSettings) {
      this.listeningForSettings = true;
      Settings.addEventListener("change", () => {
        if (this.isPreviewMode) return;
        const name = this.savedThemeName();
        if (name !== this.currentTheme) this.applyTheme(name, false);
      });
    }
  }

  savedThemeName() {
    const name = Settings.isLoaded() ? Settings.get("vomnibarTheme") : null;
    return themeMap.has(name) ? name : "Default";
  }

  loadSavedTheme() {
    let name = this.savedThemeName();
    // One-time migration: earlier versions kept the theme in this page's localStorage only.
    try {
      const legacy = localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
      if (legacy != null) {
        localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
        if (name === "Default" && legacy !== "Default" && themeMap.has(legacy)) {
          name = legacy;
          this.persist(name);
        }
      }
    } catch {
      // localStorage may be unavailable; Settings is the source of truth anyway.
    }
    this.applyTheme(name, false);
  }

  // Writes to chrome.storage.sync, which has a write quota and makes every tab reload its settings,
  // so this only runs when the user picks a theme, never on load or on cancel.
  persist(themeName) {
    if (Settings.isLoaded() && Settings.get("vomnibarTheme") !== themeName) {
      Settings.set("vomnibarTheme", themeName).catch(() => {});
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

    this.clearThemeVars();
    const root = document.documentElement;
    for (const [key, value] of Object.entries(theme.vars)) {
      root.style.setProperty(key, value);
    }
    // Set data attribute for per-theme CSS selectors (e.g. Google badge colors)
    root.setAttribute("data-vomnibar-theme", themeName);
    this.currentTheme = themeName;

    if (save && !this.isPreviewMode) this.persist(themeName);
    return true;
  }

  /**
   * Clear all theme CSS variables from the root element.
   */
  clearThemeVars() {
    const root = document.documentElement;
    for (const theme of themeDefinitions) {
      for (const key of Object.keys(theme.vars)) root.style.removeProperty(key);
    }
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
      this.persist(this.currentTheme);
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
