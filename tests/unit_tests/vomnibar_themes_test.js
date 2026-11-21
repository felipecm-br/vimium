import "./test_helper.js";
import "../../tests/unit_tests/test_chrome_stubs.js";
import { defaultThemeVars, themeDefinitions } from "../../pages/vomnibar_themes.js";

function parseColor(value, bg = [0, 0, 0]) {
  const color = value.trim();
  if (color.startsWith("#")) {
    const hex = color.length === 4
      ? color.slice(1).split("").map((c) => c + c).join("")
      : color.slice(1);
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }
  const match = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/.exec(color);
  if (!match) throw new Error(`Unsupported color format: ${color}`);
  const [r, g, b] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const a = match[4] != null ? Number(match[4]) : 1;
  return [
    Math.round(r * a + bg[0] * (1 - a)),
    Math.round(g * a + bg[1] * (1 - a)),
    Math.round(b * a + bg[2] * (1 - a)),
  ];
}

function luminance([r, g, b]) {
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(c1, c2) {
  const l1 = luminance(c1);
  const l2 = luminance(c2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function parseRootDefaults(css) {
  const rootBlock = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
  const vars = {};
  for (const [, name, value] of rootBlock.matchAll(/(--vomnibar-[a-z0-9-]+):\s*([^;]+);/g)) {
    vars[name] = value.trim();
  }
  return vars;
}

context("Vomnibar and link-hint theme WCAG AA contrast", () => {
  should("keep every Vomnibar theme at WCAG AA contrast on both normal and selected rows", () => {
    const css = Deno.readTextFileSync(
      new URL("../../pages/vomnibar_page.css", import.meta.url),
    );
    const defaults = parseRootDefaults(css);
    const failures = [];
    for (const theme of themeDefinitions) {
      const vars = { ...defaults, ...theme.vars };
      const bg = parseColor(vars["--vomnibar-inner-bg"]);
      const selectedBg = parseColor(vars["--vomnibar-selected-bg"], bg);
      const checks = [
        ["text/bg", parseColor(vars["--vomnibar-text-color"], bg), bg, 4.5],
        ["secondary/bg", parseColor(vars["--vomnibar-secondary-text"], bg), bg, 4.5],
        [
          "secondary/selected",
          parseColor(vars["--vomnibar-secondary-text"], selectedBg),
          selectedBg,
          4.5,
        ],
        ["url/bg", parseColor(vars["--vomnibar-url-color"], bg), bg, 4.5],
        ["match/bg", parseColor(vars["--vomnibar-match-color"], bg), bg, 4.5],
        ["match/selected", parseColor(vars["--vomnibar-match-color"], selectedBg), selectedBg, 4.5],
        ["accent/bg", parseColor(vars["--vomnibar-accent-color"], bg), bg, 3.0],
        ["input/bg", parseColor(vars["--vomnibar-input-text"], bg), bg, 4.5],
      ];
      for (const [label, fg, surface, minRatio] of checks) {
        const ratio = contrastRatio(fg, surface);
        if (ratio < minRatio) {
          failures.push(`${theme.name} ${label}: ${ratio.toFixed(2)} < ${minRatio}`);
        }
      }
    }
    assert.equal([], failures);
  });

  should("keep every themed link-hint badge at WCAG AA contrast", () => {
    const css = Deno.readTextFileSync(
      new URL("../../content_scripts/vimium.css", import.meta.url),
    );
    const pattern = /div#vimium-hint-marker-container\.vimium-theme-([a-z0-9-]+)\s*\{([^}]*)\}/g;
    const failures = [];
    let count = 0;
    for (const [, slug, body] of css.matchAll(pattern)) {
      count++;
      const vars = Object.fromEntries(
        [...body.matchAll(/(--vimium-hint-[a-z-]+):\s*(#[0-9a-fA-F]{6})/g)].map((
          m,
        ) => [m[1], m[2]]),
      );
      const text = parseColor(vars["--vimium-hint-text"]);
      const bgStart = parseColor(vars["--vimium-hint-bg-start"]);
      const bgEnd = parseColor(vars["--vimium-hint-bg-end"]);
      const minRatio = Math.min(contrastRatio(text, bgStart), contrastRatio(text, bgEnd));
      if (minRatio < 4.5) {
        failures.push(`${slug}: ${minRatio.toFixed(2)} < 4.5`);
      }
    }
    assert.equal(themeDefinitions.length, count);
    assert.equal([], failures);
  });

  should(
    "keep defaultThemeVars in sync with vomnibar_page.css :root and cover every keystroke popup theme",
    () => {
      const vomnibarCss = Deno.readTextFileSync(
        new URL("../../pages/vomnibar_page.css", import.meta.url),
      );
      const rootDefaults = parseRootDefaults(vomnibarCss);
      for (const [key, value] of Object.entries(defaultThemeVars)) {
        assert.equal(rootDefaults[key], value, `defaultThemeVars drift on ${key}`);
      }

      const vimiumCss = Deno.readTextFileSync(
        new URL("../../content_scripts/vimium.css", import.meta.url),
      );
      const kpPattern = /#vimium-keystroke-popup\.vimium-theme-([a-z0-9-]+)\s*\{([^}]*)\}/g;
      const slugs = new Set();
      const failures = [];
      for (const [, slug, body] of vimiumCss.matchAll(kpPattern)) {
        slugs.add(slug);
        const vars = Object.fromEntries(
          [...body.matchAll(/(--kp-[a-z-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
        );
        const bg = parseColor(vars["--kp-bg"]);
        const text = parseColor(vars["--kp-text"], bg);
        const muted = parseColor(vars["--kp-muted"], bg);
        const accent = parseColor(vars["--kp-accent"], bg);
        if (contrastRatio(text, bg) < 4.5) failures.push(`${slug} text`);
        if (contrastRatio(muted, bg) < 4.5) failures.push(`${slug} muted`);
        if (contrastRatio(accent, bg) < 3.0) failures.push(`${slug} accent`);
      }
      assert.equal(themeDefinitions.length, slugs.size);
      assert.equal([], failures);
    },
  );
});
