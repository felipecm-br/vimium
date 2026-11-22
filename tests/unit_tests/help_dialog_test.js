import * as testHelper from "./test_helper.js";
import { withPromise } from "./test_helper.js";
import "../../tests/unit_tests/test_chrome_stubs.js";
import "../../background_scripts/completion/completers.js";
import { allCommands } from "../../background_scripts/all_commands.js";
import { HelpDialogPage } from "../../pages/help_dialog_page.js";

context("help dialog", () => {
  setup(async () => {
    await testHelper.jsdomStub("pages/help_dialog_page.html");
    await Settings.onLoaded();
    const sessionGet = (key) => {
      if (key == "commandToOptionsToKeys") {
        const data = {
          "reload": {
            "": ["a"],
            "hard": ["b"],
          },
        };
        return { commandToOptionsToKeys: data };
      }
    };
    stub(chrome.storage.session, "get", withPromise(sessionGet));
  });

  should("getRowsForDialog includes one row per command-options pair", () => {
    const config = {
      "reload": {
        "": ["a"],
        "hard": ["b", "c"],
      },
    };
    const result = HelpDialogPage.getRowsForDialog(config);
    const rows = result["navigation"]
      .filter((row) => row[0].name == "reload");
    assert.equal(2, rows.length);
    assert.equal(["reload", "", ["a"]], [rows[0][0].name, rows[0][1], rows[0][2]]);
    assert.equal(["reload", "hard", ["b", "c"]], [rows[1][0].name, rows[1][1], rows[1][2]]);
  });

  should("list the Vomnibar's own keys and OmniSearch's prefixes, once", async () => {
    HelpDialogPage.init();
    await HelpDialogPage.show();
    await HelpDialogPage.show();
    const keys = Array.from(HelpDialogPage.dialogElement.querySelectorAll("#vomnibar-keys .key"))
      .map((e) => e.textContent);
    assert.equal(1, keys.filter((k) => k == ">").length);
    assert.isTrue(["Alt ↵", "→", "@", "theme", "effects"].every((k) => keys.includes(k)));
  });

  should("have a section in the help dialog for every group", async () => {
    // This test is to prevent code editing errors, where a command is added but doesn't have a
    // corresponding group in the help dialog.
    HelpDialogPage.init();
    await HelpDialogPage.show();
    const groups = Array.from(new Set(allCommands.map((c) => c.group))).sort();
    const groupsInDialog = Array.from(
      HelpDialogPage.dialogElement.querySelectorAll("div[data-group]"),
    )
      .map((e) => e.dataset.group)
      .sort();
    assert.equal(groups, groupsInDialog);
  });

  should("filter rows across command names, keys, and advanced commands", async () => {
    HelpDialogPage.init();
    await HelpDialogPage.show();
    HelpDialogPage.applyFilter("hard");
    assert.isTrue(HelpDialogPage.dialogElement.classList.contains("filtering"));
    const visibleReloadRows = Array.from(
      HelpDialogPage.dialogElement.querySelectorAll(
        '[data-group="navigation"] .row:not(.filtered-out)',
      ),
    );
    assert.equal(1, visibleReloadRows.length);
    assert.isTrue(visibleReloadRows[0].textContent.includes("hard"));

    HelpDialogPage.applyFilter("zzzz-no-match");
    assert.isFalse(HelpDialogPage.dialogElement.querySelector("#help-empty-state").hidden);

    HelpDialogPage.applyFilter("");
    assert.isFalse(HelpDialogPage.dialogElement.classList.contains("filtering"));
    assert.isTrue(HelpDialogPage.dialogElement.querySelector("#help-empty-state").hidden);
  });
});
