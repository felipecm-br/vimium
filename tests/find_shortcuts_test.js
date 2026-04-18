// Tests for find mode keyboard shortcuts
import { findModeShortcuts } from "./find_shortcuts.js";

Deno.test("find mode has nextMatch shortcut", () => {
  if (findModeShortcuts.nextMatch !== "n") throw new Error("expected 'n'");
});

Deno.test("find mode has prevMatch shortcut", () => {
  if (findModeShortcuts.prevMatch !== "N") throw new Error("expected 'N'");
});

Deno.test("find mode exits on Escape", () => {
  if (findModeShortcuts.exitFind !== "Escape") throw new Error("expected 'Escape'");
});
