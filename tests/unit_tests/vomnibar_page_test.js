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
    assert.equal("", ui.input.value);
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
    assert.equal(`${borderMotion.angle}deg`, ui.box.style.getPropertyValue("--vomnibar-border-offset"));
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
