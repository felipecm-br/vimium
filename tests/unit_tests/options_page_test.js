import * as testHelper from "./test_helper.js";
import "../../tests/unit_tests/test_chrome_stubs.js";
import * as optionsPage from "../../pages/options.js";

context("options page", () => {
  setup(async () => {
    await testHelper.jsdomStub("pages/options.html");
    await optionsPage.init();
  });

  teardown(async () => {
    await Settings.clear();
  });

  should("populate the form fields with the settings", () => {
    const settings = Settings.getSettings();
    const field = optionsPage.getOptionEl("keyMappings");
    assert.isTrue(Settings.defaultOptions.keyMappings.length > 0);
    assert.equal(Settings.defaultOptions.keyMappings, settings.keyMappings);
    assert.equal(settings.keyMappings, field.value);
  });

  should("show validation errors for invalid fields on save", async () => {
    const el = optionsPage.getOptionEl("keyMappings");
    assert.isFalse(el.classList.contains("validation-error"));
    assert.equal(0, document.querySelectorAll(".validation-message").length);

    el.value = "invalid-mapping-statement";
    await optionsPage.saveOptions();
    assert.isTrue(el.classList.contains("validation-error"));

    const messageEls = document.querySelectorAll(".validation-message");
    assert.equal(1, messageEls.length);
    assert.isTrue(messageEls[0].innerHTML.includes(el.value));
  });

  should("show exclusion rule editor for exclusion rules", async () => {
    const rule = {
      passKeys: "",
      pattern: "example.com",
    };
    await Settings.set("exclusionRules", [rule]);
    await optionsPage.init();
    const el = document.querySelector("#exclusion-rules input[name=pattern]");
    assert.equal("example.com", el.value);
  });

  context("backup", () => {
    should("exclude settings which are default values", () => {
      const settings = JSON.parse(optionsPage.prepareBackupSettings());
      // This should exclude all values which are defaults.
      assert.equal(["settingsVersion"], Object.keys(settings));
    });

    should("include settings which have changed from the default", () => {
      optionsPage.getOptionEl("keyMappings").value = "map a scrollUp";
      const settings = JSON.parse(optionsPage.prepareBackupSettings());
      assert.equal(["keyMappings", "settingsVersion"], Object.keys(settings));
      assert.equal("map a scrollUp", settings.keyMappings);
    });

    should("export settings with sorted keys", () => {
      optionsPage.getOptionEl("linkHintCharacters").value = "abcd";
      optionsPage.getOptionEl("keyMappings").value = "map a scrollUp";
      const settings = JSON.parse(optionsPage.prepareBackupSettings());
      assert.equal(["keyMappings", "linkHintCharacters", "settingsVersion"], Object.keys(settings));
    });

    should("include exclusion rules", async () => {
      const rule = {
        passKeys: "",
        pattern: "example.com",
      };
      await Settings.set("exclusionRules", [rule]);
      await optionsPage.init();
      const settings = JSON.parse(optionsPage.prepareBackupSettings());
      assert.equal([rule], settings["exclusionRules"]);
    });

    should("include non-default Vomnibar theme, effects, and border motion", async () => {
      optionsPage.getOptionEl("vomnibarTheme").value = "Omarchy";
      optionsPage.getOptionEl("vomnibarEffects").value = "Quick";
      optionsPage.getOptionEl("vomnibarBorderSpeed").value = "Fast";
      optionsPage.getOptionEl("vomnibarBorderAngle").value = "90";
      const settings = JSON.parse(optionsPage.prepareBackupSettings());
      assert.equal("Omarchy", settings.vomnibarTheme);
      assert.equal("Quick", settings.vomnibarEffects);
      assert.equal({ speed: "Fast", angle: 90 }, settings.vomnibarBorderMotion);
      await optionsPage.saveOptions();
      assert.equal("Omarchy", Settings.get("vomnibarTheme"));
      assert.equal("Quick", Settings.get("vomnibarEffects"));
      assert.equal({ speed: "Fast", angle: 90 }, Settings.get("vomnibarBorderMotion"));
    });
  });

  should("show learned shortcut count and clear it on click", async () => {
    let count = 3;
    let cleared = false;
    stub(chrome.runtime, "sendMessage", (msg) => {
      if (msg.handler === "getLearnedChoicesCount") return Promise.resolve(count);
      if (msg.handler === "clearLearnedChoices") {
        cleared = true;
        count = 0;
        return Promise.resolve();
      }
    });
    await optionsPage.init();
    assert.equal(
      "3 learned shortcuts saved.",
      document.querySelector("#learned-choices-count").textContent,
    );
    const btn = document.querySelector("#clear-learned-choices");
    assert.isFalse(btn.disabled);
    btn.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.isTrue(cleared);
    assert.equal(
      "No shortcuts learned yet.",
      document.querySelector("#learned-choices-count").textContent,
    );
    assert.isTrue(btn.disabled);
  });

  should("apply and live-preview the active Vomnibar theme on the options page", () => {
    assert.equal("Default", document.documentElement.getAttribute("data-vomnibar-theme"));
    assert.equal("dark", document.documentElement.getAttribute("data-vomnibar-scheme"));
    const select = optionsPage.getOptionEl("vomnibarTheme");
    select.value = "Paper Light";
    select.dispatchEvent(new document.defaultView.Event("change", { bubbles: true }));
    assert.equal("Paper Light", document.documentElement.getAttribute("data-vomnibar-theme"));
    assert.equal("light", document.documentElement.getAttribute("data-vomnibar-scheme"));
  });
});
