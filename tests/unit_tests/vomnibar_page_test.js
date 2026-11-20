import * as testHelper from "./test_helper.js";
import { withPromise } from "./test_helper.js";
import "../../tests/unit_tests/test_chrome_stubs.js";
import {
  CommandCompleter,
  MultiCompleter,
  Suggestion,
} from "../../background_scripts/completion/completers.js";
import * as vomnibarPage from "../../pages/vomnibar_page.js";
import * as userSearchEngines from "../../background_scripts/user_search_engines.js";
import { Commands } from "../../background_scripts/commands.js";
import { filterCompleter } from "./completion/completers_test.js";
import { themeDefinitions, themeManager } from "../../pages/vomnibar_themes.js";
import { borderMotion } from "../../pages/vomnibar_border.js";
import { effectsManager } from "../../pages/vomnibar_effects.js";

function newKeyEvent(properties) {
  return Object.assign(
    {
      type: "keydown",
      key: "a",
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
      stopImmediatePropagation: function () {},
      preventDefault: function () {},
    },
    properties,
  );
}

context("vomnibar page", () => {
  let ui;
  setup(async () => {
    await testHelper.jsdomStub("pages/vomnibar_page.html");
    stub(
      chrome.runtime,
      "sendMessage",
      withPromise((message) => {
        if (message.handler == "filterCompletions") {
          return [];
        }
      }),
    );
    vomnibarPage.reset();
    await vomnibarPage.activate();
    ui = vomnibarPage.ui;
  });

  should("hide when escape is pressed", async () => {
    ui.setQuery("www.example.com");
    // Here we assert that the dialog has been reset when esc is pressed, which happens as part of
    // hiding the dialog. It would be better to check more directly that the dialog was hidden, but
    // jacking into the channels for this are not worthwhile for this test.
    await ui.onKeyEvent(newKeyEvent({ key: "Escape" }));
    // The dialog resets after its slide-out animation (hideAnimations: animationend, or a 160ms
    // fallback), not synchronously.
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal("", ui.input.value);
  });

  const altDown = () => ui._onGoogleModeModifierDown(newKeyEvent({ key: "Alt", altKey: true }));
  const altUp = () => ui._onGoogleModeModifierUp(newKeyEvent({ type: "keyup", key: "Alt" }));
  const waitPastHold = () =>
    new Promise((resolve) => setTimeout(resolve, vomnibarPage.GOOGLE_MODE_HOLD_MS + 50));

  should(
    "show Google mode only while Alt is held on its own, and leave it on release",
    async () => {
      ui.setQuery("vimium");
      altDown();
      assert.isFalse(ui.isGoogleSearchMode);
      await waitPastHold();
      assert.isTrue(ui.isGoogleSearchMode);
      assert.isTrue(ui.box.classList.contains("google-search-mode"));
      altUp();
      assert.isFalse(ui.isGoogleSearchMode);
    },
  );

  should("not show Google mode for an Alt tap or chord, nor while typing capitals", async () => {
    ui.setQuery("vimium");
    altDown();
    altUp();
    await waitPastHold();
    assert.isFalse(ui.isGoogleSearchMode);

    altDown();
    ui._onGoogleModeModifierDown(newKeyEvent({ key: "Tab", altKey: true }));
    await waitPastHold();
    assert.isFalse(ui.isGoogleSearchMode);
    altUp();

    ui._onGoogleModeModifierDown(newKeyEvent({ key: "Shift", shiftKey: true }));
    await waitPastHold();
    assert.isFalse(ui.isGoogleSearchMode);
  });

  should("leave Google mode when a key arrives without Alt (a missed keyup)", async () => {
    ui.setQuery("vimium");
    altDown();
    await waitPastHold();
    assert.isTrue(ui.isGoogleSearchMode);
    ui._onGoogleModeModifierDown(newKeyEvent({ key: "a", altKey: false }));
    assert.isFalse(ui.isGoogleSearchMode);
  });

  should("search the web on Alt+Enter right away, whatever is selected", async () => {
    ui.setCompleterName("omniSearch");
    ui.setQuery("rust book");
    ui.allCompletions = ui.completions = [
      new Suggestion({ queryTerms: [], description: "tab", url: "https://a.example", tabId: 1 }),
    ];
    ui.selection = 0;
    let message = null;
    stub(chrome.runtime, "sendMessage", withPromise((m) => (message = m)));
    await ui.onKeyEvent(newKeyEvent({ type: "keydown", key: "Enter", altKey: true }));
    ui.onHidden();
    assert.equal(
      { handler: "launchSearchQuery", query: "rust book", openInNewTab: false },
      message,
    );
  });

  should("open in a new tab on Shift+Enter, not search the web", async () => {
    ui.setQuery("www.example.com");
    let message = null;
    stub(chrome.runtime, "sendMessage", withPromise((m) => (message = m)));
    await ui.onKeyEvent(newKeyEvent({ type: "keypress", key: "Enter", shiftKey: true }));
    ui.onHidden();
    assert.equal("openUrlInNewTab", message?.handler);
  });

  should("preview the selected theme on later pages of the theme list", async () => {
    ui.setCompleterName("omniSearch");
    ui.setQuery("theme");
    await ui.update();
    // Move past the first page so the index within the page differs from the index in the list.
    const target = ui.itemsPerPage + 2;
    assert.isTrue(themeDefinitions.length > target);
    for (let i = 0; i < target; i++) {
      await ui.onKeyEvent(newKeyEvent({ key: "down" }));
    }
    assert.equal(themeDefinitions[target].name, themeManager.getCurrentTheme());
    const selected = ui.completionList.querySelector("li.selected");
    assert.isTrue(selected.classList.contains("theme-item"));
    assert.isTrue(selected.textContent.includes(themeDefinitions[target].name));
  });

  should("change border speed and angle in theme mode, and revert them on escape", async () => {
    ui.setCompleterName("omniSearch");
    ui.setQuery("theme");
    await ui.update();
    const start = { speed: borderMotion.speed.label, angle: borderMotion.angle };
    await ui.onKeyEvent(newKeyEvent({ key: "ArrowRight" }));
    await ui.onKeyEvent(newKeyEvent({ key: "ArrowRight", ctrlKey: true }));
    assert.isTrue(borderMotion.speed.label != start.speed);
    assert.equal((start.angle + 45) % 360, borderMotion.angle);
    assert.equal(
      `${borderMotion.angle}deg`,
      ui.box.style.getPropertyValue("--vomnibar-border-offset"),
    );
    assert.isTrue(ui.box.querySelector("#vomnibar-theme-footer").textContent.includes("45°"));
    await ui.onKeyEvent(newKeyEvent({ key: "Escape" }));
    assert.equal(start.speed, borderMotion.speed.label);
    assert.equal(start.angle, borderMotion.angle);
  });

  should("stop the border rotation at speed Off", async () => {
    ui.setCompleterName("omniSearch");
    ui.setQuery("theme");
    await ui.update();
    for (let i = 0; i < 10; i++) {
      await ui.onKeyEvent(newKeyEvent({ key: "ArrowLeft" }));
    }
    assert.equal("Off", borderMotion.speed.label);
    assert.isTrue(ui.box.classList.contains("static-border"));
    await ui.onKeyEvent(newKeyEvent({ key: "ArrowRight" }));
    assert.isFalse(ui.box.classList.contains("static-border"));
    borderMotion.cancelPreview();
  });

  should("leave left and right alone outside theme mode", async () => {
    ui.setQuery("www.example.com");
    const angle = borderMotion.angle;
    await ui.onKeyEvent(newKeyEvent({ key: "ArrowRight", ctrlKey: true }));
    assert.equal(angle, borderMotion.angle);
    assert.isFalse(borderMotion.hasPendingPreview());
  });

  should("save the theme and border to Settings only when a theme is confirmed", async () => {
    const savedTheme = Settings.get("vomnibarTheme");
    const savedBorder = Settings.get("vomnibarBorderMotion");
    ui.setCompleterName("omniSearch");
    ui.setQuery("theme");
    await ui.update();
    await ui.onKeyEvent(newKeyEvent({ key: "down" }));
    await ui.onKeyEvent(newKeyEvent({ key: "ArrowRight", ctrlKey: true }));
    // Previewing writes nothing to chrome.storage.sync.
    assert.equal(savedTheme, Settings.get("vomnibarTheme"));
    assert.equal(savedBorder, Settings.get("vomnibarBorderMotion"));
    const previewed = themeManager.getCurrentTheme();
    await ui.onKeyEvent(newKeyEvent({ type: "keypress", key: "Enter" }));
    assert.equal(previewed, Settings.get("vomnibarTheme"));
    assert.equal((savedBorder.angle + 45) % 360, Settings.get("vomnibarBorderMotion").angle);
    await Settings.set("vomnibarTheme", savedTheme);
    await Settings.set("vomnibarBorderMotion", savedBorder);
  });

  const effectsAttribute = () => document.documentElement.dataset.vomnibarEffects;

  should("list the effects levels and preview the selected one live", async () => {
    ui.setCompleterName("omniSearch");
    ui.setQuery("effects");
    await ui.update();
    assert.equal(["Full", "Calm", "Quick", "Fast"], ui.themeCompletions.map((c) => c.name));
    assert.equal("full", effectsAttribute());
    await ui.onKeyEvent(newKeyEvent({ key: "ArrowDown" }));
    await ui.onKeyEvent(newKeyEvent({ key: "ArrowDown" }));
    assert.equal("quick", effectsAttribute());
    await ui.onKeyEvent(newKeyEvent({ key: "ArrowDown" }));
    assert.equal("fast", effectsAttribute());
    // Left and right are for the border, in the theme picker only.
    const border = JSON.stringify(borderMotion.describe());
    await ui.onKeyEvent(newKeyEvent({ key: "ArrowRight" }));
    assert.equal(border, JSON.stringify(borderMotion.describe()));
    // Escape reverts the preview and saves nothing.
    await ui.onKeyEvent(newKeyEvent({ key: "Escape" }));
    assert.equal("full", effectsAttribute());
    assert.equal("Full", Settings.get("vomnibarEffects"));
  });

  should("save the effects level when it is confirmed, and skip the slide when Fast", async () => {
    ui.setCompleterName("omniSearch");
    ui.setQuery("effects fast");
    await ui.update();
    assert.equal(["Fast"], ui.themeCompletions.map((c) => c.name));
    await ui.onKeyEvent(newKeyEvent({ type: "keypress", key: "Enter" }));
    // Settings.set writes in two steps (remove defaults, then set), each followed by a "change".
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal("Fast", Settings.get("vomnibarEffects"));
    assert.equal("fast", effectsAttribute());
    ui.showAnimations();
    assert.isFalse(ui.box.classList.contains("vomnibar-slide-in"));
    // Closing doesn't wait for a slide-out.
    let resolved = false;
    ui.hideAnimations().then(() => (resolved = true));
    await Promise.resolve();
    assert.isTrue(resolved);
    await Settings.set("vomnibarEffects", "Full");
    await new Promise((resolve) => setTimeout(resolve, 20));
    effectsManager.init();
    assert.equal("full", effectsAttribute());
  });

  should("open and close at once in Quick too", () => {
    effectsManager.preview("Quick");
    ui.showAnimations();
    assert.isFalse(ui.box.classList.contains("vomnibar-slide-in"));
    effectsManager.preview("Full");
    ui.showAnimations();
    assert.isTrue(ui.box.classList.contains("vomnibar-slide-in"));
    effectsManager.cancelPreview();
  });

  should("expose the results to screen readers as a combobox with an active option", async () => {
    ui.setCompleterName("omniSearch");
    ui.setQuery("theme");
    await ui.update();
    await ui.onKeyEvent(newKeyEvent({ key: "down" }));
    const selected = ui.completionList.querySelector("li.selected");
    assert.equal("option", selected.getAttribute("role"));
    assert.equal("true", selected.getAttribute("aria-selected"));
    assert.equal(selected.id, ui.input.getAttribute("aria-activedescendant"));
    assert.equal("true", ui.input.getAttribute("aria-expanded"));
    assert.equal(1, ui.completionList.querySelectorAll('[aria-selected="true"]').length);
  });

  should("edit a completion's URL when ctrl-enter is pressed", async () => {
    stub(
      chrome.runtime,
      "sendMessage",
      withPromise((message) => {
        if (message.handler == "filterCompletions") {
          const s = new Suggestion({ url: "http://hello.com" });
          return [s];
        }
      }),
    );
    await ui.update();
    await ui.onKeyEvent(newKeyEvent({ type: "keydown", key: "up" }));
    // TODO(philc): Why does this need to be lowercase enter?
    await ui.onKeyEvent(newKeyEvent({ type: "keypress", ctrlKey: true, key: "enter" }));
    assert.equal("http://hello.com", ui.input.value);
  });

  should("open a URL-like query when enter is pressed", async () => {
    ui.setQuery("www.example.com");
    let handler = null;
    let url = null;
    stub(
      chrome.runtime,
      "sendMessage",
      withPromise((message) => {
        handler = message.handler;
        url = message.url;
      }),
    );
    await ui.onKeyEvent(newKeyEvent({ type: "keypress", key: "Enter" }));
    ui.onHidden();
    assert.equal("openUrlInCurrentTab", handler);
    assert.equal("www.example.com", url);
  });

  should("search the web on enter with no results in omniSearch", async () => {
    ui.setCompleterName("omniSearch");
    ui.setQuery("zzqq no match");
    let message = null;
    stub(chrome.runtime, "sendMessage", withPromise((m) => (message = m)));
    await ui.onKeyEvent(newKeyEvent({ type: "keypress", key: "Enter" }));
    ui.onHidden();
    assert.equal("launchSearchQuery", message?.handler);
    assert.equal("zzqq no match", message?.query);
  });

  should("launch a web search for the query as typed from the web search row", async () => {
    ui.setCompleterName("omniSearch");
    ui.setQuery("rust ownership");
    ui.allCompletions = ui.completions = [
      new Suggestion({
        queryTerms: [],
        description: "search",
        url: "",
        title: "rust",
        webSearchQuery: "rust",
        relevancy: 1,
      }),
    ];
    ui.selection = 0;
    let message = null;
    stub(chrome.runtime, "sendMessage", withPromise((m) => (message = m)));
    await ui.onKeyEvent(newKeyEvent({ type: "keypress", key: "Enter" }));
    ui.onHidden();
    assert.equal("launchSearchQuery", message?.handler);
    // The input, not the possibly older query of the row.
    assert.equal("rust ownership", message?.query);
  });

  const fakeSuggestion = (description, url, extra = {}) =>
    new Suggestion({
      queryTerms: [],
      description,
      url,
      title: url,
      relevancyFunction: () => 1,
      ...extra,
    });

  should("forget a visited page on shift-delete, close a tab, and keep a bookmark", async () => {
    const sent = [];
    stub(chrome.runtime, "sendMessage", withPromise((m) => sent.push(m)));
    ui.allCompletions = [
      fakeSuggestion("history", "https://a.example"),
      fakeSuggestion("tab", "https://b.example", { tabId: 7 }),
      fakeSuggestion("bookmark", "https://c.example"),
    ];
    ui.currentPage = 0;
    ui.renderCurrentPage();
    ui.globalSelection = 0;
    ui.updatePageAndSelection();
    const shiftDelete = () => ui.onKeyEvent(newKeyEvent({ key: "Delete", shiftKey: true }));

    await shiftDelete();
    await shiftDelete();
    await shiftDelete();
    assert.equal(
      [
        { handler: "removeHistoryEntry", url: "https://a.example" },
        { handler: "closeTabFromVomnibar", tabIdToBeRemoved: 7 },
      ],
      sent,
    );
    assert.equal(["https://c.example"], ui.allCompletions.map((c) => c.url));
  });

  should("offer a web search as a selectable result when nothing matches", async () => {
    ui.setQuery("zzqq nothing");
    await ui.update();
    assert.equal(1, ui.allCompletions.length);
    assert.equal("zzqq nothing", ui.allCompletions[0].webSearchQuery);
    // In omni the selection starts empty; Down selects the web search.
    await ui.onKeyEvent(newKeyEvent({ key: "ArrowDown" }));
    assert.equal(0, ui.selection);
    let message = null;
    stub(chrome.runtime, "sendMessage", withPromise((m) => (message = m)));
    await ui.onKeyEvent(newKeyEvent({ type: "keypress", key: "Enter" }));
    ui.onHidden();
    assert.equal("launchSearchQuery", message?.handler);
    assert.equal("zzqq nothing", message?.query);
  });

  context("address completion", () => {
    const { addressCompletion } = vomnibarPage;

    should("complete the host, or the path once it is being typed", () => {
      assert.equal("hub.com", addressCompletion("git", "https://www.github.com/philc"));
      assert.equal("ilc", addressCompletion("github.com/ph", "https://github.com/philc"));
      assert.equal("hub.com", addressCompletion("GIT", "https://github.com/"));
      assert.equal("ithub.com", addressCompletion("www.g", "https://www.github.com/"));
    });

    should("complete nothing that doesn't start the address, or isn't a web page", () => {
      assert.equal(null, addressCompletion("hub", "https://github.com/"));
      assert.equal(null, addressCompletion("rust book", "https://rust.org/book"));
      assert.equal(null, addressCompletion("github.com", "https://github.com/"));
      assert.equal(null, addressCompletion("java", "javascript:alert(1)"));
      assert.equal(null, addressCompletion("", "https://github.com/"));
    });

    should(
      "show the rest of the first result's address after the text, and type it in",
      async () => {
        const sent = [];
        stub(
          chrome.runtime,
          "sendMessage",
          withPromise((m) => {
            sent.push(m);
            return m.handler == "filterCompletions" ? [] : undefined;
          }),
        );
        ui.setCompleterName("omniSearch");
        ui.setQuery("git");
        ui.allCompletions = ["https://github.com/philc", "https://gitlab.com/"].map((url) =>
          new Suggestion({
            queryTerms: [],
            description: "history",
            url,
            relevancyFunction: () => 1,
          })
        );
        ui.currentPage = 0;
        ui.renderCurrentPage();
        ui.globalSelection = 0;
        ui.updatePageAndSelection();
        const ghost = () => [ui.ghostTyped.textContent, ui.ghostRest.textContent];
        assert.equal(["git", "hub.com"], ghost());

        // Not for a result Enter wouldn't open, nor with the caret before the end.
        await ui.onKeyEvent(newKeyEvent({ key: "ArrowDown" }));
        assert.equal(["", ""], ghost());
        await ui.onKeyEvent(newKeyEvent({ key: "ArrowUp" }));
        assert.equal(["git", "hub.com"], ghost());
        ui.input.setSelectionRange(1, 1);
        ui.updateGhost();
        assert.equal(["", ""], ghost());
        ui.input.setSelectionRange(3, 3);
        ui.updateGhost();

        await ui.onKeyEvent(newKeyEvent({ key: "ArrowRight" }));
        assert.equal("github.com", ui.input.value);
        assert.equal("github.com", sent.findLast((m) => m.handler == "filterCompletions").query);
      },
    );
  });

  context("row actions", () => {
    const row = (description, extra = {}) =>
      new Suggestion({
        queryTerms: [],
        description,
        url: "https://a.example/",
        relevancyFunction: () => 1,
        ...extra,
      });
    const labels = (completion) => {
      const container = document.createElement("div");
      container.innerHTML = ui.rowActionsHtml(completion);
      return [...container.querySelectorAll(".row-action")].map((a) => a.textContent);
    };

    should("name what each kind of result can do besides opening", () => {
      stub(KeyboardUtils, "platform", "Linux");
      assert.equal(["Ctrl Dclose", "Ctrl Ccopy"], labels(row("tab", { tabId: 3 })));
      assert.equal(["⇧Delforget", "Ctrl Ccopy"], labels(row("history")));
      assert.equal(["⇧↵new tab", "Ctrl Ccopy"], labels(row("bookmark")));
      ui.setForceNewTab(true);
      assert.equal(["Ctrl Ccopy"], labels(row("bookmark")));
      assert.equal([], labels(row("search", { url: "", webSearchQuery: "q" })));
    });

    should("copy the selected result's URL, unless text is selected in the input", async () => {
      stub(KeyboardUtils, "platform", "Linux");
      const copied = [];
      // Deno's navigator has no clipboard to stub.
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: (text) => Promise.resolve(copied.push(text)) },
        configurable: true,
      });
      ui.setQuery("exa");
      ui.allCompletions = [row("history")];
      ui.currentPage = 0;
      ui.renderCurrentPage();
      ui.globalSelection = 0;
      ui.updatePageAndSelection();
      await ui.onKeyEvent(newKeyEvent({ key: "c", ctrlKey: true }));
      assert.equal(["https://a.example/"], copied);
      assert.equal("Copied", ui.positionIndicator.textContent);
      assert.equal("Copied", ui.status.textContent);
      ui.input.setSelectionRange(0, 2);
      await ui.onKeyEvent(newKeyEvent({ key: "c", ctrlKey: true }));
      assert.equal(1, copied.length);
      delete navigator.clipboard;
    });
  });

  context("OmniSearch lists", () => {
    should("reopen a recently closed tab with Enter", async () => {
      const sent = [];
      stub(chrome.runtime, "sendMessage", withPromise((m) => sent.push(m)));
      ui.setCompleterName("omniSearch");
      ui.setQuery("@rust");
      ui.allCompletions = [
        new Suggestion({
          queryTerms: [],
          description: "closedTab",
          url: "https://rust-lang.org/",
          title: "Rust",
          sessionId: "t1",
          relevancy: 1,
        }),
      ];
      ui.currentPage = 0;
      ui.renderCurrentPage();
      ui.globalSelection = 0;
      ui.updatePageAndSelection();
      await ui.onKeyEvent(newKeyEvent({ type: "keypress", key: "Enter" }));
      ui.onHidden();
      assert.equal([{ handler: "restoreSession", sessionId: "t1" }], sent);
    });

    should("not offer a web search when nothing in a list matches", async () => {
      ui.setCompleterName("omniSearch");
      ui.setQuery("> zzqq");
      await ui.update();
      assert.equal(0, ui.allCompletions.length);
      ui.setQuery("zzqq");
      await ui.update();
      assert.equal("zzqq", ui.allCompletions[0].webSearchQuery);
    });
  });

  should("switch to an open tab with the button on its row", () => {
    const sent = [];
    stub(chrome.runtime, "sendMessage", withPromise((m) => sent.push(m)));
    ui.setCompleterName("omniSearch");
    ui.setQuery("rust");
    stub(chrome.runtime, "getURL", returns("https://test/"));
    const tab = new Suggestion({
      queryTerms: [],
      description: "tab",
      url: "https://doc.rust-lang.org/",
      title: "Rust",
      tabId: 7,
      relevancy: 1,
    });
    tab.generateHtml();
    ui.allCompletions = [tab];
    ui.currentPage = 0;
    ui.renderCurrentPage();
    const button = ui.completionList.querySelector(".switch-tab-btn");
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    assert.equal(
      [
        { handler: "rememberVomnibarChoice", query: "rust", url: "https://doc.rust-lang.org/" },
        { handler: "switchTabFromVomnibar", tabIdToSwitch: 7 },
      ],
      sent,
    );
  });

  should("open a result when it is clicked, in a new tab with ctrl", async () => {
    const opened = [];
    stub(
      chrome.runtime,
      "sendMessage",
      withPromise((m) => {
        if (m.handler == "filterCompletions") return [];
        if (m.handler == "openUrlInCurrentTab" || m.handler == "openUrlInNewTab") opened.push(m);
      }),
    );
    for (const ctrlKey of [false, true]) {
      vomnibarPage.reset();
      await vomnibarPage.activate();
      ui = vomnibarPage.ui;
      ui.setQuery("example");
      const completions = ["https://a.example", "https://b.example"].map((url) =>
        new Suggestion({
          queryTerms: [],
          description: "history",
          url,
          title: url,
          relevancyFunction: () => 1,
        })
      );
      ui.allCompletions = completions;
      ui.currentPage = 0;
      ui.renderCurrentPage();
      const item = ui.completionList.querySelectorAll("li")[1];
      await ui.onCompletionClick({
        target: item,
        ctrlKey,
        shiftKey: false,
        altKey: false,
        metaKey: false,
      });
      ui.onHidden();
    }
    assert.equal(["openUrlInCurrentTab", "openUrlInNewTab"], opened.map((m) => m.handler));
    assert.equal(["https://b.example", "https://b.example"], opened.map((m) => m.url));
  });

  should("search for a non-URL query when enter is pressed", async () => {
    ui.setQuery("example");
    let handler = null;
    let query = null;
    stub(
      chrome.runtime,
      "sendMessage",
      withPromise((message) => {
        handler = message.handler;
        query = message.query;
      }),
    );
    await ui.onKeyEvent(newKeyEvent({ type: "keypress", key: "Enter" }));
    ui.onHidden();
    assert.equal("launchSearchQuery", handler);
    assert.equal("example", query);
  });

  // This test covers #4396.
  should("not treat javascript keywords as user-defined search engines", () => {
    ui.setQuery("constructor "); // "constructor" is a built-in JS property
    ui.onInput();
    // The query should not be treated as a user search engine.
    assert.equal("constructor ", ui.input.value);
  });

  should("use custom search engine when enter is pressed before completions arrive", async () => {
    userSearchEngines.set("e: https://www.example.com/search?q=%s Example");

    let capturedUrl = null;
    stub(
      chrome.runtime,
      "sendMessage",
      withPromise((message) => {
        // Return a never-resolving promise for filterCompletions to simulate the race condition where
        // the user hits Enter before the background page responds with completions.
        if (message.handler === "filterCompletions") return new Promise(() => {});
        if (message.handler === "openUrlInCurrentTab") capturedUrl = message.url;
      }),
    );

    ui.setQuery("e hello");
    ui.onInput();
    // completions is empty because the filterCompletions stub, above, is unresolved.
    assert.equal(0, ui.completions.length);

    await ui.onKeyEvent(newKeyEvent({ type: "keypress", key: "Enter" }));
    ui.onHidden();

    assert.equal("https://www.example.com/search?q=hello", capturedUrl);
  });

  should("create command suggestions with correct HTML for key bindings", async () => {
    await Commands.loadKeyMappings("");
    const multiCompleter = new MultiCompleter([new CommandCompleter()]);
    const suggestions = await filterCompleter(multiCompleter, ["go", "tab", "right"]);
    stub(chrome.runtime, "sendMessage", withPromise(() => suggestions));
    await ui.updateCompletions();
    assert.equal(1, ui.completionList.childNodes.length);
    const keys = Array.from(ui.completionList.querySelectorAll(".key")).map((x) => x.textContent);
    assert.equal(["K", "gt"], keys);
  });
});
