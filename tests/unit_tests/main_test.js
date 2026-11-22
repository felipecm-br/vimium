import "./test_helper.js";
import { withPromise } from "./test_helper.js";
import "../../lib/settings.js";
import "../../background_scripts/main.js";
import { RegistryEntry } from "../../background_scripts/commands.js";

context("HintCoordinator", () => {
  should("prepareToActivateLinkHintsMode", async () => {
    let receivedMessages = [];
    const frameIdToHintDescriptors = {
      "0": { frameId: 0, localIndex: 123, linkText: null },
      "1": { frameId: 1, localIndex: 456, linkText: null },
    };

    stub(chrome.webNavigation, "getAllFrames", () => [{ frameId: 0 }, { frameId: 1 }]);

    stub(
      chrome.tabs,
      "sendMessage",
      withPromise((_tabId, message, options) => {
        if (message.messageType == "getHintDescriptors") {
          return frameIdToHintDescriptors[options.frameId];
        } else if (message.messageType == "activateMode") {
          receivedMessages.push(message);
        }
      }),
    );

    await HintCoordinator.prepareToActivateLinkHintsMode(0, 0, {
      modeIndex: 0,
      requestedByHelpDialog: false,
    });

    receivedMessages = receivedMessages.map(
      (m) => Utils.pick(m, ["frameId", "frameIdToHintDescriptors"]),
    );

    // Each frame should receive only the hint descriptors from the other frames.
    assert.equal([
      { frameId: 0, frameIdToHintDescriptors: { "1": frameIdToHintDescriptors[1] } },
      { frameId: 1, frameIdToHintDescriptors: { "0": frameIdToHintDescriptors[0] } },
    ], receivedMessages);
  });
});

context("createTab command", () => {
  let tabCreated;
  let requestStub;

  setup(async () => {
    stub(chrome.tabs, "create", (args) => {
      tabCreated = args;
    });
    requestStub = {
      registryEntry: new RegistryEntry({ options: {} }),
      tab: {},
      count: 1,
    };
    await Settings.load();
  });

  should("open the provided URL", async () => {
    requestStub.url = "https://example.com";
    await BackgroundCommands.createTab(requestStub);
    assert.equal("https://example.com", tabCreated.url);
  });

  should("open the vimium new tab page", async () => {
    await Settings.set("newTabDestination", Settings.newTabDestinations.vimiumNewTabPage);
    await BackgroundCommands.createTab(requestStub);
    assert.equal(Settings.vimiumNewTabPageUrl, tabCreated.url);
  });

  should("open the browser's new tab page", async () => {
    await Settings.set("newTabDestination", Settings.newTabDestinations.browserNewTabPage);
    await BackgroundCommands.createTab(requestStub);
    // The URL argument to chrome.tabs.create is omitted when we want to use the browser's NTP.
    assert.isTrue(tabCreated != null);
    assert.equal(undefined, tabCreated.url);
  });

  should("open custom URL", async () => {
    await Settings.set("newTabDestination", Settings.newTabDestinations.customUrl);
    await BackgroundCommands.createTab(requestStub);
    // If a specific custom URL isn't provided, the browser's new tab page will be used.
    // The URL argument to chrome.tabs.create is omitted when we want to use the browser's NTP.
    assert.isTrue(tabCreated != null);
    assert.equal(undefined, tabCreated.url);

    await Settings.set("newTabCustomUrl", "http://example.com");
    await BackgroundCommands.createTab(requestStub);
    assert.equal("http://example.com", tabCreated.url);
  });

  teardown(() => {
    tabCreated = null;
    Settings.clear();
  });
});

context("goToTab command", () => {
  let updatedTabId, updateArgs;
  const mockTabs = [
    { id: 100, active: true },
    { id: 101, active: false },
    { id: 102, active: false },
  ];

  setup(() => {
    updatedTabId = null;
    updateArgs = null;
    stub(chrome.tabs, "query", (_args, callback) => {
      callback(mockTabs.map((t) => Object.assign({}, t)));
    });
    stub(chrome.tabs, "update", (tabId, args) => {
      updatedTabId = tabId;
      updateArgs = args;
    });
  });

  should("switch to tab by index option", () => {
    const request = {
      registryEntry: new RegistryEntry({ options: { index: "1" } }),
      tab: mockTabs[0],
      count: 1,
    };
    BackgroundCommands.goToTab(request);
    assert.equal(101, updatedTabId);
    assert.equal(true, updateArgs.active);
  });

  should("not switch if tab is already active", () => {
    const request = {
      registryEntry: new RegistryEntry({ options: { index: "0" } }),
      tab: mockTabs[0],
      count: 1,
    };
    BackgroundCommands.goToTab(request);
    assert.equal(null, updatedTabId);
  });

  should("not switch if index is out of bounds", () => {
    const request = {
      registryEntry: new RegistryEntry({ options: { index: "5" } }),
      tab: mockTabs[0],
      count: 1,
    };
    BackgroundCommands.goToTab(request);
    assert.equal(null, updatedTabId);
  });
});

context("Next zoom level", () => {
  // All these tests use the Chrome zoom levels, which are the default.
  should("Zoom in 0 times", async () => {
    const zoom = await nextZoomLevel(1.00, 0);
    assert.equal(1.00, zoom);
  });

  should("Zoom in 1", async () => {
    const zoom = await nextZoomLevel(1.00, 1);
    assert.equal(1.10, zoom);
  });

  should("Zoom out 1", async () => {
    const zoom = await nextZoomLevel(1.00, -1);
    assert.equal(0.90, zoom);
  });

  should("Zoom in 2", async () => {
    const zoom = await nextZoomLevel(1.00, 2);
    assert.equal(1.25, zoom);
  });

  should("Zoom out 2", async () => {
    const zoom = await nextZoomLevel(1.00, -2);
    assert.equal(0.80, zoom);
  });

  should("Zoom in from between values", async () => {
    const zoom = await nextZoomLevel(1.05, 1);
    assert.equal(1.10, zoom);
  });

  should("Zoom out from between values", async () => {
    const zoom = await nextZoomLevel(1.05, -1);
    assert.equal(1.00, zoom);
  });

  should("Zoom in past the maximum", async () => {
    const zoom = await nextZoomLevel(1.00, 15);
    assert.equal(5.00, zoom);
  });

  should("Zoom out past the minimum", async () => {
    const zoom = await nextZoomLevel(1.00, -15);
    assert.equal(0.25, zoom);
  });

  should("Zoom in from below the minimum", async () => {
    const lowZoom = 0.01; // Lowest non-broken Chrome zoom level
    const zoom = await nextZoomLevel(lowZoom, 1);
    assert.equal(0.25, zoom);
  });

  should("Zoom out from above the maximum", async () => {
    const highZoom = 9.99; // highest non-broken Chrome zoom level
    const zoom = await nextZoomLevel(highZoom, -1);
    assert.equal(5.00, zoom);
  });

  should("Zoom in from above the maximum", async () => {
    const highZoom = 9.99; // highest non-broken Chrome zoom level
    const zoom = await nextZoomLevel(highZoom, 1);
    assert.equal(5.00, zoom);
  });

  should("Zoom out from below the minimum", async () => {
    const lowZoom = 0.01; // lowest non-broken Chrome zoom level
    const zoom = await nextZoomLevel(lowZoom, -1);
    assert.equal(0.25, zoom);
  });

  should("Test Chrome 33% zoom in with float error", async () => {
    const floatZoom = 0.32999999999999996; // The value chrome actually gives for 33%.
    const zoom = await nextZoomLevel(floatZoom, 1);
    assert.equal(0.50, zoom);
  });

  should("Test Chrome 175% zoom in with float error", async () => {
    const floatZoom = 1.7499999999999998; // The value chrome actually gives for 175%.
    const zoom = await nextZoomLevel(floatZoom, 1);
    assert.equal(2.00, zoom);
  });
});

context("Selecting frames", () => {
  should("nextFrame", async () => {
    const focusedFrames = [];
    stub(chrome.webNavigation, "getAllFrames", () => [{ frameId: 1 }, { frameId: 2 }]);
    stub(
      chrome.tabs,
      "sendMessage",
      withPromise((_tabId, message, options) => {
        if (message.handler == "getFocusStatus") {
          return { focused: options.frameId == 2, focusable: true };
        } else if (message.handler == "focusFrame") {
          focusedFrames.push(options.frameId);
        }
      }),
    );

    await BackgroundCommands.nextFrame(1, 0);
    assert.equal([1], focusedFrames);
  });
});

context("majorVersionHasIncreased", () => {
  should("return whether the major version has changed", () => {
    assert.equal(false, majorVersionHasIncreased(null));
    shoulda.stub(Utils, "getCurrentVersion", () => "2.0.1");
    assert.equal(false, majorVersionHasIncreased("2.0.0"));
    shoulda.stub(Utils, "getCurrentVersion", () => "2.1.0");
    assert.equal(true, majorVersionHasIncreased("2.0.0"));
  });
});

context("Modern tab management commands", () => {
  should("jumpToAudibleTab cycles across audible tabs and focuses the target window", async () => {
    const audibleTabs = [
      { id: 10, windowId: 1, index: 0, audible: true },
      { id: 20, windowId: 2, index: 1, audible: true },
    ];
    let activated = null;
    let focusedWindow = null;
    stub(chrome.tabs, "query", withPromise(() => audibleTabs));
    stub(chrome.tabs, "get", withPromise((id) => audibleTabs.find((t) => t.id === id)));
    stub(
      chrome.tabs,
      "update",
      withPromise((id, props) => {
        activated = { id, props };
        return audibleTabs.find((t) => t.id === id);
      }),
    );
    stub(
      chrome.windows,
      "update",
      withPromise((id, props) => {
        focusedWindow = { id, props };
      }),
    );

    await BackgroundCommands.jumpToAudibleTab({ tab: audibleTabs[0] });
    assert.equal({ id: 20, props: { active: true } }, activated);
    assert.equal({ id: 2, props: { focused: true } }, focusedWindow);
  });

  should("discardTabs hibernates only inactive unpinned non-audible tabs", async () => {
    const tabs = [
      { id: 1, active: true, pinned: false, audible: false, discarded: false },
      { id: 2, active: false, pinned: true, audible: false, discarded: false },
      { id: 3, active: false, pinned: false, audible: true, discarded: false },
      { id: 4, active: false, pinned: false, audible: false, discarded: true },
      { id: 5, active: false, pinned: false, audible: false, discarded: false },
      { id: 6, active: false, pinned: false, audible: false, discarded: false },
    ];
    const discarded = [];
    const hudMessages = [];
    stub(chrome.tabs, "query", withPromise(() => tabs));
    stub(chrome.tabs, "discard", withPromise((id) => discarded.push(id)));
    stub(chrome.tabs, "sendMessage", withPromise((_id, msg) => hudMessages.push(msg.message)));

    await BackgroundCommands.discardTabs({
      tab: tabs[0],
      registryEntry: new RegistryEntry({ options: {} }),
    });
    assert.equal([5, 6], discarded);
    assert.equal(["Hibernated 2 tabs."], hudMessages);
  });

  should("deduplicateTabs keeps active/pinned tabs and closes duplicates", async () => {
    const tabs = [
      { id: 1, url: "https://a.com", active: false, pinned: false },
      { id: 2, url: "https://a.com", active: true, pinned: false },
      { id: 3, url: "https://b.com", active: false, pinned: false },
      { id: 4, url: "https://b.com", active: false, pinned: true },
      { id: 5, url: "https://c.com", active: false, pinned: false },
    ];
    let removed = [];
    stub(chrome.tabs, "query", withPromise(() => tabs));
    stub(
      chrome.tabs,
      "remove",
      withPromise((ids) => {
        removed = ids;
      }),
    );
    stub(chrome.tabs, "sendMessage", withPromise(() => {}));

    await BackgroundCommands.deduplicateTabs({
      tab: tabs[1],
      registryEntry: new RegistryEntry({ options: {} }),
    });
    assert.equal([1, 3], removed);
  });

  should("moveTabToNextWindow moves tab to the next matching window", async () => {
    const windows = [
      { id: 100, incognito: false },
      { id: 200, incognito: false },
      { id: 300, incognito: true },
    ];
    let moved = null;
    let focused = null;
    stub(chrome.windows, "getAll", withPromise(() => windows));
    stub(
      chrome.tabs,
      "move",
      withPromise((id, opts) => {
        moved = { id, opts };
      }),
    );
    stub(chrome.tabs, "update", withPromise(() => {}));
    stub(
      chrome.windows,
      "update",
      withPromise((id, opts) => {
        focused = { id, opts };
      }),
    );

    await BackgroundCommands.moveTabToNextWindow({
      tab: { id: 7, windowId: 100, incognito: false },
    });
    assert.equal({ id: 7, opts: { windowId: 200, index: -1 } }, moved);
    assert.equal({ id: 200, opts: { focused: true } }, focused);
  });

  should("toggleTabGroup creates, names, collapses, and ungroups tabs", async () => {
    let grouped = null;
    let groupUpdate = null;
    let ungrouped = null;
    stub(chrome.tabGroups, "query", withPromise(() => []));
    stub(
      chrome.tabs,
      "group",
      withPromise((opts) => {
        grouped = opts;
        return 42;
      }),
    );
    stub(
      chrome.tabGroups,
      "update",
      withPromise((id, props) => {
        groupUpdate = { id, props };
      }),
    );
    stub(chrome.tabGroups, "get", withPromise(() => ({ id: 42, collapsed: false })));
    stub(
      chrome.tabs,
      "ungroup",
      withPromise((id) => {
        ungrouped = id;
      }),
    );

    await BackgroundCommands.toggleTabGroup({
      tab: { id: 9, windowId: 1, groupId: -1 },
      registryEntry: new RegistryEntry({ options: { title: "Work", color: "blue" } }),
    });
    assert.equal({ tabIds: 9 }, grouped);
    assert.equal({ id: 42, props: { title: "Work", color: "blue" } }, groupUpdate);

    await BackgroundCommands.toggleTabGroup({
      tab: { id: 9, windowId: 1, groupId: 42 },
      registryEntry: new RegistryEntry({ options: { collapse: true } }),
    });
    assert.equal({ id: 42, props: { collapsed: true } }, groupUpdate);

    await BackgroundCommands.toggleTabGroup({
      tab: { id: 9, windowId: 1, groupId: 42 },
      registryEntry: new RegistryEntry({ options: {} }),
    });
    assert.equal(9, ungrouped);
  });
});

context("handleBrowserCommand (chrome.commands)", () => {
  should(
    "opens OmniSearch via content script, falling back to createTab on restricted pages",
    async () => {
      await Settings.load();
      const activeTab = { id: 5, windowId: 1, index: 0, url: "chrome://settings" };
      stub(chrome.tabs, "query", withPromise(() => [activeTab]));
      stub(
        chrome.tabs,
        "sendMessage",
        () => Promise.reject(new Error("Receiving end does not exist")),
      );
      let created = null;
      stub(
        chrome.tabs,
        "create",
        withPromise((opts) => {
          created = opts;
          return { id: 6 };
        }),
      );

      await handleBrowserCommand("open-vomnibar-omnisearch");
      assert.isTrue(created != null);
      Settings.clear();
    },
  );

  should("dispatches background tab commands directly", async () => {
    await Settings.load();
    const activeTab = { id: 5, windowId: 1, index: 0, url: "chrome://extensions" };
    let called = false;
    stub(chrome.tabs, "query", withPromise(() => [activeTab]));
    stub(BackgroundCommands, "jumpToAudibleTab", () => {
      called = true;
    });

    await handleBrowserCommand("jump-to-audible-tab");
    assert.isTrue(called);
    Settings.clear();
  });
});
