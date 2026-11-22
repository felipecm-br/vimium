//
// This wraps the vomnibar iframe, which we inject into the page to provide the vomnibar.
//
const Vomnibar = {
  vomnibarUI: null,

  // sourceFrameId here (and below) is the ID of the frame from which this request originates, which
  // may be different from the current frame.

  activate(sourceFrameId, registryEntry) {
    const options = Object.assign({}, registryEntry.options, { completer: "omni" });
    this.open(sourceFrameId, options);
  },

  activateInNewTab(sourceFrameId, registryEntry) {
    const options = Object.assign({}, registryEntry.options, { completer: "omni", newTab: true });
    this.open(sourceFrameId, options);
  },

  activateTabSelection(sourceFrameId) {
    this.open(sourceFrameId, {
      completer: "tabs",
      selectFirst: true,
    });
  },

  activateBookmarks(sourceFrameId, registryEntry) {
    const options = Object.assign({}, registryEntry.options, {
      completer: "bookmarks",
      selectFirst: true,
    });
    this.open(sourceFrameId, options);
  },

  activateCommandSelection(sourceFrameId, registryEntry) {
    const options = Object.assign({}, registryEntry.options, {
      completer: "commands",
      selectFirst: true,
    });
    this.open(sourceFrameId, options);
  },

  activateBookmarksInNewTab(sourceFrameId, registryEntry) {
    const options = Object.assign({}, registryEntry.options, {
      completer: "bookmarks",
      selectFirst: true,
      newTab: true,
    });
    this.open(sourceFrameId, options);
  },

  activateEditUrl(sourceFrameId) {
    this.open(sourceFrameId, {
      completer: "omni",
      selectFirst: false,
      query: globalThis.location.href,
    });
  },

  activateEditUrlInNewTab(sourceFrameId) {
    this.open(sourceFrameId, {
      completer: "omni",
      selectFirst: false,
      query: globalThis.location.href,
      newTab: true,
    });
  },

  activateOmniSearch(sourceFrameId, registryEntry) {
    const options = Object.assign({}, registryEntry.options, {
      completer: "omniSearch",
      selectFirst: true,
    });
    this.open(sourceFrameId, options);
  },

  activateOmniSearchInNewTab(sourceFrameId, registryEntry) {
    const options = Object.assign({}, registryEntry.options, {
      completer: "omniSearch",
      selectFirst: true,
      newTab: true,
    });
    this.open(sourceFrameId, options);
  },

  init() {
    if (!this.vomnibarUI) {
      this.vomnibarUI = new UIComponent();
      this.vomnibarUI.load("pages/vomnibar_page.html", "vomnibar-frame");
    }
  },

  // Loads the Vomnibar's frame before its first use, so the first open on a page takes as long as
  // the next ones: about 20ms instead of 100ms, most of which went to loading the frame. Only in the
  // top frame (where the Vomnibar shows) of a page Vimium is enabled on, once the page has loaded,
  // is being looked at, and the browser is idle. A loaded frame takes about half a megabyte.
  prewarm() {
    if (!DomUtils.isTopFrame() || globalThis.vimiumDomTestsAreRunning) return;
    const load = () => {
      if (this.vomnibarUI) return;
      if (document.visibilityState !== "visible") {
        document.addEventListener("visibilitychange", load, { once: true });
        return;
      }
      const whenIdle = globalThis.requestIdleCallback ?? ((callback) => setTimeout(callback, 500));
      whenIdle(() => {
        if (!isEnabledForUrl) return;
        if (document.visibilityState === "visible") this.init();
        else load();
      }, { timeout: 3000 });
    };
    DomUtils.documentComplete().then(load);
  },

  // Opens the vomnibar.
  // - vomnibarShowOptions:
  //     completer: The name of the completer to fetch results from.
  //     query: Optional. Text to prefill the Vomnibar with.
  //     selectFirst: Optional. Whether to select the first entry.
  //     newTab: Optional. Whether to open the result in a new tab.
  //     keyword: A keyword which will scope the search to a UserSearchEngine.
  open(sourceFrameId, vomnibarShowOptions) {
    this.init();
    // The Vomnibar cannot coexist with the help dialog (it causes focus issues).
    HelpDialog.abort();
    Utils.assertType(VomnibarShowOptions, vomnibarShowOptions);
    this.vomnibarUI.show(
      Object.assign(vomnibarShowOptions, { name: "activate" }),
      { sourceFrameId, focus: true },
    );
  },
};

Object.assign(globalThis, { Vomnibar });
