//
// This controls the contents of the Vomnibar iframe. We use an iframe to avoid changing the
// selection on the page (useful for bookmarklets), ensure that the Vomnibar style is unaffected by
// the page, and simplify key handling in vimium_frontend.js
//

import "../lib/types.js";
import "../lib/utils.js";
import "../lib/url_utils.js";
import "../lib/settings.js";
import "../lib/keyboard_utils.js";
import "../lib/dom_utils.js";
import "../lib/handler_stack.js";
import * as UIComponentMessenger from "./ui_component_messenger.js";
import * as userSearchEngines from "../background_scripts/user_search_engines.js";
import { themeManager, themeDefinitions } from "./vomnibar_themes.js";

export let ui; // An instance of VomnibarUI.

// Used for tests.
export function reset() {
  ui = null;
}

export async function activate(options) {
  Utils.assertType(VomnibarShowOptions, options || {});
  await Settings.onLoaded();
  userSearchEngines.set(Settings.get("searchEngines"));

  const defaults = {
    completer: "omni",
    query: "",
    newTab: false,
    selectFirst: false,
    keyword: null,
  };

  options = Object.assign(defaults, options);

  if (ui == null) {
    ui = new VomnibarUI();
  }
  ui.setCompleterName(options.completer);
  ui.refreshCompletions();
  ui.setInitialSelectionValue(options.selectFirst ? 0 : -1);
  ui.setForceNewTab(options.newTab);
  ui.setQuery(options.query);
  ui.setActiveUserSearchEngine(userSearchEngines.keywordToEngine[options.keyword]);
  // Trigger slide-in animation on each activation
  ui.showAnimations();
  // Use await here for vomnibar_test.js, so that this page doesn't get unloaded while a test is
  // running.
  await ui.update();
}

// Theme command prefix for triggering theme selection in OmniSearch
const THEME_COMMAND_PREFIX = "theme";

// Pagination settings
const DEFAULT_ITEMS_PER_PAGE = 7;

class VomnibarUI {
  constructor() {
    this.onKeyEvent = this.onKeyEvent.bind(this);
    this.onInput = this.onInput.bind(this);
    this.update = this.update.bind(this);
    this.onHiddenCallback = null;
    this.initDom();
    // The user's custom search engine, if they have prefixed their query with the keyword for one
    // of their search engines.
    this.activeUserSearchEngine = null;
    // Used for synchronizing requests and responses to the background page.
    this.lastRequestId = null;
    // Theme selection mode state
    this.isThemeMode = false;
    this.themeCompletions = [];
    // Initialize theme manager
    themeManager.init();
    
    // Pagination state
    this.allCompletions = []; // All completions from backend
    this.currentPage = 0;
    this.itemsPerPage = DEFAULT_ITEMS_PER_PAGE;
    this.globalSelection = 0; // Selection index in allCompletions

    // Ctrl-hold Google Search mode
    this.isGoogleSearchMode = false;
    this._onCtrlDown = this._onCtrlDown.bind(this);
    this._onCtrlUp = this._onCtrlUp.bind(this);
    window.addEventListener("keydown", this._onCtrlDown, true);
    window.addEventListener("keyup", this._onCtrlUp, true);
    // Also deactivate if the window loses focus while Ctrl is held
    window.addEventListener("blur", () => this._deactivateGoogleMode());

    // Animated border preference (persisted in localStorage)
    this._loadAnimatedBorderPref();
  }

  // --- Animated border preference ---
  _loadAnimatedBorderPref() {
    try {
      const disabled = localStorage.getItem("vimium.vomnibarAnimatedBorder") === "disabled";
      if (disabled) {
        this.box.classList.add("no-animated-border");
      }
    } catch (e) { /* ignore */ }
  }

  setAnimatedBorder(enabled) {
    try {
      localStorage.setItem("vimium.vomnibarAnimatedBorder", enabled ? "enabled" : "disabled");
    } catch (e) { /* ignore */ }
    if (enabled) {
      this.box.classList.remove("no-animated-border");
    } else {
      this.box.classList.add("no-animated-border");
    }
  }

  // --- Ctrl-hold Google Search Mode ---
  _onCtrlDown(event) {
    if (event.key === "Control" && !this.isGoogleSearchMode) {
      this._activateGoogleMode();
    }
  }

  _onCtrlUp(event) {
    if (event.key === "Control" && this.isGoogleSearchMode) {
      this._deactivateGoogleMode();
    }
  }

  _activateGoogleMode() {
    this.isGoogleSearchMode = true;
    this.box.classList.add("google-search-mode");
    // Hide the results list immediately
    this.completionList.style.display = "none";
    this._spawnParticles();
  }

  _deactivateGoogleMode() {
    if (!this.isGoogleSearchMode) return;
    this.isGoogleSearchMode = false;
    this.box.classList.remove("google-search-mode");
    // Restore results list visibility
    if (this.completions.length > 0) {
      this.completionList.style.display = "block";
    }
  }

  _spawnParticles() {
    const container = this.box;
    const colors = ["#4285F4", "#EA4335", "#FBBC05", "#34A853", "#ff00c1", "#04d9ff"];
    for (let i = 0; i < 24; i++) {
      const particle = document.createElement("span");
      particle.className = "google-mode-particle";
      const color = colors[Math.floor(Math.random() * colors.length)];
      const x = Math.random() * 100;
      const delay = Math.random() * 0.3;
      const size = 4 + Math.random() * 6;
      particle.style.cssText = `
        left: ${x}%; bottom: 0;
        width: ${size}px; height: ${size}px;
        background: ${color};
        animation-delay: ${delay}s;
      `;
      container.appendChild(particle);
      particle.addEventListener("animationend", () => particle.remove());
    }
  }

  setQuery(query) {
    this.input.value = query;
  }
  setActiveUserSearchEngine(userSearchEngine) {
    this.activeUserSearchEngine = userSearchEngine;
  }

  setInitialSelectionValue(initialSelectionValue) {
    this.initialSelectionValue = initialSelectionValue;
  }
  setForceNewTab(forceNewTab) {
    this.forceNewTab = forceNewTab;
  }
  setCompleterName(name) {
    this.completerName = name;
    this.reset();
  }

  // True if the user has entered the keyword of one of their custom search engines.
  isUserSearchEngineActive() {
    return this.activeUserSearchEngine != null;
  }

  // Check if current query is a theme command (for OmniSearch only)
  isThemeCommand() {
    if (this.completerName !== "omniSearch") return false;
    const query = this.input.value.trim().toLowerCase();
    return query.startsWith(THEME_COMMAND_PREFIX);
  }

  // Get the theme search query (part after "theme ")
  getThemeSearchQuery() {
    const query = this.input.value.trim();
    if (query.toLowerCase() === THEME_COMMAND_PREFIX) return "";
    if (query.toLowerCase().startsWith(THEME_COMMAND_PREFIX + " ")) {
      return query.slice(THEME_COMMAND_PREFIX.length + 1).toLowerCase();
    }
    return "";
  }

  // The sequence of events when the vomnibar is hidden:
  // 1. Post a "hide" message to the host page.
  // 2. The host page hides the vomnibar.
  // 3. When that page receives the focus, it posts back a "hidden" message.
  // 4. Only once the "hidden" message is received here is onHiddenCallback called.
  //
  // This ensures that the vomnibar is actually hidden before any new tab is created, and avoids
  // flicker after opening a link in a new tab then returning to the original tab. See #1485.
  async hide(onHiddenCallback = null) {
    // Prevent multiple hide calls
    if (this.isHiding) return;
    this.isHiding = true;
    
    this.onHiddenCallback = onHiddenCallback;
    this.input.blur();
    // Cancel theme preview if active
    if (this.isThemeMode && themeManager.isInPreviewMode()) {
      themeManager.cancelPreview();
    }
    this.reset();
    // Trigger slide-out animation before hiding
    await this.hideAnimations();
    // Wait until this iframe's DOM has been rendered before hiding the iframe. This is to prevent
    // Chrome caching the previous visual state of the vomnibar iframe. See #4708.
    setTimeout(() => {
      UIComponentMessenger.postMessage({ name: "hide" });
    }, 0);
  }

  onHidden() {
    this.onHiddenCallback?.();
    this.onHiddenCallback = null;
    this.reset();
  }

  reset() {
    this.input.value = "";
    this.completions = [];
    this.allCompletions = [];
    this.renderCompletions(this.completions);
    this.previousInputValue = null;
    this.activeUserSearchEngine = null;
    this.selection = this.initialSelectionValue;
    this.globalSelection = 0;
    this.currentPage = 0;
    this.seenTabToOpenCompletionList = false;
    this.lastRequestId = null;
    this.isThemeMode = false;
    this.themeCompletions = [];
    this.box.classList.remove("theme-preview");
    this._deactivateGoogleMode();
    this.updatePositionIndicator();
  }

  updateSelection() {
    // For suggestions from custom search engines, we copy the suggestion's text into the input when
    // the suggestion is selected, and revert when it is not. This allows the user to select a
    // suggestion and then continue typing.
    const completion = this.completions[this.selection];
    const shouldReplaceInputWithSuggestion = this.selection >= 0 &&
      completion.insertText != null;
    if (shouldReplaceInputWithSuggestion) {
      if (this.previousInputValue == null) {
        this.previousInputValue = this.input.value;
      }
      this.input.value = completion.insertText;
    } else if (this.previousInputValue != null) {
      this.input.value = this.previousInputValue;
      this.previousInputValue = null;
    }

    // Highlight the selected entry.
    for (const [i, el] of Object.entries(this.completionList.children)) {
      el.className = i == this.selection ? "selected" : "";
    }

    // Update position indicator
    this.updatePositionIndicator();

    // Preview theme when in theme mode and selection changes
    if (this.isThemeMode && this.selection >= 0) {
      const themeCompletion = this.themeCompletions[this.selection];
      if (themeCompletion) {
        themeManager.previewTheme(themeCompletion.name);
        this.box.classList.add("theme-preview");
      }
    }
  }

  updatePositionIndicator() {
    if (!this.positionIndicator) return;
    
    const totalItems = this.allCompletions.length;
    if (totalItems === 0 || this.globalSelection < 0) {
      this.positionIndicator.textContent = "";
      this.positionIndicator.classList.remove("visible");
      return;
    }
    
    this.positionIndicator.textContent = `${this.globalSelection + 1}/${totalItems}`;
    this.positionIndicator.classList.add("visible");
  }

  updatePageAndSelection() {
    // Calculate which page the global selection is on
    const newPage = Math.floor(this.globalSelection / this.itemsPerPage);
    
    // If page changed, re-render
    if (newPage !== this.currentPage) {
      this.currentPage = newPage;
      this.renderCurrentPage();
    }
    
    // Calculate selection within current page
    this.selection = this.globalSelection % this.itemsPerPage;
    this.updateSelection();
  }

  renderCurrentPage() {
    const start = this.currentPage * this.itemsPerPage;
    const end = Math.min(start + this.itemsPerPage, this.allCompletions.length);
    this.completions = this.allCompletions.slice(start, end);
    this.renderCompletions(this.completions);
  }

  // Returns the user's action ("up", "down", "tab", etc, or null) based on their keypress. We
  // support the arrow keys and various other shortcuts, and this function hides the event-decoding
  // complexity.
  actionFromKeyEvent(event) {
    const key = KeyboardUtils.getKeyChar(event);
    // Handle <Enter> on "keypress", and other events on "keydown". This avoids interence with CJK
    // translation (see #2915 and #2934).
    if ((event.type === "keypress") && (key !== "enter")) return null;
    if ((event.type === "keydown") && (key === "enter")) return null;
    if (KeyboardUtils.isEscape(event)) {
      return "dismiss";
    } else if (
      (key === "up") ||
      (event.shiftKey && (event.key === "Tab")) ||
      (event.ctrlKey && ((key === "k") || (key === "p")))
    ) {
      return "up";
    } else if ((event.key === "Tab") && !event.shiftKey) {
      return "tab";
    } else if (
      (key === "down") ||
      (event.ctrlKey && ((key === "j") || (key === "n")))
    ) {
      return "down";
    } else if (event.ctrlKey && (key === "enter")) {
      return "ctrl-enter";
    } else if (event.key === "Enter") {
      return "enter";
    } else if ((event.key === "Delete") && event.shiftKey && !event.ctrlKey && !event.altKey) {
      return "remove";
    } else if (event.ctrlKey && (key === "d")) {
      return "closeTab";
    } else if (KeyboardUtils.isBackspace(event)) {
      return "delete";
    }

    return null;
  }

  async onKeyEvent(event) {
    const action = this.actionFromKeyEvent(event);
    if (!action) {
      return;
    }

    // Prevent default browser behavior for closeTab action (Ctrl+D normally closes the tab)
    if (action === "closeTab") {
      event.stopImmediatePropagation();
      event.preventDefault();
    }

    if (action === "dismiss") {
      // In theme mode, cancel preview and revert to previous theme
      if (this.isThemeMode && themeManager.isInPreviewMode()) {
        themeManager.cancelPreview();
        this.box.classList.remove("theme-preview");
      }
      this.hide();
    } else if (["tab", "down"].includes(action)) {
      if (
        (action === "tab") &&
        (this.completerName === "omni") &&
        !this.seenTabToOpenCompletionList &&
        (this.input.value.trim().length === 0)
      ) {
        this.seenTabToOpenCompletionList = true;
        this.update();
      } else if (this.allCompletions.length > 0) {
        // Move global selection down with cycling
        this.globalSelection += 1;
        if (this.globalSelection >= this.allCompletions.length) {
          this.globalSelection = 0; // Cycle back to first
        }
        this.updatePageAndSelection();
      }
    } else if (action === "up") {
      if (this.allCompletions.length > 0) {
        // Move global selection up with cycling
        this.globalSelection -= 1;
        if (this.globalSelection < 0) {
          this.globalSelection = this.allCompletions.length - 1; // Cycle to last
        }
        this.updatePageAndSelection();
      }
    } else if (action === "enter") {
      await this.handleEnterKey(event);
    } else if (action === "ctrl-enter") {
      // Populate the vomnibar with the current selection's URL.
      if (!this.isUserSearchEngineActive() && (this.selection >= 0)) {
        if (this.previousInputValue == null) {
          this.previousInputValue = this.input.value;
        }
        this.input.value = this.completions[this.selection]?.url;
        this.input.scrollLeft = this.input.scrollWidth;
      }
    } else if (action === "delete") {
      if (this.isUserSearchEngineActive() && (this.input.selectionEnd === 0)) {
        // Normally, with custom search engines, the keyword (e.g. the "w" of "w query terms") is
        // suppressed. If the cursor is at the start of the input, then reinstate the keyword (the
        // "w").
        const keyword = this.activeUserSearchEngine.keyword;
        this.input.value = keyword + this.input.value.trimStart();
        this.input.selectionStart = this.input.selectionEnd = keyword.length;
        this.activeUserSearchEngine = null;
        this.update();
      } else if (this.seenTabToOpenCompletionList && (this.input.value.trim().length === 0)) {
        this.seenTabToOpenCompletionList = false;
        this.update();
      } else {
        return; // Do not suppress event.
      }
    } else if ((action === "remove") && (this.selection >= 0)) {
      const completion = this.completions[this.selection];
      console.log(completion);
    } else if ((action === "closeTab") && (this.selection >= 0)) {
      const completion = this.completions[this.selection];
      if (completion.tabId != null) {
        // Close the tab
        chrome.runtime.sendMessage({ handler: "closeTabFromVomnibar", tabIdToBeRemoved: completion.tabId });
        // Remove the completion from allCompletions (pagination source)
        this.allCompletions.splice(this.globalSelection, 1);
        
        // Adjust global selection if needed
        if (this.globalSelection >= this.allCompletions.length) {
          this.globalSelection = this.allCompletions.length - 1;
        }
        
        // Re-render current page
        this.renderCurrentPage();
        
        // Recalculate selection within page
        if (this.allCompletions.length > 0) {
          this.selection = this.globalSelection % this.itemsPerPage;
        } else {
          this.selection = 0;
          this.globalSelection = 0;
        }
        this.updateSelection();
      }
      // Already prevented default at the top of the function, so just return
      return;
    }

    event.stopImmediatePropagation();
    event.preventDefault();
  }

  async handleEnterKey(event) {
    // Handle Ctrl-hold Google Search mode: search with Google immediately
    if (this.isGoogleSearchMode) {
      const query = this.input.value.trim();
      if (query.length === 0) return;
      this._deactivateGoogleMode();
      this.hide(() => {
        chrome.runtime.sendMessage({
          handler: "launchSearchQuery",
          query,
          openInNewTab: false,
        });
      });
      return;
    }

    // Handle theme selection mode
    if (this.isThemeMode && this.selection >= 0) {
      const themeCompletion = this.themeCompletions[this.selection];
      if (themeCompletion) {
        themeManager.confirmPreview();
        this.box.classList.remove("theme-preview");
        this.hide();
        return;
      }
    }

    const isPrimarySearchSuggestion = (c) => c?.isPrimarySuggestion && c?.isCustomSearch;
    let query = this.input.value.trim();

    // Note that it's possible that this.completions is empty. This can happen in practice if the
    // user hits enter quickly after loading the vomnibar, before the filterCompletions request to
    // the background page finishes.
    const waitingOnCompletions = this.completions.length == 0;
    const completion = this.completions[this.selection];

    const openInNewTab = this.forceNewTab || event.shiftKey || event.ctrlKey || event.altKey ||
      event.metaKey;

    // If the user types something and hits enter without selecting a completion from the list,
    // then:
    //   - If they've activated a custom search engine in the Vomnibar, then launch that search
    //     using the typed-in query.
    //   - Otherwise, open the query as a URL or create a default search as appropriate.
    //
    //  When launching a query in a custom search engine, the user may have typed more text than
    //  that which is included in the URL associated with the primary suggestion, because the
    //  suggestions are updated asynchronously. Therefore, to avoid a race condition, we construct
    //  the search URL from the actual contents of the input (query).
    if (waitingOnCompletions || this.selection == -1) {
      // <Enter> on an empty query is a no-op.
      if (query.length == 0) return;
      const firstCompletion = this.completions[0];
      const isPrimary = isPrimarySearchSuggestion(firstCompletion);
      if (isPrimary) {
        query = UrlUtils.createSearchUrl(query, firstCompletion.searchUrl);
        await this.launchUrl(query);
      } else {
        // If the query looks like a URL, try to open it directly. Otherwise, pass the query to
        // the user's default search engine.
        // TODO(philc):
        const isUrl = await UrlUtils.isUrl(query);
        if (isUrl) {
          this.hide(() => this.launchUrl(query, openInNewTab));
        } else {
          this.hide(() =>
            chrome.runtime.sendMessage({
              handler: "launchSearchQuery",
              query,
              openInNewTab,
            })
          );
        }
      }
    } else if (isPrimarySearchSuggestion(completion)) {
      query = UrlUtils.createSearchUrl(query, completion.searchUrl);
      this.hide(() => this.launchUrl(query, openInNewTab));
    } else {
      this.hide(() => this.openCompletion(completion, openInNewTab));
    }
  }

  // Return the background-page query corresponding to the current input state. In other words,
  // reinstate any search engine keyword which is currently being suppressed, and strip any prompted
  // text.
  getInputValueAsQuery() {
    const prefix = this.isUserSearchEngineActive() ? this.activeUserSearchEngine.keyword + " " : "";
    return prefix + this.input.value;
  }

  // Generate theme completions based on search query
  getThemeCompletions(searchQuery) {
    const currentTheme = themeManager.getCurrentTheme();
    let themes = themeDefinitions;

    // Filter themes if there's a search query
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      themes = themes.filter(theme => 
        theme.name.toLowerCase().includes(lowerQuery) ||
        theme.description.toLowerCase().includes(lowerQuery)
      );
    }

    return themes.map(theme => ({
      name: theme.name,
      icon: theme.icon,
      description: theme.description,
      isActive: theme.name === currentTheme,
      html: this.generateThemeItemHtml(theme, theme.name === currentTheme)
    }));
  }

  // Generate HTML for a theme item
  generateThemeItemHtml(theme, isActive) {
    const activeLabel = isActive ? `<span class="theme-active">Active</span>` : "";
    return `
      <span class="theme-icon">${theme.icon}</span>
      <div class="theme-info">
        <div class="theme-name">${Utils.escapeHtml(theme.name)}</div>
        <div class="theme-description">${Utils.escapeHtml(theme.description)}</div>
      </div>
      ${activeLabel}
    `;
  }

  // Render theme completions
  renderThemeCompletions() {
    this.completionList.innerHTML = this.themeCompletions.map((theme, index) => 
      `<li class="theme-item" data-index="${index}">${theme.html}</li>`
    ).join("");
    this.completionList.style.display = this.themeCompletions.length > 0 ? "block" : "";
  }

  async updateCompletions() {
    // Check if this is a theme command (OmniSearch only)
    if (this.isThemeCommand()) {
      this.isThemeMode = true;
      const searchQuery = this.getThemeSearchQuery();
      this.themeCompletions = this.getThemeCompletions(searchQuery);
      
      // Create fake completions for rendering (use allCompletions for consistency)
      this.allCompletions = this.themeCompletions.map((theme, index) => ({
        html: theme.html,
        isTheme: true,
        themeIndex: index
      }));
      this.completions = this.allCompletions;
      this.currentPage = 0;
      
      this.globalSelection = 0; // Auto-select first theme
      this.selection = 0;
      this.renderThemeCompletions();
      this.updateSelection();
      return;
    }

    // Not in theme mode
    this.isThemeMode = false;
    this.themeCompletions = [];
    this.box.classList.remove("theme-preview");

    const requestId = Utils.createUniqueId();
    this.lastRequestId = requestId;
    const query = this.getInputValueAsQuery();
    const queryTerms = query.trim().split(/\s+/).filter((s) => s.length > 0);

    const results = await chrome.runtime.sendMessage({
      handler: "filterCompletions",
      completerName: this.completerName,
      queryTerms,
      query,
      seenTabToOpenCompletionList: this.seenTabToOpenCompletionList,
    });

    // Ensure that no new filter requests have gone out while waiting for this result.
    if (this.lastRequestId != requestId) return;

    // Store all completions for pagination
    this.allCompletions = results;
    this.currentPage = 0;
    
    // Get first page of completions
    this.completions = this.allCompletions.slice(0, this.itemsPerPage);
    
    // Set initial selection
    const autoSelect = this.allCompletions[0]?.autoSelect;
    this.globalSelection = 0;
    this.selection = autoSelect ? 0 : this.initialSelectionValue;
    
    this.renderCompletions(this.completions);
    this.selection = Math.min(
      this.completions.length - 1,
      Math.max(this.initialSelectionValue, this.selection),
    );
    this.updateSelection();
  }

  renderCompletions(completions) {
    const query = this.input.value.trim();
    
    // If no completions and user has typed something, show "Search with Google" option
    if (completions.length === 0 && query.length > 0) {
      const escapedQuery = Utils.escapeHtml(query);
      this.completionList.innerHTML = `
        <li data-search-query="${escapedQuery}">
          <span class="search-icon"></span>
          <div class="suggestion-content">
            <div class="top-half">
              <span class="title"><strong>${escapedQuery}</strong> - Search with Google</span>
            </div>
          </div>
        </li>`;
      this.completionList.style.display = "block";
      // Add click handler for search fallback
      const searchItem = this.completionList.querySelector(".search-fallback");
      if (searchItem) {
        searchItem.addEventListener("click", (e) => {
          e.stopPropagation();
          this.hide(() => {
            chrome.runtime.sendMessage({
              handler: "launchSearchQuery",
              query: query,
              openInNewTab: false,
            });
          });
        });
      }
      return;
    }
    
    this.completionList.innerHTML = completions.map((c, index) => 
      `<li data-index="${index}">${c.html}</li>`
    ).join("");
    this.completionList.style.display = completions.length > 0 ? "block" : "";
    
    // Add click handlers for switch tab buttons
    this.completionList.querySelectorAll(".switch-tab-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        const tabId = parseInt(btn.dataset.tabId, 10);
        if (tabId) {
          chrome.runtime.sendMessage({ handler: "switchTabFromVomnibar", tabIdToSwitch: tabId });
          this.hide();
        }
      });
    });
  }

  refreshCompletions() {
    chrome.runtime.sendMessage({
      handler: "refreshCompletions",
      completerName: this.completerName,
    });
  }

  cancelCompletions() {
    // Let the background page's completer optionally abandon any pending query, because the user is
    // typing and another query will arrive soon.
    chrome.runtime.sendMessage({
      handler: "cancelCompletions",
      completerName: this.completerName,
    });
  }

  onInput() {
    this.seenTabToOpenCompletionList = false;
    this.cancelCompletions();

    // For custom search engines, we suppress the leading prefix (e.g. the "w" of "w query terms")
    // within the vomnibar input.
    if (!this.isUserSearchEngineActive() && this.getUserSearchEngineForQuery() != null) {
      this.activeUserSearchEngine = this.getUserSearchEngineForQuery();
      const queryTerms = this.input.value.trim().split(/\s+/);
      this.input.value = queryTerms.slice(1).join(" ");
    }

    // If the user types, then don't reset any previous text, and reset the selection.
    if (this.previousInputValue != null) {
      this.previousInputValue = null;
      this.selection = -1;
    }
    this.update();
  }

  // Returns the UserSearchEngine for the given query. Returns null if the query does not begin with
  // a keyword from one of the user's search engines.
  getUserSearchEngineForQuery() {
    // This logic is duplicated from SearchEngineCompleter.getEngineForQueryPrefix
    const parts = this.input.value.trimStart().split(/\s+/);
    // For a keyword "w", we match "w search terms" and "w ", but not "w" on its own.
    const keyword = parts[0];
    if (parts.length <= 1) return null;
    // Don't match queries for built-in properties like "constructor". See #4396.
    if (Object.hasOwn(userSearchEngines.keywordToEngine, keyword)) {
      return userSearchEngines.keywordToEngine[keyword];
    }
    return null;
  }

  async update() {
    await this.updateCompletions();
    this.input.focus();
  }

  openCompletion(completion, openInNewTab) {
    if (completion.description == "tab") {
      chrome.runtime.sendMessage({ handler: "selectSpecificTab", id: completion.tabId });
    } else {
      this.launchUrl(completion.url, openInNewTab);
    }
  }

  async launchUrl(url, openInNewTab) {
    // If the URL is a bookmarklet (so, prefixed with "javascript:"), then always open it in the
    // current tab.
    if (openInNewTab && UrlUtils.hasJavascriptProtocol(url)) {
      openInNewTab = false;
    }
    await chrome.runtime.sendMessage({
      handler: openInNewTab ? "openUrlInNewTab" : "openUrlInCurrentTab",
      url,
    });
  }

  initDom() {
    this.box = document.getElementById("vomnibar");
    this.isHiding = false;

    this.input = this.box.querySelector("input");
    this.input.addEventListener("input", this.onInput);
    this.input.addEventListener("keydown", this.onKeyEvent);
    this.input.addEventListener("keypress", this.onKeyEvent);
    this.completionList = this.box.querySelector("ul");
    this.completionList.style.display = "";
    this.positionIndicator = document.getElementById("vomnibar-position-indicator");

    window.addEventListener("focus", () => this.input.focus());
    // A click in the vomnibar itself refocuses the input.
    this.box.addEventListener("mousedown", (event) => {
      event.stopPropagation();
    });
    // A click anywhere else hides the vomnibar.
    document.body.addEventListener("mousedown", (event) => {
      // Only hide if the click is outside the vomnibar
      if (!this.box.contains(event.target) && !this.isHiding) {
        this.hide();
      }
    });
  }

  showAnimations() {
    // Reset hiding flag when showing
    this.isHiding = false;
    // Reset any existing animation classes first
    this.box.classList.remove("vomnibar-slide-out");
    // Force reflow to restart animation
    void this.box.offsetWidth;
    this.box.classList.add("vomnibar-slide-in");
    // Focus input after animation starts
    this.input.focus();
  }

  hideAnimations() {
    return new Promise((resolve) => {
      // Hide vomnibar with slide-out
      this.box.classList.remove("vomnibar-slide-in");
      this.box.classList.add("vomnibar-slide-out");

      // Wait for animation to complete
      const handler = () => {
        this.box.removeEventListener("animationend", handler);
        resolve();
      };
      this.box.addEventListener("animationend", handler, { once: true });

      // Fallback timeout in case animationend doesn't fire
      setTimeout(resolve, 200);
    });
  }
}

let vomnibarInstance;

function init() {
  UIComponentMessenger.init();
  UIComponentMessenger.registerHandler(function (event) {
    switch (event.data.name) {
      case "hide":
        ui?.hide();
        break;
      case "hidden":
        ui?.onHidden();
        break;
      case "activate":
        const options = Object.assign({}, event.data);
        delete options.name;
        activate(options);
        break;
      default:
        Utils.assert(false, "Unrecognized message type.", event.data);
    }
  });
}

const testEnv = globalThis.window == null ||
  globalThis.window.location.search.includes("dom_tests=true");
if (!testEnv) {
  document.addEventListener("DOMContentLoaded", async () => {
    await Settings.onLoaded();
    DomUtils.injectUserCss(); // Manually inject custom user styles.
  });
  init();
}
