import * as testHelper from "./test_helper.js";
import "../../lib/keyboard_utils.js";
import "../../content_scripts/mode.js";
import "../../content_scripts/mode_key_handler.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

context("keystroke popup", () => {
  setup(async () => {
    await testHelper.jsdomStub("pages/vomnibar_page.html");
  });

  teardown(() => {
    KeystrokePopup.hide(true);
  });

  should("keep a popup shown while the previous one is fading out", async () => {
    KeystrokePopup.show("g", { g: "Scroll to top" });
    KeystrokePopup.hide();
    KeystrokePopup.show("y", { y: "Copy page URL" });
    const popup = KeystrokePopup.element;
    // Let the previous popup's 100ms fade-out timer fire.
    await sleep(150);
    assert.isTrue(document.body.contains(popup));
    assert.equal(popup, KeystrokePopup.element);
  });

  should("remove the popup after the fade-out", async () => {
    KeystrokePopup.show("g", { g: "Scroll to top" });
    const popup = KeystrokePopup.element;
    KeystrokePopup.hide();
    await sleep(150);
    assert.isFalse(document.body.contains(popup));
    assert.equal(null, KeystrokePopup.element);
  });
});
