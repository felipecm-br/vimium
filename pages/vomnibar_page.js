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
import { themeDefinitions, themeManager } from "./vomnibar_themes.js";
import { borderMotion } from "./vomnibar_border.js";
import { effectLevels, effectsManager } from "./vomnibar_effects.js";

// An instance of VomnibarUI. Exported for use by tests.
export let ui;

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
    prefixCount: 1,
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
  ui.setPrefixCount(options.prefixCount);
  ui.setActiveUserSearchEngine(userSearchEngines.keywordToEngine[options.keyword]);
  // Trigger slide-in animation on each activation
  ui.showAnimations();
  // Use await here for vomnibar_test.js, so that this page doesn't get unloaded while a test is
  // running.
  await ui.update();
}

// The "search the web" row, built here when the background page has nothing to offer. It has the
// shape of OmniSearchCompleter's row (completers.js), which handleEnterKey recognizes by
// `webSearchQuery`.
export function webSearchCompletion(query) {
  return {
    webSearchQuery: query,
    description: "search",
    url: "",
    title: query,
    html: `\
<span class="suggestion-icons" aria-hidden="true"><span class="type-icon material-symbols-outlined">search</span></span>
<div class="suggestion-content">
  <div class="top-half">
    <span class="title">${Utils.escapeHtml(query)}</span>
    <span class="url">Search the web</span>
  </div>
</div>
<kbd class="shortcut-hint" aria-hidden="true">Alt ↵</kbd>`,
  };
}

// The rest of the address of `url` after `typed`, when `typed` starts it as an address would be
// typed: without the scheme, without "www." unless that was typed, and only up to the end of the
// host unless the path is being typed. Null otherwise: "git" gets "hub.com" for
// https://www.github.com/philc, "github.com/ph" gets "ilc", "rust book" gets nothing.
export function addressCompletion(typed, url) {
  if (!typed || /\s/.test(typed) || !/^https?:\/\//i.test(url ?? "")) return null;
  let address = url.replace(/^https?:\/\//i, "");
  if (!/^www\./i.test(typed)) address = address.replace(/^www\./i, "");
  if (!typed.includes("/")) address = address.split("/")[0];
  const starts = address.toLowerCase().startsWith(typed.toLowerCase());
  return starts && address.length > typed.length ? address.slice(typed.length) : null;
}

// Theme command prefix for triggering theme selection in OmniSearch
const THEME_COMMAND_PREFIX = "theme";
// Typing this in OmniSearch lists the effects levels, picked the same way as themes.
const EFFECTS_COMMAND_PREFIX = "effects";

// Pagination settings
const DEFAULT_ITEMS_PER_PAGE = 7;
// The key that searches the web: Alt+Enter does it at once, and holding Alt for GOOGLE_MODE_HOLD_MS
// shows Google mode (the badge and glow) so the next Enter is clearly a web search. Alt types no
// characters, unlike Shift, so the hold can be short.
const GOOGLE_MODE_KEY = "Alt";
export const GOOGLE_MODE_HOLD_MS = 150;

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
    effectsManager.init();

    // Pagination state
    this.allCompletions = []; // All completions from backend
    this.currentPage = 0;
    this.itemsPerPage = DEFAULT_ITEMS_PER_PAGE;
    this.globalSelection = 0; // Selection index in allCompletions

    // Alt-hold Google Search mode
    this.isGoogleSearchMode = false;
    this.isGoogleModeModifierPressed = false;
    this.googleModeArmed = false;
    this.googleModeHoldTimer = null;
    this._onGoogleModeModifierDown = this._onGoogleModeModifierDown.bind(this);
    this._onGoogleModeModifierUp = this._onGoogleModeModifierUp.bind(this);
    globalThis.addEventListener("keydown", this._onGoogleModeModifierDown, true);
    globalThis.addEventListener("keyup", this._onGoogleModeModifierUp, true);
    // Also deactivate if the window loses focus while modifier is held
    globalThis.addEventListener("blur", () => this._releaseGoogleModeModifier());

    // Border rotation speed and angle, adjustable in theme mode.
    borderMotion.init(this.box);
    this.themeFooter = document.getElementById("vomnibar-theme-footer");
  }

  // --- Alt-hold Google Search Mode ---
  // Holding Alt on its own for GOOGLE_MODE_HOLD_MS arms the mode, and releasing it ends it. Alt as
  // part of a chord (Alt+Tab) never arms it.
  _onGoogleModeModifierDown(event) {
    if (event.key === GOOGLE_MODE_KEY) {
      if (event.repeat || this.isGoogleModeModifierPressed) return;
      this.isGoogleModeModifierPressed = true;
      this.googleModeArmed = false;
      clearTimeout(this.googleModeHoldTimer);
      this.googleModeHoldTimer = setTimeout(() => {
        this.googleModeHoldTimer = null;
        this.googleModeArmed = true;
        this._updateGoogleModeState();
      }, GOOGLE_MODE_HOLD_MS);
    } else if (!event.altKey) {
      // Alt is up even though we missed its keyup (it was released outside this frame).
      this._releaseGoogleModeModifier();
    } else {
      // Another key before the hold delay passed: Alt is part of a chord, not a hold.
      clearTimeout(this.googleModeHoldTimer);
      this.googleModeHoldTimer = null;
    }
  }

  _onGoogleModeModifierUp(event) {
    if (event.key === GOOGLE_MODE_KEY) this._releaseGoogleModeModifier();
  }

  _releaseGoogleModeModifier() {
    clearTimeout(this.googleModeHoldTimer);
    this.googleModeHoldTimer = null;
    this.isGoogleModeModifierPressed = false;
    this.googleModeArmed = false;
    this._deactivateGoogleMode();
  }

  // The mode needs a query to search for, so input changes turn it on or off while armed.
  _updateGoogleModeState() {
    const hasInputValue = this.input.value.trim().length > 0;
    if (this.googleModeArmed && hasInputValue) {
      this._activateGoogleMode();
    } else {
      this._deactivateGoogleMode();
    }
  }

  _activateGoogleMode() {
    if (this.isGoogleSearchMode) return;
    this.isGoogleSearchMode = true;
    this.box.classList.add("google-search-mode");
    // Hide the results list immediately
    this.completionList.style.display = "none";
    this.updateGhost();
  }

  _deactivateGoogleMode() {
    if (!this.isGoogleSearchMode) return;
    this.isGoogleSearchMode = false;
    this.box.classList.remove("google-search-mode");
    // Restore results list visibility
    if (this.completions.length > 0) {
      this.completionList.style.display = "block";
    }
    this.updateGhost();
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

  // name: one of [omni, bookmarks, commands, tabs].
  setCompleterName(name) {
    this.completerName = name;
    const capitalize = (s) => s[0].toUpperCase() + s.slice(1);
    const placeholder = (name == "omni")
      ? ""
      : (name == "omniSearch")
      ? "Search tabs, bookmarks, history..."
      : capitalize(name);
    this.input.setAttribute("placeholder", placeholder);
    this.reset();
  }

  setPrefixCount(prefixCount) {
    this.prefixCount = prefixCount;
  }

  // True if the user has entered the keyword of one of their custom search engines.
  isUserSearchEngineActive() {
    return this.activeUserSearchEngine != null;
  }

  // Which picker the query opens in OmniSearch: "theme", "effects", or null for a normal search.
  pickerKind() {
    if (this.completerName !== "omniSearch") return null;
    const query = this.input.value.trim().toLowerCase();
    if (query.startsWith(EFFECTS_COMMAND_PREFIX)) return "effects";
    if (query.startsWith(THEME_COMMAND_PREFIX)) return "theme";
    return null;
  }

  isThemeCommand() {
    return this.pickerKind() != null;
  }

  // The filter typed after the picker's command ("dark" in "theme dark").
  getThemeSearchQuery() {
    const prefix = this.pickerKind() === "effects" ? EFFECTS_COMMAND_PREFIX : THEME_COMMAND_PREFIX;
    const query = this.input.value.trim();
    if (query.toLowerCase().startsWith(prefix + " ")) {
      return query.slice(prefix.length + 1).toLowerCase();
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
    borderMotion.cancelPreview();
    effectsManager.cancelPreview();
    // Trigger slide-out animation BEFORE resetting DOM, so the animation plays smoothly
    // without jank from DOM manipulation.
    await this.hideAnimations();
    // Reset DOM state only after the slide-out animation has finished, so the user never
    // sees the list disappear before the vomnibar slides away.
    this.reset();
    // Wait until this iframe's DOM has been rendered before hiding the iframe. This is to prevent
    // Chrome caching the previous visual state of the vomnibar iframe. See #4708.
    UIComponentMessenger.postMessage({ name: "hide" });
  }

  onHidden() {
    this.onHiddenCallback?.();
    this.onHiddenCallback = null;
    this.reset();
  }

  reset() {
    this._releaseGoogleModeModifier();
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
    this.box.classList.remove("theme-preview", "theme-mode");
    this._deactivateGoogleMode();
    this.updatePositionIndicator();
    this.updateGhost();
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

    // Highlight the selected entry, and expose it to screen readers: the input is a combobox whose
    // active option follows the selection (focus stays in the input).
    for (const [i, el] of Object.entries(this.completionList.children)) {
      const selected = i == this.selection;
      // Toggle only "selected" so other classes (e.g. "theme-item") survive.
      el.classList.toggle("selected", selected);
      el.setAttribute("role", "option");
      el.id = `vomnibar-option-${i}`;
      el.setAttribute("aria-selected", String(selected));
    }
    const selectedEl = this.completionList.children[this.selection];
    if (selectedEl) {
      this.input.setAttribute("aria-activedescendant", selectedEl.id);
    } else {
      this.input.removeAttribute("aria-activedescendant");
    }
    this.input.setAttribute("aria-expanded", String(this.completionList.children.length > 0));

    // Update position indicator
    this.updatePositionIndicator();
    this.updateGhost();

    // Preview theme when in theme mode and selection changes
    if (this.isThemeMode && this.selection >= 0) {
      const themeCompletion = this.themeCompletions[this.globalSelection];
      if (themeCompletion?.kind === "effects") {
        effectsManager.preview(themeCompletion.name);
      } else if (themeCompletion) {
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

  // Shows, after what was typed, the rest of the address of the result Enter would open when what
  // was typed starts it, the way an address bar completes it inline (see addressCompletion). Only
  // for the first result, with the caret at the end; Right arrow or End types it in.
  updateGhost() {
    const typed = this.input.value;
    const completion = this.globalSelection === 0 && this.selection === 0
      ? this.completions[0]
      : null;
    const caretAtEnd = this.input.selectionStart === typed.length &&
      this.input.selectionEnd === typed.length;
    const shows = completion?.webSearchQuery == null && caretAtEnd && !this.isThemeMode &&
      !this.isGoogleSearchMode && !this.isUserSearchEngineActive() &&
      this.previousInputValue == null;
    let rest = shows ? addressCompletion(typed, completion?.url) : null;
    // Text wider than the input scrolls it, and the rest would no longer follow it.
    if (rest && this.input.scrollWidth > this.input.clientWidth) rest = null;
    this.ghostTyped.textContent = rest ? typed : "";
    this.ghostRest.textContent = rest ?? "";
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
    if (this.isThemeMode) {
      this.renderThemeCompletions();
      return;
    }
    this.renderCompletions(this.completions);
  }

  // Returns the user's action ("up", "down", "tab", etc, or null) based on their keypress. We
  // support the arrow keys and various other shortcuts, and this function hides the event-decoding
  // complexity.
  actionFromKeyEvent(event) {
    const key = KeyboardUtils.getKeyChar(event);
    // Alt+Enter searches the web, with or without Google mode showing. Handled on keydown, since
    // Alt+Enter may not produce a keypress.
    if ((event.key === "Enter") && event.altKey) {
      return event.type === "keydown" ? "web-search" : null;
    }
    // Handle <Enter> on "keypress", and other events on "keydown". This avoids interence with CJK
    // translation (see #2915 and #2934).
    if ((event.type === "keypress") && (key !== "enter")) return null;
    if ((event.type === "keydown") && (key === "enter") && !this.isGoogleSearchMode) return null;
    const hasModifier = event.shiftKey || event.ctrlKey || event.altKey || event.metaKey;
    if (
      ((key === "right") || (event.key === "End")) && !hasModifier && this.ghostRest.textContent
    ) {
      return "accept-ghost";
    }
    // Theme mode: left/right change the border speed, ctrl-left/right rotate its angle.
    if (
      this.isThemeMode && this.pickerKind() === "theme" && ((key === "left") || (key === "right"))
    ) {
      const forward = key === "right";
      if (event.ctrlKey) return forward ? "border-rotate-cw" : "border-rotate-ccw";
      return forward ? "border-faster" : "border-slower";
    }
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

    if (action.startsWith("border-")) {
      event.stopImmediatePropagation();
      event.preventDefault();
      if (action === "border-faster") borderMotion.changeSpeed(1);
      else if (action === "border-slower") borderMotion.changeSpeed(-1);
      else if (action === "border-rotate-cw") borderMotion.rotate(1);
      else if (action === "border-rotate-ccw") borderMotion.rotate(-1);
      this.updateThemeFooter();
    } else if (action === "accept-ghost") {
      this.input.value += this.ghostRest.textContent;
      this.input.setSelectionRange(this.input.value.length, this.input.value.length);
      this.onInput();
    } else if (action === "dismiss") {
      // In theme mode, cancel preview and revert to previous theme
      if (this.isThemeMode && themeManager.isInPreviewMode()) {
        themeManager.cancelPreview();
        this.box.classList.remove("theme-preview");
      }
      borderMotion.cancelPreview();
      effectsManager.cancelPreview();
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
    } else if (action === "web-search") {
      this.searchTheWeb(this.forceNewTab || event.shiftKey || event.ctrlKey || event.metaKey);
    } else if (action === "enter") {
      await this.handleEnterKey(event);
    } else if (action === "ctrl-enter") {
      if (this.isGoogleSearchMode) {
        await this.handleEnterKey(event);
        event.stopImmediatePropagation();
        event.preventDefault();
        return;
      }
      // Populate the vomnibar with the current selection's URL.
      if (
        !this.isUserSearchEngineActive() && this.completerName != "commands" &&
        (this.selection >= 0) && this.completions[this.selection]?.url
      ) {
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
      // Shift-Delete forgets a visited page (it leaves Chrome's history), or closes an open tab.
      // Bookmarks are kept: deleting one is not what "forget this result" means.
      const completion = this.completions[this.selection];
      if (completion?.tabId != null) {
        chrome.runtime.sendMessage({
          handler: "closeTabFromVomnibar",
          tabIdToBeRemoved: completion.tabId,
        });
        this.removeSelectedCompletion();
      } else if (["history", "topSite", "domain"].includes(completion?.description)) {
        chrome.runtime.sendMessage({ handler: "removeHistoryEntry", url: completion.url });
        this.removeSelectedCompletion();
      }
    } else if ((action === "closeTab") && (this.selection >= 0)) {
      const completion = this.completions[this.selection];
      if (completion.tabId != null) {
        // Close the tab
        chrome.runtime.sendMessage({
          handler: "closeTabFromVomnibar",
          tabIdToBeRemoved: completion.tabId,
        });
        this.removeSelectedCompletion();
      }
      // Already prevented default at the top of the function, so just return
      return;
    }

    event.stopImmediatePropagation();
    event.preventDefault();
  }

  // Drops the selected completion from the list and keeps the selection on the next one.
  removeSelectedCompletion() {
    this.allCompletions.splice(this.globalSelection, 1);
    if (this.globalSelection >= this.allCompletions.length) {
      this.globalSelection = Math.max(0, this.allCompletions.length - 1);
    }
    this.currentPage = Math.floor(this.globalSelection / this.itemsPerPage);
    this.renderCurrentPage();
    this.selection = this.allCompletions.length > 0 ? this.globalSelection % this.itemsPerPage : -1;
    this.updateSelection();
  }

  // Tells the background page what OmniSearch's user chose for what they typed (a page's `url`, or
  // `search` for searching the web), so the same choice comes first next time. See
  // background_scripts/completion/choices.js.
  rememberChoice(choice) {
    if (this.completerName !== "omniSearch") return;
    const query = this.previousInputValue ?? this.input.value;
    chrome.runtime.sendMessage({ handler: "rememberVomnibarChoice", query, ...choice });
  }

  // Searches the web for what was typed, with the browser's default engine.
  searchTheWeb(openInNewTab) {
    const query = this.input.value.trim();
    if (query.length === 0) return;
    this.rememberChoice({ search: true });
    this._deactivateGoogleMode();
    this.hide(() =>
      chrome.runtime.sendMessage({ handler: "launchSearchQuery", query, openInNewTab })
    );
  }

  async handleEnterKey(event) {
    // Alt-hold Google Search mode: search the web at once
    if (this.isGoogleSearchMode) {
      const query = this.input.value.trim();
      if (query.length === 0) return;
      this.rememberChoice({ search: true });
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
      const themeCompletion = this.themeCompletions[this.globalSelection];
      if (themeCompletion) {
        themeManager.confirmPreview();
        borderMotion.confirmPreview();
        effectsManager.confirmPreview();
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

    // Alt is not here: Alt+Enter searches the web.
    const openInNewTab = this.forceNewTab || event.shiftKey || event.ctrlKey || event.metaKey;

    // If the user types something and hits enter without selecting a completion from the list,
    // then:
    //   - If they've activated a custom search engine in the Vomnibar, launch that search using the
    //     typed-in query.
    //   - Otherwise, open the query as a URL or create a default search as appropriate.
    //
    //  When launching a query in a custom search engine, the user may have typed more text than
    //  that which is included in the URL associated with the primary suggestion, because the
    //  suggestions are updated asynchronously. Therefore, to avoid a race condition, we construct
    //  the search URL from the actual contents of the input (query).
    if (waitingOnCompletions || this.selection == -1) {
      // <Enter> on an empty query is a no-op.
      if (query.length == 0) return;

      // If the user typed a custom search engine keyword, use that directly. This handles the race
      // condition where the user hits Enter before the async completions response arrives
      // (waitingOnCompletions).
      if (this.isUserSearchEngineActive()) {
        query = UrlUtils.createSearchUrl(query, this.activeUserSearchEngine.url);
        this.hide(() => this.launchUrl(query, openInNewTab));
        return;
      }

      // <Enter> with no selection is a no-op, except on the completers that search the web for
      // what was typed (omni, and omniSearch, which also offers "Search with Google").
      if (this.completerName != "omni" && this.completerName != "omniSearch") return;

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
    } else if (completion.webSearchQuery != null) {
      // OmniSearch's "search the web" row: the browser's default engine, with the query as typed.
      this.rememberChoice({ search: true });
      this.hide(() =>
        chrome.runtime.sendMessage({ handler: "launchSearchQuery", query, openInNewTab })
      );
    } else if (isPrimarySearchSuggestion(completion)) {
      query = UrlUtils.createSearchUrl(query, completion.searchUrl);
      this.hide(() => this.launchUrl(query, openInNewTab));
    } else if (completion.command) {
      this.hide(async () => {
        await chrome.runtime.sendMessage({
          handler: "runNormalModeCommand",
          command: completion.command.registryEntry,
          count: this.prefixCount,
        });
      });
    } else {
      this.rememberChoice({ url: completion.url });
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
      themes = themes.filter((theme) =>
        theme.name.toLowerCase().includes(lowerQuery) ||
        theme.description.toLowerCase().includes(lowerQuery)
      );
    }

    return themes.map((theme) => ({
      kind: "theme",
      name: theme.name,
      icon: theme.icon,
      description: theme.description,
      isActive: theme.name === currentTheme,
      html: this.generateThemeItemHtml(theme, theme.name === currentTheme),
    }));
  }

  // The effects levels, shown like themes.
  getEffectCompletions(searchQuery) {
    const current = effectsManager.getCurrentLevel();
    return effectLevels
      .filter((level) =>
        !searchQuery || `${level.name} ${level.description}`.toLowerCase().includes(searchQuery)
      )
      .map((level) => ({
        kind: "effects",
        name: level.name,
        isActive: level.name === current,
        html: this.generateThemeItemHtml(level, level.name === current),
      }));
  }

  // Generate HTML for a theme item
  generateThemeItemHtml(theme, isActive) {
    const activeLabel = isActive ? `<span class="theme-active">Active</span>` : "";
    return `
      <span class="theme-icon" aria-hidden="true">${theme.icon}</span>
      <div class="theme-info">
        <div class="theme-name">${Utils.escapeHtml(theme.name)}</div>
        <div class="theme-description">${Utils.escapeHtml(theme.description)}</div>
      </div>
      ${activeLabel}
    `;
  }

  // Render theme completions
  // Show the border speed and angle, and the keys that change them, under the theme list.
  updateThemeFooter() {
    if (!this.themeFooter) return;
    if (this.pickerKind() === "effects") {
      this.themeFooter.innerHTML = `\
<span><kbd>↑</kbd><kbd>↓</kbd> Preview</span>
<span><kbd>Enter</kbd> Apply</span>
<span><kbd>Esc</kbd> Cancel</span>`;
      return;
    }
    const { speed, angle } = borderMotion.describe();
    this.themeFooter.innerHTML = `\
<span><kbd>←</kbd><kbd>→</kbd> Speed <b>${speed}</b></span>
<span><kbd>Ctrl</kbd><kbd>←</kbd><kbd>→</kbd> Angle <b>${angle}</b></span>
<span><kbd>Enter</kbd> Apply</span>
<span><kbd>Esc</kbd> Cancel</span>`;
  }

  // Render the theme completions of the current page.
  renderThemeCompletions() {
    const start = this.currentPage * this.itemsPerPage;
    const pageThemes = this.themeCompletions.slice(start, start + this.itemsPerPage);
    this.completionList.innerHTML = pageThemes.map((theme, index) =>
      `<li class="theme-item" data-index="${start + index}">${theme.html}</li>`
    ).join("");
    this.completionList.style.display = this.themeCompletions.length > 0 ? "block" : "";
  }

  async updateCompletions() {
    // Check if this is a theme command (OmniSearch only)
    if (this.isThemeCommand()) {
      this.isThemeMode = true;
      const searchQuery = this.getThemeSearchQuery();
      this.themeCompletions = this.pickerKind() === "effects"
        ? this.getEffectCompletions(searchQuery)
        : this.getThemeCompletions(searchQuery);

      // Create fake completions for rendering (use allCompletions for consistency)
      this.allCompletions = this.themeCompletions.map((theme, index) => ({
        html: theme.html,
        isTheme: true,
        themeIndex: index,
      }));
      this.currentPage = 0;
      this.completions = this.allCompletions.slice(0, this.itemsPerPage);

      this.globalSelection = 0; // Auto-select first theme
      this.selection = 0;
      this.renderThemeCompletions();
      this.updateSelection();
      this.box.classList.add("theme-mode");
      this.updateThemeFooter();
      return;
    }

    // Not in theme mode
    this.isThemeMode = false;
    this.themeCompletions = [];
    this.box.classList.remove("theme-preview", "theme-mode");

    const requestId = Utils.createUniqueId();
    this.lastRequestId = requestId;
    const query = this.getInputValueAsQuery();
    const queryTerms = query.trim().split(/\s+/).filter((s) => s.length > 0);

    let results = await chrome.runtime.sendMessage({
      handler: "filterCompletions",
      completerName: this.completerName,
      queryTerms,
      query,
      seenTabToOpenCompletionList: this.seenTabToOpenCompletionList,
    });

    // Ensure that no new filter requests have gone out while waiting for this result.
    if (this.lastRequestId != requestId) return;

    // Nothing matched: offer to search the web for the query, as a regular result so the arrows,
    // Enter and a click all reach it.
    const typed = this.input.value.trim();
    if (results.length === 0 && typed.length > 0 && !this.isThemeMode) {
      results = [webSearchCompletion(typed)];
    }

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
    this.completionList.innerHTML = completions.map((c, index) =>
      `<li data-index="${index}">${c.html}</li>`
    ).join("");
    this.completionList.style.display = completions.length > 0 ? "block" : "";
  }

  // The button on an open tab's row, which switches to that tab.
  switchToTab(event, tabId) {
    event.stopPropagation();
    event.preventDefault();
    if (!tabId || this.isHiding) return;
    const url = this.completions.find((c) => c.tabId === tabId)?.url;
    if (url) this.rememberChoice({ url });
    chrome.runtime.sendMessage({ handler: "switchTabFromVomnibar", tabIdToSwitch: tabId });
    this.hide();
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

    this._updateGoogleModeState();
    // At once, against the results shown until the new ones come: typing what's shown keeps it.
    this.updateGhost();
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
    this.ghostTyped = this.box.querySelector("#vomnibar-ghost .typed");
    this.ghostRest = this.box.querySelector("#vomnibar-ghost .rest");
    this.input.addEventListener("input", this.onInput);
    this.input.addEventListener("keydown", this.onKeyEvent);
    this.input.addEventListener("keypress", this.onKeyEvent);
    // The completed address shows only with the caret at the end.
    this.input.addEventListener("keyup", () => this.updateGhost());
    this.input.addEventListener("mouseup", () => this.updateGhost());
    this.completionList = this.box.querySelector("ul");
    this.completionList.style.display = "";
    this.positionIndicator = document.getElementById("vomnibar-position-indicator");
    // Clicking a result opens it, as Enter would; ctrl/cmd/shift-click or a middle click opens it in
    // a new tab. One listener for the list, its rows and their buttons, since the rows are
    // re-rendered on every keystroke.
    this.completionList.addEventListener("click", (event) => {
      const switchButton = event.target.closest?.(".switch-tab-btn");
      if (switchButton) this.switchToTab(event, Number(switchButton.dataset.tabId));
      else this.onCompletionClick(event);
    });
    this.completionList.addEventListener("auxclick", (event) => {
      if (event.button !== 1) return;
      this.onCompletionClick({
        shiftKey: false,
        ctrlKey: true,
        altKey: false,
        metaKey: false,
        target: event.target,
      });
      event.preventDefault();
    });

    globalThis.addEventListener("focus", () => this.input.focus());
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

  // `event` carries the modifiers that decide where the result opens (see handleEnterKey).
  async onCompletionClick(event) {
    const item = event.target.closest?.("li[data-index]");
    if (!item || this.isHiding) return;
    const index = Number(item.dataset.index);
    // Theme items are numbered across pages, result items within the current page.
    this.globalSelection = this.isThemeMode ? index : this.currentPage * this.itemsPerPage + index;
    this.updatePageAndSelection();
    await this.handleEnterKey(event);
  }

  showAnimations() {
    // Reset hiding flag when showing
    this.isHiding = false;
    // Reset any existing animation classes first
    this.box.classList.remove("vomnibar-slide-out");
    if (effectsManager.isInstant()) {
      // Effects "Quick" and "Fast": appear at once, no forced reflow.
      this.box.classList.remove("vomnibar-slide-in");
      this.input.focus();
      return;
    }
    // Force reflow to restart animation
    void this.box.offsetWidth;
    this.box.classList.add("vomnibar-slide-in");
    // Focus input after animation starts
    this.input.focus();
  }

  hideAnimations() {
    if (effectsManager.isInstant()) {
      // Effects "Quick" and "Fast": hide at once, so what is being opened isn't held back 140ms.
      this.box.classList.remove("vomnibar-slide-in", "vomnibar-slide-out");
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      // Hide vomnibar with slide-out
      this.box.classList.remove("vomnibar-slide-in");
      this.box.classList.add("vomnibar-slide-out");

      // Resolve once, regardless of which fires first: animationend or the fallback.
      let resolved = false;
      const done = () => {
        if (resolved) return;
        resolved = true;
        this.box.removeEventListener("animationend", onEnd);
        resolve();
      };

      // Only the slide-out itself: animations of children (the Google badge) bubble up here too.
      const onEnd = (event) => {
        if (event.animationName === "vomnibarSlideOut") done();
      };
      this.box.addEventListener("animationend", onEnd);
      // Tight fallback (matches the 140ms slide-out duration + small buffer)
      setTimeout(done, 160);
    });
  }
}

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
      case "activate": {
        const options = Object.assign({}, event.data);
        delete options.name;
        activate(options);
        break;
      }
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
