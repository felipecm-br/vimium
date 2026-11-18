// This file contains the definition of the completers used for the Vomnibar's suggestion UI. A
// completer will take a query (whatever the user typed into the Vomnibar) and return a list of
// Suggestions, e.g. bookmarks, domains, URLs from history.
//
// The Vomnibar frontend script makes a "filterCompleter" request to the background page, which in
// turn calls filter() on each these completers.
//
// A completer is a class which has three functions:
//  - filter(query): "query" will be whatever the user typed into the Vomnibar.
//  - refresh(): (optional) refreshes the completer's data source (e.g. refetches the list of
//    bookmarks).
//  - cancel(): (optional) cancels any pending, cancelable action.

import * as bgUtils from "./../bg_utils.js";
import * as completionSearch from "./search_wrapper.js";
import * as userSearchEngines from "../user_search_engines.js";
import * as ranking from "./ranking.js";
import { allCommands } from "../all_commands.js";
import { Commands, RegistryEntry } from "../commands.js";
import { RegexpCache } from "./ranking.js";

// Set this to true to render relevancy when debugging the ranking scores.
const showRelevancy = false;

// TODO(philc): Consider moving out the "computeRelevancy" function.
export class Suggestion {
  queryTerms;
  description;
  url;
  // A shortened URL (URI-decoded, protocol removed) suitable for dispaly purposes.
  shortUrl;
  title = "";
  // A computed relevancy value.
  relevancy;
  relevancyFunction;
  relevancyData;
  // When true, then this suggestion is automatically pre-selected in the vomnibar. This only affects
  // the suggestion in slot 0 in the vomnibar.
  autoSelect = false;
  // When true, we highlight matched terms in the title and URL. Otherwise we don't.
  highlightTerms = true;

  // The text to insert into the vomnibar input when this suggestion is selected.
  insertText;
  // This controls whether this suggestion is a candidate for deduplication after simplifying
  // its URL.
  deDuplicate = true;
  // The tab represented by this suggestion. Populated by TabCompleter.
  tabId;
  // Whether this is a suggestion provided by a user's custom search engine.
  isCustomSearch;
  // Set by CommandCompleter.
  // { registryEntry: RegistryEntry, keys: Array[string] }
  command;
  // Whether this is meant to be the first suggestion from the user's custom search engine which
  // represents their query as typed, verbatim.
  isPrimarySuggestion = false;
  // The generated HTML string for showing this suggestion in the Vomnibar.
  html;
  searchUrl;
  // The full folder path for bookmarked tabs. Populated by OmniSearchCompleter.
  bookmarkPath;
  // For OmniSearchCompleter's "search the web" row: the query to hand to the browser's default
  // search engine.
  webSearchQuery;

  constructor(options) {
    Object.seal(this);
    Object.assign(this, options);
  }

  // Returns the relevancy score.
  computeRelevancy() {
    // We assume that, once the relevancy has been set, it won't change. Completers must set
    // either @relevancy or @relevancyFunction.
    if (this.relevancy == null) {
      this.relevancy = this.relevancyFunction(this);
    }
    return this.relevancy;
  }

  generateHtml() {
    if (this.html) return this.html;
    const relevancyHtml = showRelevancy
      ? `<span class='relevancy'>${this.computeRelevancy()}</span>`
      : "";
    if (this.insertText && this.isCustomSearch) {
      this.title = this.insertText;
    }

    // Source badge on the favicon (Material Symbols ligatures, from the bundled font subset). Only
    // for sources that change what Enter does or that the user chose to keep; history, domains and
    // top sites, the common case, get none, so the badges that do show stand out.
    const badgeIcons = { tab: "tab", bookmark: "star", search: "search" };
    const badgeIcon = badgeIcons[this.description] || (this.isCustomSearch ? "search" : null);
    const badgeHtml = badgeIcon
      ? `<span class="type-badge material-symbols-outlined">${badgeIcon}</span>`
      : "";
    // Generate favicon HTML (works for all types in Chrome, not just tabs)
    let faviconHtml = "";
    if (this.url && !bgUtils.isFirefox()) {
      const faviconUrl = new URL(chrome.runtime.getURL("/_favicon/"));
      faviconUrl.searchParams.set("pageUrl", this.url);
      faviconUrl.searchParams.set("size", "16");
      faviconHtml =
        `<img class="favicon" src="${faviconUrl.toString()}" alt="" loading="lazy" decoding="async" />`;
    }

    if (this.webSearchQuery != null) {
      this.html = `\
<span class="suggestion-icons" aria-hidden="true"><span class="type-icon material-symbols-outlined">search</span></span>
<div class="suggestion-content">
  <div class="top-half">
    <span class="title">${Utils.escapeHtml(this.webSearchQuery)}</span>
    <span class="url">Search the web</span>
  </div>
</div>`;
      return this.html;
    }

    if (this.command) {
      // Key mappings containing key modifiers are represented in the form of '<modifier-key>'
      // (e.g <c-e>) and are parsed as HTML tags when used in a raw string. Escape them properly.
      const escapeKeyForHtml = (key) => {
        return key.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      };
      const keybindings = this.command.keys.map((key) =>
        `<span class="key-block">
          <span class="key">${escapeKeyForHtml(key)}</span>
          <span class="comma">, </span>
        </span>`
      ).join("\n");
      this.html = `\
<span class="suggestion-icons" aria-hidden="true"><span class="type-icon material-symbols-outlined">terminal</span></span>
<div class="suggestion-content">
  <div class="top-half">
    <span class="title">${this.highlightQueryTerms(this.title)}</span>${keybindings}${relevancyHtml}
  </div>
</div>`;
      return this.html;
    }

    const iconsHtml =
      `<span class="suggestion-icons" aria-hidden="true">${faviconHtml}${badgeHtml}</span>`;
    const titleHtml = this.highlightQueryTerms(Utils.escapeHtml(this.title));

    // Add switch button for tabs
    const switchButtonHtml = this.description === "tab" && this.tabId != null
      ? `<button class="suggestion-icons switch-tab-btn" data-tab-id="${this.tabId}" aria-label="Switch to tab" title="Switch to tab"><span class="action-icon material-symbols-outlined" aria-hidden="true">tab_move</span></button>`
      : "";

    this.html = `\
${iconsHtml}
<div class="suggestion-content">
  <div class="top-half">
    <span class="title">${titleHtml}</span>
    <span class="url">${this.highlightQueryTerms(Utils.escapeHtml(this.shortenUrl()))}</span>
    ${relevancyHtml}
  </div>
</div>
${switchButtonHtml}`;
    return this.html;
  }

  // Use neat trick to snatch a domain (http://stackoverflow.com/a/8498668).
  getUrlRoot(url) {
    const a = document.createElement("a");
    a.href = url;
    return a.protocol + "//" + a.hostname;
  }

  getHostname(url) {
    const a = document.createElement("a");
    a.href = url;
    return a.hostname;
  }

  stripTrailingSlash(url) {
    if (url[url.length - 1] === "/") {
      url = url.substring(url, url.length - 1);
    }
    return url;
  }

  // Push the ranges within `string` which match `term` onto `ranges`.
  pushMatchingRanges(string, term, ranges) {
    let textPosition = 0;
    // Split `string` into a (flat) list of pairs:
    //   - for i=0,2,4,6,...
    //     - splits[i] is unmatched text
    //     - splits[i+1] is the following matched text (matching `term`)
    //       (except for the final element, for which there is no following matched text).
    // Example:
    //   - string = "Abacab"
    //   - term = "a"
    //   - splits = [ "", "A",    "b", "a",    "c", "a",    b" ]
    //                UM   M       UM   M       UM   M      UM      (M=Matched, UM=Unmatched)
    const splits = string.split(RegexpCache.get(term, "(", ")"));
    for (let index = 0, end = splits.length - 2; index <= end; index += 2) {
      const unmatchedText = splits[index];
      const matchedText = splits[index + 1];
      // Add the indices spanning `matchedText` to `ranges`.
      textPosition += unmatchedText.length;
      ranges.push([textPosition, textPosition + matchedText.length]);
      textPosition += matchedText.length;
    }
  }

  // Wraps each occurence of the query terms in the given string in a <span>.
  highlightQueryTerms(string) {
    if (!this.highlightTerms) return string;
    let ranges = [];
    const escapedTerms = this.queryTerms.map((term) => Utils.escapeHtml(term));
    for (const term of escapedTerms) {
      this.pushMatchingRanges(string, term, ranges);
    }

    if (ranges.length === 0) {
      return string;
    }

    ranges = this.mergeRanges(ranges.sort((a, b) => a[0] - b[0]));
    // Replace portions of the string from right to left.
    ranges = ranges.sort((a, b) => b[0] - a[0]);
    for (const [start, end] of ranges) {
      string = string.substring(0, start) +
        `<span class='match'>${string.substring(start, end)}</span>` +
        string.substring(end);
    }
    return string;
  }

  // Merges the given list of ranges such that any overlapping regions are combined. E.g.
  //   mergeRanges([0, 4], [3, 6]) => [0, 6]. A range is [startIndex, endIndex].
  mergeRanges(ranges) {
    let previous = ranges.shift();
    const mergedRanges = [previous];
    for (const range of ranges) {
      if (previous[1] >= range[0]) {
        previous[1] = Math.max(range[1], previous[1]);
      } else {
        mergedRanges.push(range);
        previous = range;
      }
    }
    return mergedRanges;
  }

  // Simplify a suggestion's URL (by removing those parts which aren't useful for display or
  // comparison).
  shortenUrl() {
    if (this.shortUrl != null) {
      return this.shortUrl;
    }
    // We get easier-to-read shortened URLs if we URI-decode them.
    let url = (Utils.decodeURIByParts(this.url) || this.url).toLowerCase();
    for (const [filter, replacements] of Suggestion.stripPatterns) {
      if (new RegExp(filter).test(url)) {
        for (const replace of replacements) {
          url = url.replace(replace, "");
        }
      }
    }

    this.shortUrl = url;
    return this.shortUrl;
  }

  // Boost a relevancy score by a factor (in the range (0,1.0)), while keeping the score in the
  // range [0,1]. This makes greater adjustments to scores near the middle of the range (so, very
  // poor relevancy scores remain very poor).
  static boostRelevancyScore(factor, score) {
    return score + (score < 0.5 ? score * factor : (1.0 - score) * factor);
  }
}

// Patterns to strip from URLs; of the form [ [ filter, replacements ], [ filter, replacements ], ... ]
//   - filter is a regexp string; a URL must match this regexp first.
//   - replacements (itself a list) is a list of regexp objects, each of which is removed from URLs
//     matching the filter.
//
// Note. This includes site-specific patterns for very-popular sites with URLs which don't work well
// in the vomnibar.
//
Suggestion.stripPatterns = [
  // Google search specific replacements; this replaces query parameters which are known to not be
  // helpful. There's some additional information here:
  // http://www.teknoids.net/content/google-search-parameters-2012
  [
    "^https?://www\\.google\\.(com|ca|com\\.au|co\\.uk|ie)/.*[&?]q=",
    "ei gws_rd url ved usg sa usg sig2 bih biw cd aqs ie sourceid es_sm"
      .split(/\s+/).map((param) => new RegExp(`\&${param}=[^&]+`)),
  ],

  // On Google maps, we get a new history entry for every pan and zoom event.
  ["^https?://www\\.google\\.(com|ca|com\\.au|co\\.uk|ie)/maps/place/.*/@", [new RegExp("/@.*")]],

  // General replacements; replaces leading and trailing fluff.
  [".", ["^https?://", "\\W+$"].map((re) => new RegExp(re))],
];

const folderSeparator = "/";

// If these names occur as top-level bookmark names, then they are not included in the names of
// bookmark folders.
const ignoredTopLevelBookmarks = {
  "Other Bookmarks": true,
  "Mobile Bookmarks": true,
  "Bookmarks Bar": true,
};

// this.bookmarks are loaded asynchronously when refresh() is called.
export class BookmarkCompleter {
  async filter({ queryTerms }) {
    if (!this.bookmarks) await this.refresh();

    // If the folder separator character is the first character in any query term, then use the
    // bookmark's full path as its title. Otherwise, just use the its regular title.
    let results;
    const usePathAndTitle = queryTerms.reduce(
      (prev, term) => prev || term.startsWith(folderSeparator),
      false,
    );
    if (queryTerms.length > 0) {
      results = this.bookmarks.filter((bookmark) => {
        const suggestionTitle = usePathAndTitle ? bookmark.pathAndTitle : bookmark.title;
        if (bookmark.hasJavascriptProtocol == null) {
          bookmark.hasJavascriptProtocol = UrlUtils.hasJavascriptProtocol(bookmark.url);
        }
        if (bookmark.hasJavascriptProtocol && bookmark.shortUrl == null) {
          bookmark.shortUrl = "javascript:...";
        }
        const suggestionUrl = bookmark.shortUrl != null ? bookmark.shortUrl : bookmark.url;
        return ranking.matches(queryTerms, suggestionUrl, suggestionTitle);
      });
    } else {
      results = [];
    }
    const suggestions = results.map((bookmark) => {
      return new Suggestion({
        queryTerms,
        description: "bookmark",
        url: bookmark.url,
        title: usePathAndTitle ? bookmark.pathAndTitle : bookmark.title,
        relevancyFunction: this.computeRelevancy,
        shortUrl: bookmark.shortUrl,
        deDuplicate: bookmark.shortUrl == null,
      });
    });
    return suggestions;
  }

  async refresh() {
    // In case refresh() is called multiple times before chrome.bookmarks.getTree() completes, only
    // call chrome.bookmarks.getTree() once.
    if (this.bookmarksTreePromise) {
      await this.bookmarksTreePromise;
      return;
    }

    this.bookmarksTreePromise = chrome.bookmarks.getTree();
    const bookmarksTree = await this.bookmarksTreePromise;
    this.bookmarks = this.traverseBookmarks(bookmarksTree)
      .filter((b) => b.url != null);
    this.bookmarksTreePromise = null;
  }

  // Traverses the bookmark hierarchy, and returns a flattened list of all bookmarks.
  traverseBookmarks(bookmarks) {
    const results = [];
    for (const folder of bookmarks) {
      this.traverseBookmarksRecursive(folder, results);
    }
    return results;
  }

  // Recursive helper for `traverseBookmarks`.
  traverseBookmarksRecursive(bookmark, results, parent) {
    if (parent == null) {
      parent = { pathAndTitle: "" };
    }
    if (
      bookmark.title &&
      !((parent.pathAndTitle === "") && ignoredTopLevelBookmarks[bookmark.title])
    ) {
      bookmark.pathAndTitle = parent.pathAndTitle + folderSeparator + bookmark.title;
    } else {
      bookmark.pathAndTitle = parent.pathAndTitle;
    }
    results.push(bookmark);
    if (bookmark.children) {
      for (const child of bookmark.children) {
        this.traverseBookmarksRecursive(child, results, bookmark);
      }
    }
  }

  computeRelevancy(suggestion) {
    return ranking.wordRelevancy(
      suggestion.queryTerms,
      suggestion.shortUrl || suggestion.url,
      suggestion.title,
    );
  }
}

export class CommandCompleter {
  async filter({ queryTerms }) {
    // Get the key mapping for a command.
    // Each entry contains the user-specified options and an array of possible mappings.
    // Example:
    // "closeTabsOnRight" : {
    //    "count=2": ["c2l", "c2k"],
    //    "count=3": ["c3l", "c3k"],
    // }
    const commandToOptionsToKeys =
      (await chrome.storage.session.get("commandToOptionsToKeys")).commandToOptionsToKeys;

    // Create a RegistryEntry for the default action (no options specified) of a command.
    const createUnboundRegistryEntry = (command) => {
      return new RegistryEntry({
        keySequence: [],
        command: command.name,
        noRepeat: command.noRepeat,
        repeatLimit: command.repeatLimit,
        background: command.background,
        topFrame: command.topFrame,
        options: {},
      });
    };

    const matchingCommands = allCommands.filter((c) => ranking.matches(queryTerms, c.desc));

    const suggestions = [];
    for (const commandInfo of matchingCommands) {
      const variations = commandToOptionsToKeys[commandInfo.name] || {};

      // Whether the default action of the command (no additional options) is bound to a key.
      const isDefaultBound = Object.keys(variations).some((option) => option.length === 0);

      // If the default action is not bound, add the entry explicitly to the suggestions.
      // This makes unbound commands accessible from the Vomnibar.
      if (!isDefaultBound) {
        suggestions.push(
          new Suggestion({
            queryTerms,
            description: "command",
            title: commandInfo.desc,
            deDuplicate: false,
            command: {
              registryEntry: createUnboundRegistryEntry(commandInfo),
              keys: [],
            },
            relevancy: 1,
          }),
        );
      }

      // Add all bound/mapped command variations to the suggestions.
      for (const [options, keys] of Object.entries(variations)) {
        suggestions.push(
          new Suggestion({
            queryTerms,
            description: "command",
            title: commandInfo.desc + (options ? ` (${options})` : ""),
            deDuplicate: false,
            command: {
              registryEntry: Commands.keyToRegistryEntry[keys[0]],
              keys: keys,
            },
            relevancy: 1,
          }),
        );
      }
    }
    return suggestions;
  }
}

export class HistoryCompleter {
  // - seenTabToOpenCompletionList: true if the user has typed only <Tab>, and nothing else.
  //   We interpret this to mean that they want to see all of their history in the Vomnibar, sorted
  //   by recency.
  async filter({ queryTerms, seenTabToOpenCompletionList }) {
    await HistoryCache.onLoaded();

    let results;
    if (queryTerms.length > 0) {
      results = HistoryCache.history
        .filter((entry) => ranking.matches(queryTerms, entry.url, entry.title));
    } else if (seenTabToOpenCompletionList) {
      // The user has typed <Tab> to open the entire history (sorted by recency).
      results = HistoryCache.history;
    } else {
      results = [];
    }

    const suggestions = results.map((entry) => {
      return new Suggestion({
        queryTerms,
        description: "history",
        url: entry.url,
        title: entry.title,
        relevancyFunction: this.computeRelevancy,
        relevancyData: entry,
      });
    });
    return suggestions;
  }

  computeRelevancy(suggestion) {
    const historyEntry = suggestion.relevancyData;
    const recencyScore = ranking.recencyScore(historyEntry.lastVisitTime);
    // If there are no query terms, then relevancy is based on recency alone.
    if (suggestion.queryTerms.length === 0) return recencyScore;
    const wordRelevancy = ranking.wordRelevancy(
      suggestion.queryTerms,
      suggestion.url,
      suggestion.title,
    );
    // Average out the word score and the recency. Recency has the ability to pull the score up, but
    // not down.
    return (wordRelevancy + Math.max(recencyScore, wordRelevancy)) / 2;
  }
}

// The domain completer is designed to match a single-word query which looks like it is a domain.
// This supports the user experience where they quickly type a partial domain, hit tab -> enter, and
// expect to arrive there.
export class DomainCompleter {
  // A map of domain -> { entry: <historyEntry>, referenceCount: <count> }
  // - `entry` is the most recently accessed page in the History within this domain.
  // - `referenceCount` is a count of the number of History entries within this domain.
  //    If `referenceCount` goes to zero, the domain entry can and should be deleted.
  domains;

  async filter({ queryTerms, query }) {
    const isMultiWordQuery = /\S\s/.test(query);
    if ((queryTerms.length === 0) || isMultiWordQuery) return [];
    if (!this.domains) await this.populateDomains();

    const firstTerm = queryTerms[0];
    const domains = Object.keys(this.domains || []).filter((d) => d.includes(firstTerm));
    const domainsAndScores = this.sortDomainsByRelevancy(queryTerms, domains);
    const result = new Suggestion({
      queryTerms,
      description: "domain",
      // This should be the URL or the domain, or an empty string, but not null.
      url: domainsAndScores[0]?.[0] || "",
      relevancy: 2.0,
    });
    return result.url.length > 0 ? [result] : [];
  }

  // Returns a list of domains of the form: [ [domain, relevancy], ... ]
  sortDomainsByRelevancy(queryTerms, domainCandidates) {
    const results = [];
    for (const domain of domainCandidates) {
      const recencyScore = ranking.recencyScore(this.domains[domain].entry.lastVisitTime || 0);
      const wordRelevancy = ranking.wordRelevancy(queryTerms, domain, null);
      const score = (wordRelevancy + Math.max(recencyScore, wordRelevancy)) / 2;
      results.push([domain, score]);
    }
    results.sort((a, b) => b[1] - a[1]);
    return results;
  }

  async populateDomains() {
    await HistoryCache.onLoaded();
    this.domains = {};
    for (const entry of HistoryCache.history) {
      this.onVisited(entry);
    }
    chrome.history.onVisited.addListener(this.onVisited.bind(this));
    chrome.history.onVisitRemoved.addListener(this.onVisitRemoved.bind(this));
  }

  onVisited(newPage) {
    const domain = this.parseDomainAndScheme(newPage.url);
    if (domain) {
      const slot = this.domains[domain] ||
        (this.domains[domain] = { entry: newPage, referenceCount: 0 });
      // We want each entry in our domains map to point to the most recent History entry for that
      // domain.
      if (slot.entry.lastVisitTime < newPage.lastVisitTime) {
        slot.entry = newPage;
      }
      slot.referenceCount += 1;
    }
  }

  onVisitRemoved(toRemove) {
    if (toRemove.allHistory) {
      this.domains = {};
    } else {
      for (const url of toRemove.urls) {
        const domain = this.parseDomainAndScheme(url);
        const entry = this.domains[domain];
        if (entry == null) continue;
        entry.referenceCount--;
        if (entry.referenceCount <= 0) {
          delete this.domains[domain];
        }
      }
    }
  }

  // Return something like "http://www.example.com" or false.
  parseDomainAndScheme(url) {
    if (UrlUtils.urlHasProtocol(url) && !UrlUtils.hasChromeProtocol(url)) {
      return url.split("/", 3).join("/");
    }
  }
}

// Searches through all open tabs, matching on title and URL.
// If the query is empty, then return a list of open tabs, sorted by recency.
export class TabCompleter {
  async filter({ queryTerms }) {
    await bgUtils.tabRecency.init();
    // We search all tabs, not just those in the current window.
    const tabs = await chrome.tabs.query({});
    const results = tabs.filter((tab) => ranking.matches(queryTerms, tab.url, tab.title));
    const suggestions = results
      .map((tab) => {
        const suggestion = new Suggestion({
          queryTerms,
          description: "tab",
          url: tab.url,
          title: tab.title,
          tabId: tab.id,
          deDuplicate: false,
        });
        suggestion.relevancy = this.computeRelevancy(suggestion);
        return suggestion;
      })
      .sort((a, b) => b.relevancy - a.relevancy);
    // Boost relevancy with a multiplier so a relevant tab doesn't get crowded out by results from
    // competing completers. To prevent tabs from crowding out everything else in turn, penalize
    // them for being further down the results list by scaling on a hyperbola starting at 1 and
    // approaching 0 asymptotically for higher indexes. The multiplier and the curve fall-off were
    // subjectively chosen on the grounds that they seem to work pretty well.
    suggestions.forEach(function (suggestion, i) {
      suggestion.relevancy *= 8;
      suggestion.relevancy /= (i / 4) + 1;
    });
    return suggestions;
  }

  computeRelevancy(suggestion) {
    if (suggestion.queryTerms.length > 0) {
      return ranking.wordRelevancy(suggestion.queryTerms, suggestion.url, suggestion.title);
    } else {
      return bgUtils.tabRecency.recencyScore(suggestion.tabId);
    }
  }
}

export class SearchEngineCompleter {
  cancel() {
    completionSearch.cancel();
  }

  // Returns the UserSearchEngine for the given query. Returns null if the query does not begin with
  // a keyword from one of the user's search engines.
  getUserSearchEngineForQuery(query) {
    const parts = query.trimStart().split(/\s+/);
    // For a keyword "w", we match "w search terms" and "w ", but not "w" on its own.
    const keyword = parts[0];
    if (parts.length <= 1) return null;
    // Don't match queries for built-in properties like "constructor". See #4396.
    if (Object.hasOwn(userSearchEngines.keywordToEngine, keyword)) {
      return userSearchEngines.keywordToEngine[keyword];
    }
    return null;
  }

  refresh() {
    userSearchEngines.set(Settings.get("searchEngines"));
  }

  async filter(request) {
    const { queryTerms } = request;

    const keyword = queryTerms[0];
    const queryTermsWithoutKeyword = queryTerms.slice(1);

    const userSearchEngine = userSearchEngines.keywordToEngine[keyword];
    if (!userSearchEngine) return [];

    const searchUrl = userSearchEngine.url;

    const completions = await completionSearch.complete(searchUrl, queryTermsWithoutKeyword);

    const makeSuggestion = (query) => {
      const url = UrlUtils.createSearchUrl(query, searchUrl);
      return new Suggestion({
        queryTerms,
        description: userSearchEngine.description,
        url,
        title: query,
        searchUrl,
        highlightTerms: false,
        isCustomSearch: true,
        relevancy: null,
        relevancyFunction: this.computeRelevancy,
      });
    };

    const suggestions = completions.map((completion) => {
      const s = makeSuggestion(completion);
      s.insertText = completion;
      return s;
    });

    if (suggestions[0]) suggestions[0].relevancy = 1.0;

    // This is a suggestion which contains the user's query. It's the "search for exactly what I
    // just typed" option. It should always appear first in the list.
    const primarySuggestion = makeSuggestion(queryTermsWithoutKeyword.join(" "));
    primarySuggestion.relevancy = 2;
    primarySuggestion.isPrimarySuggestion = true;
    primarySuggestion.autoSelect = true;
    suggestions.unshift(primarySuggestion);

    return suggestions;
  }

  computeRelevancy({ queryTerms, title }) {
    // Tweaks:
    // - Calibration: we boost relevancy scores to try to achieve an appropriate balance between
    //   relevancy scores here, and those provided by other completers.
    // - Relevancy depends only on the title (which is the search terms), and not on the URL.
    return Suggestion.boostRelevancyScore(
      0.5,
      0.7 * ranking.wordRelevancy(queryTerms, title, title),
    );
  }
}

SearchEngineCompleter.debug = false;

// A completer which calls filter() on many completers, aggregates the results, ranks them, and
// returns the top 10. All queries from the vomnibar come through a multi completer.
const maxResults = 10;

export class MultiCompleter {
  constructor(completers) {
    this.completers = completers;
  }

  refresh() {
    for (const c of this.completers) {
      if (c.refresh) c.refresh();
    }
  }

  cancel() {
    for (const c of this.completers) {
      c.cancel?.();
    }
  }

  async filter(request) {
    const searchEngineCompleter = this.completers.find((c) => c instanceof SearchEngineCompleter);
    const query = request.query;
    const queryTerms = request.queryTerms;

    // The only UX where we support showing results when there are no query terms is via
    // Vomnibar.activateTabSelection, where we show the list of open tabs by recency.
    const isTabCompleter = this.completers.length == 1 &&
      this.completers[0] instanceof TabCompleter;
    if (queryTerms.length == 0 && !isTabCompleter) {
      return [];
    }

    const queryMatchesUserSearchEngine = searchEngineCompleter?.getUserSearchEngineForQuery(query);

    // If the user's query matches one of their custom search engines, then use only that engine to
    // provide completions for their query.
    const completers = queryMatchesUserSearchEngine
      ? [searchEngineCompleter]
      : this.completers.filter((c) => c != searchEngineCompleter);

    RegexpCache.clear();

    const promises = completers.map((c) => c.filter(request));
    let results = (await Promise.all(promises)).flat(1);
    results = this.postProcessSuggestions(request, queryTerms, results);
    return results;
  }

  // Rank them, simplify the URLs, and de-duplicate suggestions with the same simplified URL.
  postProcessSuggestions(request, queryTerms, suggestions) {
    for (const s of suggestions) {
      s.computeRelevancy(queryTerms);
    }
    suggestions.sort((a, b) => b.relevancy - a.relevancy);

    const seenUrls = new Set();
    const dedupedSuggestions = [];
    for (const s of suggestions) {
      if (dedupedSuggestions.length === maxResults) break;
      if (s.deDuplicate) {
        const url = s.shortenUrl();
        if (seenUrls.has(url)) continue;
        seenUrls.add(url);
      }
      dedupedSuggestions.push(s);
    }

    // Give each completer the opportunity to tweak the suggestions.
    for (const completer of this.completers) {
      if (completer.postProcessSuggestions) {
        completer.postProcessSuggestions(request, dedupedSuggestions);
      }
    }

    // Generate HTML for the remaining suggestions and return them.
    for (const s of dedupedSuggestions) {
      s.generateHtml(request);
    }

    return dedupedSuggestions;
  }
}

// OmniSearch completer: provides unified search across tabs, bookmarks, and history with grouped
// results. Unlike MultiCompleter which mixes results by relevancy, this completer returns results
// organized by source category (tabs, bookmarks, history) with tabs ordered by Most Recently Used.
// This is inspired by the OmniSearch feature from Surfing Keys.
const omniSearchMaxResultsPerCategory = 4;
const omniSearchMaxResults = 10;

// The `k` highest-scoring items for which `score` returns a number (null skips the item), best
// first, in one pass and without sorting everything: the OmniSearch shows 4 results per category
// out of up to 20,000 history entries. Equal scores keep their input order, as the stable
// Array.prototype.sort this replaces did.
// Whether every entry matching `queryTerms` must also match `previousTerms`, so the previous matches
// can be filtered instead of everything. True when each previous term is a plain substring of the
// term at the same position (more terms only narrow further). Smartcase stays sound: a lowercase
// previous term matches case-insensitively, and a previous term with a capital is contained
// verbatim in the new term, which then has that capital too and is case-sensitive as well.
export function queryExtends(queryTerms, previousTerms) {
  if (previousTerms.length > queryTerms.length) return false;
  return previousTerms.every((term, i) => queryTerms[i].includes(term));
}

export function topK(items, k, score) {
  const best = new TopK(k);
  for (const item of items) {
    const s = score(item);
    if (s != null) best.add(item, s);
  }
  return best.items;
}

// Accumulates the k highest-scoring items; see topK.
export class TopK {
  constructor(k) {
    this.k = k;
    this.items = []; // [{ item, score }], highest score first.
  }

  // Whether an item with this score would be kept; lets callers skip computing what it needs.
  admits(score) {
    return this.items.length < this.k || score > this.items[this.k - 1].score;
  }

  add(item, score) {
    if (!this.admits(score)) return;
    const best = this.items;
    let i = best.length;
    while (i > 0 && best[i - 1].score < score) i--;
    best.splice(i, 0, { item, score });
    if (best.length > this.k) best.pop();
  }
}

// Words that open a question (English and Portuguese). A query starting with one is a question for
// the web, not the name of a page.
const QUESTION_WORDS = new Set([
  "how",
  "what",
  "why",
  "when",
  "where",
  "who",
  "which",
  "como",
  "qual",
  "quais",
  "quando",
  "onde",
  "quem",
  "porque",
  "por",
]);

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The part of a hostname that names the site: no "www." and no top-level domain, so ".com" or ".org"
// never count as words the user typed ("c" must not match www.google.com).
const siteName = (hostname) => hostname.replace(/^www\./, "").replace(/\.[^.]+$/, "");

const hostnameOf = (url) => {
  try {
    return new URL(url).hostname;
  } catch {
    return ""; // Not a URL (e.g. a bookmarklet).
  }
};

// Whether every query term starts a word in the suggestion's title or site name: "rust" in "The Rust
// Book" or "rust-lang.org", but not in "trustpilot.com". A suggestion matched only inside words is
// a weak match, likely not the page the user means.
export function isStrongMatch(queryTerms, suggestion) {
  const text = `${suggestion.title ?? ""} ${siteName(hostnameOf(suggestion.url))}`;
  return queryTerms.every((term) =>
    new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(term)}`, "iu").test(text)
  );
}

const SEARCH_ENGINE_HOST =
  /(^|\.)(google|bing|duckduckgo|yahoo|yandex|baidu|kagi|ecosia|search\.brave|startpage)\./;
const SEARCH_QUERY_PARAM = /[?&#](q|query|p|text|search_query)=/;

// Whether `url` is a page of search results. Such a page matches the words of an earlier search,
// but someone typing similar words wants a new search, not that old page.
export function isSearchResultsPage(url) {
  return SEARCH_QUERY_PARAM.test(url) &&
    (SEARCH_ENGINE_HOST.test(hostnameOf(url)) || /\/(search|results)\b/.test(url));
}

// Sources the user deliberately keeps around: a strong match there is likely the page they mean.
// History is not one of them: with thousands of visited pages, nearly any word starts some title.
const NAVIGATIONAL_SOURCES = new Set(["tab", "bookmark", "topSite"]);

// Whether `suggestion` is likely where the user wants to go, the way Chrome's omnibox decides
// between navigating and searching: a strong match in an open tab, bookmark or top site, or a
// single term that starts the hostname (typing "git" for github.com), from any source.
export function isNavigationalMatch(queryTerms, suggestion) {
  if (isSearchResultsPage(suggestion.url ?? "")) return false;
  if (queryTerms.length === 1) {
    const host = hostnameOf(suggestion.url).replace(/^www\./, "");
    if (host && host.startsWith(queryTerms[0].toLowerCase())) return true;
  }
  return NAVIGATIONAL_SOURCES.has(suggestion.description) && isStrongMatch(queryTerms, suggestion);
}

// Whether the user more likely wants to search the web than open one of `suggestions`: the query
// reads as a question, or no suggestion is a navigational match. A query that looks like a URL
// never is.
export function looksLikeWebSearch(queryTerms, suggestions) {
  if (queryTerms.length === 0) return false;
  if (queryTerms.length === 1 && /[.:/]/.test(queryTerms[0])) return false;
  if (suggestions.length === 0) return true;
  if (queryTerms.at(-1).endsWith("?") || QUESTION_WORDS.has(queryTerms[0].toLowerCase())) {
    return true;
  }
  return !suggestions.some((suggestion) => isNavigationalMatch(queryTerms, suggestion));
}

// Puts the "search the web" row first when that is the likely intent (so it is what Enter opens), and
// last otherwise (one Up from the first result reaches it, since the selection wraps).
export function placeWebSearch(queryTerms, suggestions, webSearch) {
  return looksLikeWebSearch(queryTerms, suggestions)
    ? [webSearch, ...suggestions]
    : [...suggestions, webSearch];
}

export class OmniSearchCompleter {
  constructor() {
    this.bookmarksCache = null;
    this.bookmarksMap = null;
  }

  refresh() {
    this.bookmarksCache = null;
    this.bookmarksMap = null;
  }

  cancel() {
    // No async operations to cancel
  }

  // Load and cache bookmarks with full folder paths
  async loadBookmarks() {
    if (this.bookmarksCache) return;

    const tree = await chrome.bookmarks.getTree();
    const { bookmarksList, bookmarksMap } = this.traverseBookmarksWithPath(tree);
    this.bookmarksCache = bookmarksList;
    this.bookmarksMap = bookmarksMap;
  }

  // Recursively traverse bookmark tree and build full folder paths
  // The list and map are shared by the whole traversal (rather than merged per folder, which copied
  // them at every level and made large bookmark trees quadratic).
  traverseBookmarksWithPath(tree, parentPath = "", bookmarksList = [], bookmarksMap = new Map()) {
    for (const node of tree) {
      const isFolder = !node.url && node.children;

      if (isFolder) {
        // Build folder path, skipping ignored top-level folders
        const folderTitle = (parentPath === "" && ignoredTopLevelBookmarks[node.title])
          ? ""
          : (parentPath ? `${parentPath}/${node.title}` : node.title);

        this.traverseBookmarksWithPath(node.children, folderTitle, bookmarksList, bookmarksMap);
      } else if (node.url) {
        const bookmark = {
          ...node,
          fullPathTitle: parentPath ? `${parentPath}/${node.title}` : node.title,
        };
        bookmarksList.push(bookmark);
        bookmarksMap.set(node.url, bookmark);
      }
    }

    return { bookmarksList, bookmarksMap };
  }

  // Get tabs ordered by Most Recently Used, with bookmark annotation
  getTabsWithMRU(tabs, queryTerms, bookmarksMap) {
    // Sort by recency (most recent first)
    const sortedTabs = tabs.sort((a, b) => {
      const recencyA = bgUtils.tabRecency.recencyScore(a.id);
      const recencyB = bgUtils.tabRecency.recencyScore(b.id);
      return recencyB - recencyA;
    });

    // Filter tabs and annotate with bookmark info (like omniSearchHandler)
    const filteredTabs = sortedTabs.filter((tab) => {
      // Skip the current active tab - no need to show it as a suggestion
      if (tab.active) return false;

      // Attach bookmark info to tab if URL matches
      if (bookmarksMap.has(tab.url)) {
        tab.bookmark = bookmarksMap.get(tab.url);
        bookmarksMap.delete(tab.url); // Remove to avoid duplicates in bookmark results
      }

      if (queryTerms.length === 0) {
        return true;
      }

      // Check against title, URL, and bookmark path if available
      const bookmarkPath = tab.bookmark?.fullPathTitle || "";
      return ranking.matches(queryTerms, tab.url, tab.title, bookmarkPath);
    });

    return filteredTabs.map((tab, index) => {
      return new Suggestion({
        queryTerms,
        description: "tab",
        url: tab.url,
        title: tab.title,
        tabId: tab.id,
        deDuplicate: false,
        relevancy: 1.0 - (index * 0.1), // MRU ordering preserved via relevancy
        bookmarkPath: tab.bookmark?.fullPathTitle, // Include bookmark path if available
      });
    });
  }

  // Get top sites
  getTopSites(topSites, queryTerms, excludeUrls = new Set()) {
    const filteredSites = topSites.filter((site) => {
      if (excludeUrls.has(site.url)) return false;
      if (queryTerms.length === 0) return true;
      return ranking.matches(queryTerms, site.url, site.title);
    });

    return filteredSites.slice(0, omniSearchMaxResultsPerCategory).map((site) => {
      return new Suggestion({
        queryTerms,
        description: "topSite",
        url: site.url,
        title: site.title,
        deDuplicate: false,
        relevancyFunction: (s) =>
          queryTerms.length > 0 ? ranking.wordRelevancy(s.queryTerms, s.url, s.title) : 0.5,
      });
    });
  }

  // Get bookmarks with fuzzy matching on full path
  getBookmarksWithPath(queryTerms, excludeUrls = new Set()) {
    if (queryTerms.length === 0) {
      // Return recent bookmarks when no query
      return this.bookmarksCache
        .filter((b) => !excludeUrls.has(b.url))
        .slice(0, omniSearchMaxResultsPerCategory)
        .map((bookmark) => this.createBookmarkSuggestion(bookmark, queryTerms));
    }

    // Match the query terms against title, URL and full path; rank by relevancy of the full path.
    const scored = topK(this.bookmarksCache, omniSearchMaxResultsPerCategory, (bookmark) => {
      if (excludeUrls.has(bookmark.url)) return null;
      if (!ranking.matches(queryTerms, bookmark.url, bookmark.title, bookmark.fullPathTitle)) {
        return null;
      }
      return ranking.wordRelevancy(queryTerms, bookmark.url, bookmark.fullPathTitle);
    });

    return scored
      .map(({ item: bookmark, score }) => {
        const suggestion = this.createBookmarkSuggestion(bookmark, queryTerms);
        suggestion.relevancy = score;
        return suggestion;
      });
  }

  createBookmarkSuggestion(bookmark, queryTerms) {
    return new Suggestion({
      queryTerms,
      description: "bookmark",
      url: bookmark.url,
      title: bookmark.fullPathTitle, // Show full path as title
      relevancyFunction: (s) => ranking.wordRelevancy(s.queryTerms, s.url, s.title),
    });
  }

  // Whether a cache built from HistoryCache.history is still current.
  isHistoryCacheCurrent(cache) {
    return cache != null && cache.history === HistoryCache.history &&
      cache.version === HistoryCache.version;
  }

  // History sorted by most recent visit (stable, so ties keep history order), rebuilt only when the
  // history changes rather than on every keystroke.
  historyByRecency() {
    if (!this.isHistoryCacheCurrent(this.recencyIndex)) {
      const sorted = HistoryCache.history.slice();
      sorted.sort((a, b) => (b.lastVisitTime || 0) - (a.lastVisitTime || 0));
      this.recencyIndex = {
        history: HistoryCache.history,
        version: HistoryCache.version,
        sorted,
      };
    }
    return this.recencyIndex.sorted;
  }

  // The k most relevant history entries matching every query term, in one pass. The matches (in
  // history order) are kept for the next keystroke: while typing, each query usually extends the
  // previous one ("g", "gi", "git"), and then only the previous matches can match, so they are the
  // only candidates scanned instead of the whole history.
  topMatchingHistory(queryTerms, excludeUrls, k) {
    const previous = this.lastHistoryMatch;
    const candidates = this.isHistoryCacheCurrent(previous) &&
        queryExtends(queryTerms, previous.queryTerms)
      ? previous.entries
      : HistoryCache.history;
    const entries = [];
    const best = new TopK(k);
    for (const entry of candidates) {
      if (!ranking.matches(queryTerms, entry.url, entry.title)) continue;
      entries.push(entry);
      if (excludeUrls.has(entry.url)) continue;
      best.add(entry, ranking.wordRelevancy(queryTerms, entry.url, entry.title));
    }
    this.lastHistoryMatch = {
      history: HistoryCache.history,
      version: HistoryCache.version,
      queryTerms: queryTerms.slice(),
      entries,
    };
    return best.items;
  }

  // Get history entries
  getHistory(queryTerms, excludeUrls = new Set()) {
    const k = omniSearchMaxResultsPerCategory;
    let results;
    if (queryTerms.length > 0) {
      // Most relevant matches.
      results = this.topMatchingHistory(queryTerms, excludeUrls, k);
    } else {
      // No query: the most recently visited entries that aren't shown elsewhere.
      results = [];
      for (const entry of this.historyByRecency()) {
        if (excludeUrls.has(entry.url)) continue;
        results.push({ item: entry });
        if (results.length === k) break;
      }
    }

    return results.map(({ item: entry }) => {
      const suggestion = new Suggestion({
        queryTerms,
        description: "history",
        url: entry.url,
        title: entry.title,
        relevancyFunction: (s) => ranking.wordRelevancy(s.queryTerms, s.url, s.title),
      });
      if (queryTerms.length === 0) {
        suggestion.relevancy = ranking.recencyScore(entry.lastVisitTime);
      }
      return suggestion;
    });
  }

  async filter(request) {
    const { queryTerms } = request;
    RegexpCache.clear();

    // Load all dependencies in parallel (like omniSearchHandler)
    const [tabs, topSites] = await Promise.all([
      (async () => {
        await bgUtils.tabRecency.init();
        return chrome.tabs.query({});
      })(),
      chrome.topSites?.get() || Promise.resolve([]),
      HistoryCache.onLoaded(),
      this.loadBookmarks(),
    ]);

    // Create a copy of bookmarksMap for this request (will be modified during tab annotation)
    const bookmarksMap = new Map(this.bookmarksMap);

    // Get tabs with MRU ordering and bookmark annotation
    const tabSuggestions = this.getTabsWithMRU(tabs, queryTerms, bookmarksMap);

    // Get remaining bookmarks (not already open as tabs)
    const remainingBookmarks = [...bookmarksMap.values()];

    // Track URLs that are already shown as tabs
    const tabUrls = new Set(tabSuggestions.map((s) => s.url));

    // Get top sites (excluding URLs already shown as tabs)
    const topSiteSuggestions = this.getTopSites(topSites, queryTerms, tabUrls);

    // Track all URLs shown so far
    const allShownUrls = new Set([
      ...tabUrls,
      ...topSiteSuggestions.map((s) => s.url),
    ]);

    // Update bookmarks cache to use remaining bookmarks
    const originalCache = this.bookmarksCache;
    this.bookmarksCache = remainingBookmarks;

    // Get bookmarks (excluding URLs already shown)
    const bookmarkSuggestions = this.getBookmarksWithPath(queryTerms, allShownUrls);

    // Restore original cache
    this.bookmarksCache = originalCache;

    // Track all URLs including bookmarks
    const bookmarkUrls = new Set(bookmarkSuggestions.map((s) => s.url));
    const shownUrls = new Set([...allShownUrls, ...bookmarkUrls]);

    // Get history (excluding URLs already shown)
    const historySuggestions = this.getHistory(queryTerms, shownUrls);

    // A "search the web" row for any typed query, first when the results look like a miss.
    const query = (request.query ?? queryTerms.join(" ")).trim();
    let allSuggestions = [
      ...tabSuggestions,
      ...topSiteSuggestions,
      ...bookmarkSuggestions,
      ...historySuggestions,
    ].slice(0, query ? omniSearchMaxResults - 1 : omniSearchMaxResults);
    if (query) {
      const webSearch = new Suggestion({
        queryTerms,
        description: "search",
        url: "",
        title: query,
        webSearchQuery: query,
        relevancy: 1,
        deDuplicate: false,
      });
      allSuggestions = placeWebSearch(queryTerms, allSuggestions, webSearch);
    }

    for (const s of allSuggestions) {
      s.computeRelevancy();
      s.generateHtml();
    }

    return allSuggestions;
  }
}

// Provides cached access to Chrome's history. As the user browses to new pages, we add those pages
// to this history cache.
export const HistoryCache = {
  size: 20000,
  // An array of History items returned from Chrome.
  history: null,
  // Incremented whenever `history` changes in place, so caches derived from it know when to rebuild.
  version: 0,

  reset() {
    this.history = null;
    chrome.history.onVisited.removeListener(this._onVisitedListener);
    chrome.history.onVisitRemoved.removeListener(this._onVisitRemovedListener);
  },

  async onLoaded() {
    if (this.history) return;
    await this.fetchHistory();
  },

  async fetchHistory() {
    if (this.chromeHistoryPromise) {
      await this.chromeHistoryPromise;
      return;
    }
    this.chromeHistoryPromise = chrome.history.search({
      text: "",
      maxResults: this.size,
      startTime: 0,
    });

    const history = await this.chromeHistoryPromise;

    // On Firefox, some history entries do not have titles.
    for (const entry of history) {
      if (entry.title == null) entry.title = "";
    }
    history.sort(this.compareHistoryByUrl);
    this.history = history;
    chrome.history.onVisited.addListener(this._onVisitedListener);
    chrome.history.onVisitRemoved.addListener(this._onVisitRemovedListener);
    this.chromeHistoryPromise = null;
  },

  compareHistoryByUrl(a, b) {
    if (a.url === b.url) return 0;
    if (a.url > b.url) return 1;
    return -1;
  },

  // When a page we've seen before has been visited again, be sure to replace our History item so it
  // has the correct "lastVisitTime". That's crucial for ranking Vomnibar suggestions.
  onVisited(newPage) {
    // On Firefox, some history entries do not have titles.
    if (newPage.title == null) newPage.title = "";
    const i = HistoryCache.binarySearch(newPage, this.history, this.compareHistoryByUrl);
    const pageWasFound = this.history[i]?.url == newPage.url;
    if (pageWasFound) {
      this.history[i] = newPage;
    } else {
      this.history.splice(i, 0, newPage);
    }
    this.version++;
  },

  // When a page is removed from the chrome history, remove it from the vimium history too.
  onVisitRemoved(toRemove) {
    if (toRemove.allHistory) {
      this.history = [];
    } else {
      for (const url of toRemove.urls) {
        const i = HistoryCache.binarySearch({ url }, this.history, this.compareHistoryByUrl);
        if ((i < this.history.length) && (this.history[i].url === url)) {
          this.history.splice(i, 1);
        }
      }
    }
    this.version++;
  },
};

HistoryCache._onVisitedListener = HistoryCache.onVisited.bind(HistoryCache);
HistoryCache._onVisitRemovedListener = HistoryCache.onVisitRemoved.bind(HistoryCache);

// Returns the matching index or the closest matching index if the element is not found. That means
// you must check the element at the returned index to know whether the element was actually found.
// This method is used for quickly searching through our history cache.
HistoryCache.binarySearch = function (targetElement, array, compareFunction) {
  let element, middle;
  let high = array.length - 1;
  let low = 0;

  while (low <= high) {
    middle = Math.floor((low + high) / 2);
    element = array[middle];
    const compareResult = compareFunction(element, targetElement);
    if (compareResult > 0) {
      high = middle - 1;
    } else if (compareResult < 0) {
      low = middle + 1;
    } else {
      return middle;
    }
  }
  // We didn't find the element. Return the position where it should be in this array.
  if (compareFunction(element, targetElement) < 0) {
    return middle + 1;
  } else {
    return middle;
  }
};
