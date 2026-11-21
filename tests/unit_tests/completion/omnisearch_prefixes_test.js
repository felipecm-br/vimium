import "../test_helper.js";
import { withPromise } from "../test_helper.js";
import "../../../background_scripts/tab_recency.js";
import "../../../background_scripts/bg_utils.js";
import { Commands } from "../../../background_scripts/commands.js";
import {
  OmniSearchCompleter,
  omniSearchPrefix,
} from "../../../background_scripts/completion/completers.js";

context("OmniSearch prefixes", () => {
  should("tell the lists apart from a plain query, and split what follows", () => {
    assert.equal({ prefix: ">", queryTerms: ["new", "tab"] }, omniSearchPrefix(">new  tab"));
    assert.equal({ prefix: "@", queryTerms: [] }, omniSearchPrefix(" @ "));
    assert.equal(null, omniSearchPrefix("rust > go"));
    assert.equal(null, omniSearchPrefix(""));
  });

  context("filter", () => {
    let completer;
    const filter = (query) => completer.filter({ queryTerms: query.split(/\s+/), query });

    setup(() => {
      completer = new OmniSearchCompleter();
      stub(chrome.runtime, "getURL", returns("https://test/"));
      stub(chrome.storage.session, "get", withPromise(() => ({ commandToOptionsToKeys: {} })));
      stub(Commands, "keyToRegistryEntry", {});
      stub(chrome.sessions, "getRecentlyClosed", () =>
        Promise.resolve([
          { tab: { sessionId: "t1", url: "https://rust-lang.org/", title: "Rust" } },
          {
            window: {
              sessionId: "w1",
              tabs: [
                { url: "https://deno.com/", title: "Deno" },
                { url: "https://jsr.io/", title: "JSR" },
              ],
            },
          },
        ]));
    });

    should("list Vimium's commands after >, to run one", async () => {
      const results = await filter(">new tab");
      assert.isTrue(results.length > 0);
      assert.isTrue(results.every((s) => s.command != null));
      assert.isTrue(results.some((s) => s.command.registryEntry.command === "createTab"));
      assert.isFalse(results.some((s) => s.webSearchQuery != null));
    });

    should("match Vimium commands by word initials after > and highlight them", async () => {
      const cnt = await filter(">cnt");
      const createTab = cnt.find((s) => s.command.registryEntry.command === "createTab");
      assert.isTrue(createTab != null);
      assert.isTrue(
        createTab.html.includes(
          "<span class='match'>C</span>reate <span class='match'>n</span>ew <span class='match'>t</span>ab",
        ),
      );
      const dt = await filter(">dt");
      assert.isTrue(dt.some((s) => s.command.registryEntry.command === "duplicateTab"));
    });

    should("list the recently closed tabs after @, a window as one row", async () => {
      const results = await filter("@");
      assert.equal(["t1", "w1"], results.map((s) => s.sessionId));
      assert.equal("Deno, and 1 more tab", results[1].title);
      assert.isTrue(results[1].html.includes("history_2"));
    });

    should("filter the closed tabs, matching a window by any of its tabs", async () => {
      assert.equal(["w1"], (await filter("@ jsr")).map((s) => s.sessionId));
      assert.equal([], (await filter("@ nothing")).map((s) => s.sessionId));
    });
  });
});
