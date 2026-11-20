// A UIComponent is an iframe containing a Vimium extension page, like the Vomnibar. This class
// provides methods that content scripts can use to interact with that page:
// - show
// - hide
// - postMessage
//
// When the iframe has not yet been loaded, all messages will be queued until it's done loading. The
// page in the iframe uses the module ui_component_messenger.js to manage message passing back to
// this class. Since the iframe's page can receive messages from untrusted javascript, secure
// message passing is achieved using ports from MessageChannel() and a vimiumSecret handshake.

// DarkReader, the most popular dark mode extension, can invert the whole page with a CSS filter (its
// Filter and Filter+ modes), which would invert Vimium's UI too. While it does, Vimium's iframes get
// a class that inverts them back (see vimium.css), so they keep honoring the browser's light/dark
// preference.
//
// DarkReader appends a <style id="dark-reader-style"> to <head>, rewrites its text when its
// settings change, and removes it when turned off. One observer, shared by every UI component in
// the document, watches just that: <head>'s children and that element's text. It used to watch all
// of <head>'s subtree, once per component, which woke it for every text change of every <style> and
// <title>, as pages using CSS-in-JS make all the time.
const darkReaderFilter = {
  reverseClass: "vimium-reverse-dark-reader-filter",
  iframes: new Set(),
  observer: null,
  // What the observer watches: the parent DarkReader's style goes in, and that style, if any.
  parent: null,
  style: null,
  inverted: false,

  // Keeps `iframe` inverted back for as long as DarkReader inverts the page.
  watch(iframe) {
    this.iframes.add(iframe);
    this.update();
    iframe.classList.toggle(this.reverseClass, this.inverted);
  },

  update() {
    const style = document.getElementById("dark-reader-style");
    // A document can lack a <head>, like an SVG one, and observing null would throw.
    const parent = document.head ?? document.documentElement;
    if (this.observer == null || style !== this.style || parent !== this.parent) {
      this.style = style;
      this.parent = parent;
      this.observer?.disconnect();
      this.observer = new MutationObserver(() => this.update());
      this.observer.observe(parent, { childList: true });
      if (style) {
        this.observer.observe(style, { childList: true, characterData: true, subtree: true });
      }
    }
    const inverted = style?.textContent.includes("filter") ?? false;
    if (inverted === this.inverted) return;
    this.inverted = inverted;
    for (const iframe of this.iframes) iframe.classList.toggle(this.reverseClass, inverted);
  },
};

class UIComponent {
  iframeElement;
  iframePort;
  showing = false;
  // An optional message handler for handling messages from the iFrame.
  messageHandler;
  iframeFrameId;
  // These are the focus options set when show() is invoked. We store them while the UIComponent
  // is visible so we know how to revert focus once it's dismissed.
  focusOptions = {};
  shadowDOM;
  // When we open ports to the iframe using MessageChannel, we save them so that our unit tests can
  // close the ports. See ui_component_test.js for details.
  messageChannelPorts;

  // - iframeUrl:
  // - className: the CSS class to add to the iframe.
  // - messageHandler: optional; a function to handle messages from the iframe's page.
  async load(iframeUrl, className, messageHandler) {
    if (this.iframeFrameElement) throw new Error("init should only be called once.");
    this.messageHandler = messageHandler;
    const isDomTests = iframeUrl.includes("?dom_tests=true");
    this.iframeElement = DomUtils.createElement("iframe");

    // Allow Vimium's iframes to have clipboard access in Chrome. This is needed when triggering
    // some commands, like link hints or copyCurrentUrl, from within the help dialog. Firefox does
    // not support clipboard-read and clipboard-write in the allow attribute. NOTE(philc): this
    // permission has to be set before we append the iframe to the DOM, or Chrome will log the
    // console error "Potential permissions policy violation: clipboard-read is not allowed in this
    // document."
    if (!Utils.isFirefox()) {
      this.iframeElement.allow = "clipboard-read; clipboard-write";
    }

    const styleSheet = DomUtils.createElement("style");
    styleSheet.type = "text/css";
    // Default to everything hidden while the stylesheet loads.
    styleSheet.innerHTML = "iframe {display: none;}";

    // Fetch "content_scripts/vimium.css" from chrome.storage.session; the background page caches
    // it there.
    this.stylesheetLoaded = chrome.storage.session.get("vimiumCSSInChromeStorage")
      .then((items) => styleSheet.innerHTML = items.vimiumCSSInChromeStorage);

    this.iframeElement.className = className;

    const shadowWrapper = DomUtils.createElement("div");
    // Prevent the page's CSS from interfering with this container div.
    shadowWrapper.className = "vimium-reset";
    this.shadowDOM = shadowWrapper.attachShadow({ mode: "open" });
    this.shadowDOM.appendChild(styleSheet);
    // Allow a user's custom CSS to style iframe element inside this shadow DOM.
    DomUtils.injectUserCss(this.shadowDOM);

    // Create glass background overlay for vomnibar
    if (className === "vomnibar-frame") {
      this.glassBackground = DomUtils.createElement("div");
      this.glassBackground.className = "vomnibar-glass-bg";
      this.shadowDOM.appendChild(this.glassBackground);
    }

    this.shadowDOM.appendChild(this.iframeElement);

    // Load the iframe and pass it a port via window.postMessage so we can communicate privately
    // with the iframe. Use a promise here so that requests to message this iframe's port will
    // block until it's ready. See #1679.
    let resolveFn;
    this.iframePort = new Promise((resolve, _reject) => {
      resolveFn = resolve;
    });

    this.setIframeVisible(false);
    this.iframeElement.src = chrome.runtime.getURL(iframeUrl);
    await DomUtils.documentReady();
    darkReaderFilter.watch(this.iframeElement);
    document.documentElement.appendChild(shadowWrapper);

    const secret = (await chrome.storage.session.get("vimiumSecret")).vimiumSecret;
    const { port1, port2 } = new MessageChannel();
    this.messageChannelPorts = [port1, port2];
    this.iframeElement.addEventListener("load", () => {
      // Get vimiumSecret so the iframe can determine that our message isn't the page
      // impersonating us.
      // Outside of tests, target origin starts with chrome-extension://{vimium's-id}
      const targetOrigin = isDomTests ? "*" : chrome.runtime.getURL("");
      this.iframeElement.contentWindow.postMessage(secret, targetOrigin, [port2]);
      port1.onmessage = (event) => {
        let eventName = null;
        // TODO(philc): Why are we using both data and data.name as the name? Pick one.
        if (event) {
          eventName = (event.data ? event.data.name : undefined) || event.data;
        }

        switch (eventName) {
          case "uiComponentIsReady":
            // If this frame receives the focus, then hide the UI component.
            globalThis.addEventListener(
              "focus",
              forTrusted((event) => {
                if ((event.target === window) && this.focusOptions.focus) {
                  this.hide(false);
                }
                // Continue propagating the event.
                return true;
              }),
              true,
            );
            // Set the iframe's port, thereby rendering the UI component ready.
            resolveFn(port1);
            break;
          case "setIframeFrameId":
            this.iframeFrameId = event.data.iframeFrameId;
            break;
          case "hide":
            return this.hide();
          default:
            this.messageHandler?.(event);
        }
      };
    });
  }

  setIframeVisible(visible) {
    const classes = this.iframeElement.classList;
    if (visible) {
      classes.remove("vimium-ui-component-hidden");
      classes.add("vimium-ui-component-visible");
      // Fade the glass background in once the stylesheet that styles it has loaded. The fade is a
      // CSS transition, so no forced reflow is needed to restart it.
      // Effects "Fast" skips it: a full-page backdrop-filter is the costliest thing Vimium paints.
      // "Quick" keeps it, without the fade.
      const level = globalThis.Settings?.isLoaded?.() ? Settings.get("vomnibarEffects") : null;
      this.glassBackground?.classList.toggle("vomnibar-glass-bg-instant", level === "Quick");
      if (this.glassBackground && level !== "Fast") {
        this.stylesheetLoaded.then(() => {
          if (classes.contains("vimium-ui-component-visible")) {
            this.glassBackground.classList.add("vomnibar-glass-bg-visible");
          }
        });
      }
    } else {
      classes.add("vimium-ui-component-hidden");
      classes.remove("vimium-ui-component-visible");
      // Hide glass background: remove immediately to avoid expensive backdrop-filter
      // lingering during or after the vomnibar slide-out animation.
      if (this.glassBackground) {
        this.glassBackground.classList.remove("vomnibar-glass-bg-visible");
      }
    }
  }

  // Send a message to this UIComponent's iframe's page.
  // - data: an object with at least a `name` field.
  async postMessage(data) {
    (await this.iframePort).postMessage(data);
  }

  // Show the UIComponent.
  // - messageData: a message to send to the underlying iframe via `postMessage`.
  // - focusOptions: optional. {
  //     focus: whether the UIComponent should be focused once it's ready.
  //     sourceFrameId: which frame should the focus when this component is dismissed.
  //   }
  async show(messageData = {}, focusOptions = {}) {
    if (focusOptions) {
      Utils.assertType({ focus: "boolean", sourceFrameId: "number" }, focusOptions);
    }
    this.focusOptions = focusOptions;
    await this.postMessage(messageData);
    this.setIframeVisible(true);
    if (this.focusOptions.focus) {
      this.iframeElement.focus();
    }
    this.showing = true;
  }

  async hide(shouldRefocusOriginalFrame) {
    if (shouldRefocusOriginalFrame == null) shouldRefocusOriginalFrame = true;

    await this.iframePort;
    if (!this.showing) return;
    this.showing = false;
    this.setIframeVisible(false);
    if (this.focusOptions.focus) {
      this.iframeElement.blur();
      if (shouldRefocusOriginalFrame) {
        if (this.focusOptions.sourceFrameId != null) {
          chrome.runtime.sendMessage({
            handler: "sendMessageToFrames",
            frameId: this.focusOptions.sourceFrameId,
            message: {
              handler: "focusFrame",
              forceFocusThisFrame: true,
            },
          });
        } else {
          Utils.nextTick(() => globalThis.focus());
        }
      }
    }
    this.focusOptions = {};
    this.postMessage({ name: "hidden" }); // Inform the UI component that it is hidden.
  }
}

globalThis.UIComponent = UIComponent;
