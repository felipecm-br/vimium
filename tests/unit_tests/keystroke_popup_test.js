import * as testHelper from "./test_helper.js";
import "../../lib/keyboard_utils.js";
import "../../lib/dom_utils.js";
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
    assert.isTrue(document.documentElement.contains(popup));
    assert.equal(popup, KeystrokePopup.element);
  });

  should("remove the popup after the fade-out", async () => {
    KeystrokePopup.show("g", { g: "Scroll to top" });
    const popup = KeystrokePopup.element;
    KeystrokePopup.hide();
    await sleep(150);
    assert.isFalse(document.documentElement.contains(popup));
    assert.equal(null, KeystrokePopup.element);
  });

  should("render inside a shadow root, out of the page's reach", () => {
    KeystrokePopup.show("g", { g: "Scroll to top" });
    const host = KeystrokePopup.element;
    assert.equal(null, document.getElementById("vimium-keystroke-popup"));
    const popup = host.shadowRoot.getElementById("vimium-keystroke-popup");
    assert.isTrue(popup.textContent.includes("Scroll to top"));
  });

  should("list the commands that follow a prefix from the key mapping, skipping nested prefixes", () => {
    const mapping = {
      g: { command: "scrollToTop", desc: "Scroll to the top of the page" },
      x: { command: "myCommandWithoutDesc" },
      s: { t: { command: "nested" } },
    };
    assert.equal(
      { g: "Scroll to the top of the page", x: "myCommandWithoutDesc" },
      KeystrokePopup.optionsFor(mapping),
    );
  });

  should("show nothing when no command follows the prefix", () => {
    KeystrokePopup.show("s", {});
    assert.equal(null, KeystrokePopup.element);
  });
});
