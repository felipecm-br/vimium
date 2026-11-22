import "./test_helper.js";
import "../../lib/url_utils.js";
import "../../lib/keyboard_utils.js";
import "../../lib/settings.js";
import "../../content_scripts/mode.js";
import "../../content_scripts/link_hints.js";

context("With insufficient link characters", () => {
  setup(async () => {
    await Settings.onLoaded();
  });

  teardown(async () => {
    await Settings.clear();
  });

  should("throw error in AlphabetHints", async () => {
    await Settings.set("linkHintCharacters", "ab");
    new AlphabetHints();
    await Settings.set("linkHintCharacters", "a");
    assert.throwsError(() => new AlphabetHints(), "Error");
  });

  should("throw error in FilterHints", async () => {
    await Settings.set("linkHintNumbers", "12");
    new FilterHints();
    await Settings.set("linkHintNumbers", "1");
    assert.throwsError(() => new FilterHints(), "Error");
  });
});

context("LocalHints.parseCustomSelectors", () => {
  should(
    "parse global, site-scoped, and exclusion selectors without breaking CSS pseudo-classes",
    () => {
      const config = [
        "# comment",
        "div:not(.disabled)[data-card]",
        "!.noisy-overlay",
        "github.com: [data-testid='issue-row']",
        "github.com: !.tooltip",
        "reddit.com: shreddit-post",
      ].join("\n");

      const gh = LocalHints.parseCustomSelectors(config, "https://github.com/philc/vimium");
      assert.equal(["div:not(.disabled)[data-card]", "[data-testid='issue-row']"], gh.include);
      assert.equal([".noisy-overlay", ".tooltip"], gh.exclude);

      const other = LocalHints.parseCustomSelectors(config, "https://example.org/");
      assert.equal(["div:not(.disabled)[data-card]"], other.include);
      assert.equal([".noisy-overlay"], other.exclude);
    },
  );
});
