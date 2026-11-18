import "../test_helper.js";
import { withPromise } from "../test_helper.js";
import "../../../background_scripts/tab_recency.js";
import "../../../background_scripts/bg_utils.js";
import "../../../background_scripts/completion/search_engines.js";
import "../../../background_scripts/completion/search_wrapper.js";
import * as userSearchEngines from "../../../background_scripts/user_search_engines.js";
import {
  BookmarkCompleter,
  CommandCompleter,
  DomainCompleter,
  HistoryCache,
  HistoryCompleter,
  isNavigationalMatch,
  isSearchResultsPage,
  isStrongMatch,
  looksLikeWebSearch,
  MultiCompleter,
  OmniSearchCompleter,
  placeWebSearch,
  queryExtends,
  SearchEngineCompleter,
  Suggestion,
  TabCompleter,
  topK,
} from "../../../background_scripts/completion/completers.js";
import "../../../lib/url_utils.js";
import { Commands, RegistryEntry } from "../../../background_scripts/commands.js";
import { allCommands } from "../../../background_scripts/all_commands.js";

const hours = (n) => 1000 * 60 * 60 * n;

// A convenience wrapper around completer.filter() so it can be called synchronously in tests.
export async function filterCompleter(completer, queryTerms) {
  return await completer.filter({
    queryTerms,
    query: queryTerms.join(" "),
  });
}

context("bookmark completer", () => {
  const bookmark3 = { title: "bookmark3", url: "bookmark3.com" };
  const bookmark2 = { title: "bookmark2", url: "bookmark2.com" };
  const bookmark1 = { title: "bookmark1", url: "bookmark1.com", children: [bookmark2] };
  let completer;

  setup(() => {
    stub(globalThis.chrome.bookmarks, "getTree", () => [bookmark1]);
    completer = new BookmarkCompleter();
  });

  should("flatten a list of bookmarks with inorder traversal", async () => {
    const result = await completer.traverseBookmarks([bookmark1, bookmark3]);
    assert.equal([bookmark1, bookmark2, bookmark3], result);
  });

  should("return matching bookmarks when searching", async () => {
    completer.refresh();
    const results = await filterCompleter(completer, ["mark2"]);
    assert.equal([bookmark2.url], results.map((suggestion) => suggestion.url));
  });

  should("return *no* matching bookmarks when there is no match", async () => {
    completer.refresh();
    const results = await filterCompleter(completer, ["does-not-match"]);
    assert.equal([], results.map((suggestion) => suggestion.url));
  });

  should("construct bookmark paths correctly", async () => {
    completer.refresh();
    await filterCompleter(completer, ["mark2"]);
    assert.equal("/bookmark1/bookmark2", bookmark2.pathAndTitle);
  });

  should(
    "return matching bookmark *titles* when searching *without* the folder separator character",
    async () => {
      completer.refresh();
      const results = await filterCompleter(completer, ["mark2"]);
      assert.equal(["bookmark2"], results.map((suggestion) => suggestion.title));
    },
  );

  should(
    "return matching bookmark *paths* when searching with the folder separator character",
    async () => {
      completer.refresh();
      const results = await filterCompleter(completer, ["/bookmark1", "mark2"]);
      assert.equal(["/bookmark1/bookmark2"], results.map((suggestion) => suggestion.title));
    },
  );
});

context("OmniSearch bookmark traversal", () => {
  should(
    "collect bookmarks depth-first with folder paths, skipping ignored top-level folders",
    () => {
      const tree = [{
        title: "",
        children: [
          {
            title: "Bookmarks Bar",
            children: [
              { title: "a", url: "http://a.com" },
              { title: "Work", children: [{ title: "b", url: "http://b.com" }] },
            ],
          },
          { title: "Reading", children: [{ title: "c", url: "http://c.com" }] },
        ],
      }];
      const { bookmarksList, bookmarksMap } = new OmniSearchCompleter().traverseBookmarksWithPath(
        tree,
      );
      assert.equal(["a", "Work/b", "Reading/c"], bookmarksList.map((b) => b.fullPathTitle));
      assert.equal(3, bookmarksMap.size);
      assert.equal("Work/b", bookmarksMap.get("http://b.com").fullPathTitle);
    },
  );
});

context("topK", () => {
  should("keep the k best, best first, with ties in input order like a stable sort", () => {
    const items = [["a", 1], ["b", 3], ["c", 3], ["d", 2], ["e", 3], ["f", null]];
    const best = topK(items, 3, ([, score]) => score).map(({ item }) => item[0]);
    const sorted = items.filter(([, s]) => s != null).sort((x, y) => y[1] - x[1]).slice(0, 3);
    assert.equal(sorted.map((x) => x[0]), best);
    assert.equal(["b", "c", "e"], best);
  });

  should("return everything when there are fewer than k items", () => {
    assert.equal([2, 1], topK([1, 2], 5, (x) => x).map(({ item }) => item));
  });
});

context("OmniSearch web search intent", () => {
  const page = (title, url, description = "tab") => ({ title, url, description });
  const terms = (q) => q.split(" ");

  should("treat a match at a word start in the title or hostname as strong", () => {
    assert.isTrue(isStrongMatch(["rust"], page("The Rust Book", "https://doc.example.com")));
    assert.isTrue(isStrongMatch(["rust"], page("Docs", "https://www.rust-lang.org/learn")));
    assert.isTrue(isStrongMatch(["git", "vim"], page("philc/vimium", "https://github.com")));
    assert.isFalse(isStrongMatch(["rust"], page("Reviews", "https://trustpilot.com/rust")));
  });

  should("search the web when nothing matches, or only weakly", () => {
    assert.isTrue(looksLikeWebSearch(terms("zzqq"), []));
    assert.isTrue(looksLikeWebSearch(["rust"], [page("Reviews", "https://trustpilot.com")]));
    assert.isFalse(looksLikeWebSearch(["rust"], [page("The Rust Book", "https://a.com")]));
  });

  should("count history only when the query starts its hostname, like Chrome's omnibox", () => {
    const history = page("React Hooks Guide", "https://legacy.example.com/hooks", "history");
    assert.isFalse(isNavigationalMatch(["react"], history));
    assert.isTrue(looksLikeWebSearch(["react"], [history]));
    const github = page("Pull requests", "https://www.github.com/pulls", "history");
    assert.isTrue(isNavigationalMatch(["git"], github));
    assert.isFalse(looksLikeWebSearch(["git"], [github]));
    assert.isTrue(
      isNavigationalMatch(["react"], page("React Hooks Guide", "https://a.com", "bookmark")),
    );
  });

  should("not count the top-level domain or www as words", () => {
    const results = page("rust book - Pesquisa Google", "https://www.google.com/x");
    assert.isFalse(isStrongMatch(["rust", "c"], results));
    assert.isFalse(isStrongMatch(["w"], page("Docs", "https://www.example.org")));
    assert.isTrue(isStrongMatch(["exam"], page("Docs", "https://www.example.org")));
  });

  should("never treat a page of search results as the destination", () => {
    const url = "https://www.google.com/search?q=rust+book&oq=rust+book&sourceid=chrome";
    assert.isTrue(isSearchResultsPage(url));
    assert.isTrue(isSearchResultsPage("https://duckduckgo.com/?q=rust"));
    assert.isTrue(isSearchResultsPage("https://www.youtube.com/results?search_query=rust"));
    assert.isFalse(isSearchResultsPage("https://doc.rust-lang.org/book/"));
    assert.isFalse(isSearchResultsPage("https://www.google.com/maps"));
    const tab = page("rust book - Pesquisa Google", url);
    assert.isTrue(looksLikeWebSearch(["rust", "book"], [tab]));
    assert.isTrue(looksLikeWebSearch(["rust", "c"], [tab]));
  });

  should("search the web for questions, whatever matches", () => {
    const rustBook = [page("The Rust Book", "https://a.com")];
    assert.isTrue(looksLikeWebSearch(terms("how rust ownership works"), rustBook));
    assert.isTrue(looksLikeWebSearch(terms("como usar rust"), rustBook));
    assert.isTrue(looksLikeWebSearch(terms("rust?"), rustBook));
  });

  should("never search the web for a URL-like query or an empty one", () => {
    assert.isFalse(looksLikeWebSearch(["github.com"], []));
    assert.isFalse(looksLikeWebSearch(["localhost:8080"], []));
    assert.isFalse(looksLikeWebSearch([], []));
  });

  should("put the web search first on a likely miss and last otherwise", () => {
    const web = { webSearchQuery: "rust" };
    const strong = page("The Rust Book", "https://a.com");
    const weak = page("Reviews", "https://trustpilot.com");
    assert.equal([web, weak], placeWebSearch(["rust"], [weak], web));
    assert.equal([strong, web], placeWebSearch(["rust"], [strong], web));
  });

  should("render the web search row with the query, escaped", () => {
    const html = new Suggestion({
      queryTerms: [],
      description: "search",
      url: "",
      title: "<b>q",
      webSearchQuery: "<b>q",
      relevancy: 1,
    }).generateHtml({});
    assert.isTrue(html.includes("&lt;b&gt;q"));
    assert.isTrue(html.includes("Search the web"));
  });
});

context("queryExtends", () => {
  should("accept queries that only narrow the previous one", () => {
    assert.isTrue(queryExtends(["git"], ["gi"]));
    assert.isTrue(queryExtends(["git", "vim"], ["git"]));
    assert.isTrue(queryExtends(["Git"], ["Gi"]));
    assert.isTrue(queryExtends(["giT"], ["gi"]));
  });

  should("reject queries that could match entries the previous one didn't", () => {
    assert.isFalse(queryExtends(["gi"], ["git"]));
    assert.isFalse(queryExtends(["git"], ["git", "vim"]));
    assert.isFalse(queryExtends(["hub"], ["git"]));
    // "gi" (case-insensitive) is not a substring of "Git", so no reuse.
    assert.isFalse(queryExtends(["Git"], ["gi"]));
    assert.isFalse(queryExtends(["vim", "git"], ["git"]));
  });
});

context("OmniSearch history narrowing", () => {
  let completer;
  setup(() => {
    HistoryCache.history = [
      { url: "http://github.com/a", title: "Repo A", lastVisitTime: 3 },
      { url: "http://gitlab.com/b", title: "Repo B", lastVisitTime: 2 },
    ];
    HistoryCache.version = 0;
    completer = new OmniSearchCompleter();
  });

  teardown(() => {
    HistoryCache.history = null;
  });

  should("find entries added to the history after the previous keystroke", () => {
    const urls = (terms) =>
      completer.topMatchingHistory(terms, new Set(), 4).map(({ item }) => item.url);
    assert.equal(["http://github.com/a"], urls(["gith"]));
    HistoryCache.onVisited({ url: "http://github.io/c", title: "Pages", lastVisitTime: 4 });
    assert.equal(2, urls(["githu"]).length);
  });

  should("list the most recent entries for an empty query, and follow history changes", () => {
    const recent = () => completer.getHistory([], new Set()).map((s) => s.url);
    assert.equal(["http://github.com/a", "http://gitlab.com/b"], recent());
    HistoryCache.onVisited({ url: "http://gitlab.com/b", title: "Repo B", lastVisitTime: 9 });
    assert.equal(["http://gitlab.com/b", "http://github.com/a"], recent());
  });
});

context("HistoryCache", () => {
  const compare = (a, b) => a - b;
  context("binary search", () => {
    should("find elements to the left of the middle", () => {
      assert.equal(0, HistoryCache.binarySearch(3, [3, 5, 8], compare));
    });

    should("find elements to the right of the middle", () => {
      assert.equal(2, HistoryCache.binarySearch(8, [3, 5, 8], compare));
    });

    context("unfound elements", () => {
      should("return 0 if it should be the head of the list", () => {
        assert.equal(0, HistoryCache.binarySearch(1, [3, 5, 8], compare));
      });
      should("return length - 1 if it should be at the end of the list", () => {
        assert.equal(0, HistoryCache.binarySearch(3, [3, 5, 8], compare));
      });
      should(
        "return one passed end of array (so: array.length) if greater than last element in array",
        () => {
          assert.equal(3, HistoryCache.binarySearch(10, [3, 5, 8], compare));
        },
      );
      should("found return the position if it's between two elements", () => {
        assert.equal(1, HistoryCache.binarySearch(4, [3, 5, 8], compare));
        assert.equal(2, HistoryCache.binarySearch(7, [3, 5, 8], compare));
      });
    });
  });

  context("fetchHistory", () => {
    const history1 = { url: "b.com", lastVisitTime: 5 };
    const history2 = { url: "a.com", lastVisitTime: 10 };
    let onVisitedListener, onVisitRemovedListener;

    setup(async () => {
      const history = [history1, history2];
      // const history = [history2, history1];
      onVisitedListener = null;
      onVisitRemovedListener = null;

      stub(globalThis.chrome, "history", {
        search: (_options) => history,
        onVisited: {
          addListener(listener) {
            onVisitedListener = listener;
          },
          removeListener() {},
        },
        onVisitRemoved: {
          addListener(listener) {
            onVisitRemovedListener = listener;
          },
          removeListener() {},
        },
      });

      HistoryCache.reset();
      await HistoryCache.fetchHistory();
    });

    should("store visits sorted by url ascending", () => {
      assert.equal([history2, history1], HistoryCache.history);
    });

    should("add new visits to the history", () => {
      const newSite = { url: "ab.com" };
      onVisitedListener(newSite);
      assert.equal([history2, newSite, history1], HistoryCache.history);
    });

    should("replace new visits in the history", () => {
      assert.equal([history2, history1], HistoryCache.history);
      const newSite = { url: "a.com", lastVisitTime: 15 };
      onVisitedListener(newSite);
      assert.equal([newSite, history1], HistoryCache.history);
    });

    should(
      "(not) remove page from the history, when page is not in history (it should be a no-op)",
      () => {
        assert.equal([history2, history1], HistoryCache.history);
        const toRemove = { urls: ["x.com"], allHistory: false };
        onVisitRemovedListener(toRemove);
        assert.equal([history2, history1], HistoryCache.history);
      },
    );

    should("remove pages from the history", () => {
      assert.equal([history2, history1], HistoryCache.history);
      const toRemove = { urls: ["a.com"], allHistory: false };
      onVisitRemovedListener(toRemove);
      assert.equal([history1], HistoryCache.history);
    });

    should("remove all pages from the history", () => {
      assert.equal([history2, history1], HistoryCache.history);
      const toRemove = { allHistory: true };
      onVisitRemovedListener(toRemove);
      assert.equal([], HistoryCache.history);
    });
  });
});

context("history completer", () => {
  const history1 = { title: "history1", url: "history1.com", lastVisitTime: hours(1) };
  const history2 = { title: "history2", url: "history2.com", lastVisitTime: hours(5) };
  let completer;

  setup(() => {
    completer = new HistoryCompleter();
    stub(globalThis.chrome, "history", {
      search: (_options) => [history1, history2],
      onVisited: { addListener() {}, removeListener() {} },
      onVisitRemoved: { addListener() {}, removeListener() {} },
    });
    HistoryCache.reset();
  });

  should("return matching history entries when searching", async () => {
    const results = await filterCompleter(completer, ["story1"]);
    assert.equal([history1.url], results.map((s) => s.url));
  });

  should("rank recent results higher than nonrecent results", async () => {
    stub(Date, "now", returns(hours(24)));
    const results = await filterCompleter(completer, ["hist"]);
    results.forEach((result) => result.computeRelevancy());
    results.sort((a, b) => b.relevancy - a.relevancy);
    assert.equal([history2.url, history1.url], results.map((result) => result.url));
  });
});

context("domain completer", () => {
  const history1 = { title: "history1", url: "http://history1.com", lastVisitTime: hours(1) };
  const history2 = { title: "history2", url: "http://history2.com", lastVisitTime: hours(1) };
  const undef = { title: "history2", url: "http://undefined.net", lastVisitTime: hours(1) };
  let completer = null;

  setup(() => {
    stub(globalThis.chrome, "history", {
      search: (_options) => [history1, history2, undef],
      onVisited: { addListener() {}, removeListener() {} },
      onVisitRemoved: { addListener() {}, removeListener() {} },
    });
    stub(Date, "now", returns(hours(24)));

    completer = new DomainCompleter();
    HistoryCache.reset();
  });

  should("return only a single matching domain", async () => {
    const results = await filterCompleter(completer, ["story"]);
    assert.equal(["http://history1.com"], results.map((r) => r.url));
  });

  should("pick domains which are more recent", async () => {
    // These domains are the same except for their last visited time.
    let result = await filterCompleter(completer, ["story"]);
    assert.equal("http://history1.com", result[0].url);

    history2.lastVisitTime = hours(3);
    result = await filterCompleter(completer, ["story"]);
    assert.equal("http://history2.com", result[0].url);
  });

  should(
    "returns no results when there's more than one query term, because clearly it's not a domain",
    async () => {
      assert.equal([], await filterCompleter(completer, ["his", "tory"]));
    },
  );

  should("not return any results for empty queries", async () => {
    assert.equal([], await filterCompleter(completer, []));
  });
});

context("domain completer (removing entries)", () => {
  const history1 = { title: "history1", url: "http://history1.com", lastVisitTime: hours(2) };
  const history2 = { title: "history2", url: "http://history2.com", lastVisitTime: hours(1) };
  const history3 = {
    title: "history2something",
    url: "http://history2.com/something",
    lastVisitTime: hours(0),
  };

  let onVisitRemovedListener, completer;

  setup(async () => {
    onVisitRemovedListener = null;
    stub(globalThis.chrome, "history", {
      search: (_options) => [history1, history2, history3],
      onVisited: {
        addListener(_listener) {
        },
      },
      onVisitRemoved: {
        addListener(listener) {
          onVisitRemovedListener = listener;
        },
      },
    });

    stub(Date, "now", returns(hours(24)));

    completer = new DomainCompleter();
    // Force installation of listeners.
    await filterCompleter(completer, ["story"]);
  });

  should("remove 1 entry for domain with reference count of 1", async () => {
    onVisitRemovedListener({ allHistory: false, urls: [history1.url] });
    let result = await filterCompleter(completer, ["story"]);
    assert.equal("http://history2.com", result[0].url);
    result = await filterCompleter(completer, ["story1"]);
    assert.equal(0, result.length);
  });

  should("remove 2 entries for domain with reference count of 2", async () => {
    onVisitRemovedListener({ allHistory: false, urls: [history2.url] });
    let result = await filterCompleter(completer, ["story2"]);
    assert.equal("http://history2.com", result[0].url);
    onVisitRemovedListener({ allHistory: false, urls: [history3.url] });
    result = await filterCompleter(completer, ["story2"]);
    assert.equal(0, result.length);
    result = await filterCompleter(completer, ["story"]);
    assert.equal("http://history1.com", result[0].url);
  });

  should("remove 3 (all) matching domain entries", async () => {
    onVisitRemovedListener({ allHistory: false, urls: [history2.url] });
    onVisitRemovedListener({ allHistory: false, urls: [history1.url] });
    onVisitRemovedListener({ allHistory: false, urls: [history3.url] });
    const result = await filterCompleter(completer, ["story"]);
    assert.equal(0, result.length);
  });

  should("remove 3 (all) matching domain entries, and do it all at once", async () => {
    onVisitRemovedListener({ allHistory: false, urls: [history2.url, history1.url, history3.url] });
    const result = await filterCompleter(completer, ["story"]);
    assert.equal(0, result.length);
  });

  should("remove *all* domain entries", async () => {
    onVisitRemovedListener({ allHistory: true });
    const result = await filterCompleter(completer, ["story"]);
    assert.equal(0, result.length);
  });
});

context("multi completer", () => {
  const tabs = [{ url: "tab1.com", title: "tab1", id: 1 }];
  const tabCompleter = new TabCompleter();
  let multiCompleter;

  setup(() => {
    stub(chrome.tabs, "query", () => tabs);
    multiCompleter = new MultiCompleter([tabCompleter, new DomainCompleter()]);
  });

  should("return an empty list when the query is empty", async () => {
    // Even though a TabCompleter returns results when the query is empty, a MultiCompleter which
    // wraps a TabCompleter should not.
    assert.equal(1, (await filterCompleter(tabCompleter, [])).length);
    assert.equal([], await filterCompleter(multiCompleter, []));
  });

  should("deduplicate suggestions with the same URL", async () => {
    const make = (url, relevancy) => new Suggestion({ url, relevancy, html: url });
    const fakeCompleter = {
      filter: () => [
        make("http://example.com", 1),
        make("http://example.com", 0.9), // duplicate
        make("http://other.com", 0.8),
      ],
    };
    const results = await filterCompleter(new MultiCompleter([fakeCompleter]), ["example"]);
    assert.equal(2, results.length);
    assert.equal("http://example.com", results[0].url);
    assert.equal("http://other.com", results[1].url);
  });
});

context("command completer", () => {
  const commandCompleter = new CommandCompleter();
  const multiCompleter = new MultiCompleter([commandCompleter]);

  should("return all commands with default options if no mappings are specified", async () => {
    stub(
      chrome.storage.session,
      "get",
      withPromise(() => ({
        commandToOptionsToKeys: {},
      })),
    );
    stub(Commands, "keyToRegistryEntry", {});

    const suggestions = await filterCompleter(commandCompleter, []);

    // Checks that all available commands are returned as suggestions.
    assert.equal(allCommands.length, suggestions.length);

    // Check that by default no options (e.g. value=1.1) are applied to each command.
    assert.isTrue(
      suggestions.every((s) => Object.keys(s.command.registryEntry.options).length === 0),
    );
  });

  should("create suggestions for different variations of the same command", async () => {
    stub(
      chrome.storage.session,
      "get",
      withPromise(() => ({
        commandToOptionsToKeys: {
          "setZoom": {
            "value=1.1": ["z1"],
            "value=1.2": ["z2"],
          },
        },
      })),
    );

    stub(Commands, "keyToRegistryEntry", {
      "z1": new RegistryEntry(),
      "z2": new RegistryEntry(),
    });

    const suggestions = await filterCompleter(multiCompleter, ["set", "zoom"]);
    assert.equal(
      ["Set zoom", "Set zoom (value=1.1)", "Set zoom (value=1.2)", "Reset zoom"],
      suggestions.map((s) => s.title),
    );
  });
});

context("tab completer", () => {
  const tabs = [
    { url: "tab1.com", title: "tab1", id: 1 },
    { url: "tab2.com", title: "tab2", id: 2 },
  ];
  let completer;

  setup(() => {
    stub(chrome.tabs, "query", () => tabs);
    completer = new TabCompleter();
  });

  should("return tabs by recency when query is empty", async () => {
    const results = await filterCompleter(completer, []);
    assert.equal(["tab1.com", "tab2.com"], results.map((tab) => tab.url));
  });

  should("return matching tabs", async () => {
    const results = await filterCompleter(completer, ["tab2"]);
    assert.equal(["tab2.com"], results.map((tab) => tab.url));
    assert.equal([2], results.map((tab) => tab.tabId));
  });
});

context("SearchEngineCompleter", () => {
  const googleSearchUrl = "http://www.google.com/search?q=";
  let completer;

  const createResponse = (responseText) => {
    return { text: () => responseText };
  };

  setup(() => {
    completer = new SearchEngineCompleter();
    const searchEngineConfig = `g: ${googleSearchUrl}%s`;
    userSearchEngines.set(searchEngineConfig);
  });

  should("complete search results using the given completer", async () => {
    const googleResults = ["blue", ["blue1", "blue2"]];
    stub(globalThis, "fetch", () => createResponse(JSON.stringify(googleResults)));
    const results = await filterCompleter(completer, ["g", "blue"]);
    assert.equal(
      [googleSearchUrl + "blue", googleSearchUrl + "blue1", googleSearchUrl + "blue2"],
      results.map((suggestion) => suggestion.url),
    );
  });
});

context("suggestions", () => {
  setup(() => {
    stub(chrome.runtime, "getURL", returns("https://test/"));
  });

  should("escape html in page titles", () => {
    const suggestion = new Suggestion({
      queryTerms: ["queryterm"],
      description: "tab",
      url: "url",
      title: "title <span>",
      relevancyFunction: returns(1),
    });
    assert.isTrue(suggestion.generateHtml({}).indexOf("title &lt;span&gt;") >= 0);
  });

  should("badge only tabs, bookmarks and searches with their source", () => {
    const badgeFor = (description) =>
      new Suggestion({
        queryTerms: [],
        description,
        url: "https://example.com",
        title: "Example",
        relevancyFunction: returns(1),
      }).generateHtml({}).match(/class="type-badge[^"]*">([a-z_]+)</)?.[1] ?? null;
    assert.equal("tab", badgeFor("tab"));
    assert.equal("star", badgeFor("bookmark"));
    assert.equal(null, badgeFor("history"));
    assert.equal(null, badgeFor("topSite"));
    assert.equal(null, badgeFor("domain"));
  });

  should("highlight query words", () => {
    const suggestion = new Suggestion({
      queryTerms: ["ninj", "words"],
      description: "tab",
      url: "url",
      title: "ninjawords",
      relevancyFunction: returns(1),
    });
    const expected = "<span class='match'>ninj</span>a<span class='match'>words</span>";
    assert.isTrue(suggestion.generateHtml({}).indexOf(expected) >= 0);
  });

  should("highlight query words correctly when whey they overlap", () => {
    const suggestion = new Suggestion({
      queryTerms: ["ninj", "jaword"],
      description: "tab",
      url: "url",
      title: "ninjawords",
      relevancyFunction: returns(1),
    });
    const expected = "<span class='match'>ninjaword</span>s";
    assert.isTrue(suggestion.generateHtml({}).indexOf(expected) >= 0);
  });

  should("shorten urls", () => {
    const suggestion = new Suggestion({
      queryTerms: ["queryterm"],
      description: "history",
      url: "http://ninjawords.com",
      title: "ninjawords",
      relevancyFunction: returns(1),
    });
    assert.equal(-1, suggestion.generateHtml({}).indexOf("http://ninjawords.com"));
  });
});

// TODO: (smblott)
// Word relevancy should take into account the number of matches (it doesn't currently). should
// "score higher for multiple matches (in a URL)", ->
//   lowScore  = ranking.wordRelevancy(["stack"], "http://stackoverflow.com/Xxxxxx", "a-title")
//   highScore = ranking.wordRelevancy(["stack"], "http://stackoverflow.com/Xstack", "a-title")
//   assert.isTrue highScore > lowScore

// should "score higher for multiple matches (in a title)", ->
//   lowScore  = ranking.wordRelevancy(["bbc"], "http://stackoverflow.com/same", "BBC Radio 4 (XBCr4)")
//   highScore = ranking.wordRelevancy(["bbc"], "http://stackoverflow.com/same", "BBC Radio 4 (BBCr4)")
//   assert.isTrue highScore > lowScore

context("Suggestion.pushMatchingRanges", () => {
  should("extract ranges matching term (simple case, two matches)", () => {
    const ranges = [];
    const [one, two, three] = ["one", "two", "three"];
    const suggestion = new Suggestion([], "", "", "", returns(1));
    suggestion.pushMatchingRanges(`${one}${two}${three}${two}${one}`, two, ranges);
    assert.equal(
      2,
      Utils.zip([ranges, [[3, 6], [11, 14]]]).filter((pair) =>
        (pair[0][0] === pair[1][0]) && (pair[0][1] === pair[1][1])
      ).length,
    );
  });

  should("extract ranges matching term (two matches, one at start of string)", () => {
    const ranges = [];
    const [one, two, three] = ["one", "two", "three"];
    const suggestion = new Suggestion([], "", "", "", returns(1));
    suggestion.pushMatchingRanges(`${two}${three}${two}${one}`, two, ranges);
    assert.equal(
      2,
      Utils.zip([ranges, [[0, 3], [8, 11]]]).filter((pair) =>
        (pair[0][0] === pair[1][0]) && (pair[0][1] === pair[1][1])
      ).length,
    );
  });

  should("extract ranges matching term (two matches, one at end of string)", () => {
    const ranges = [];
    const [one, two, three] = ["one", "two", "three"];
    const suggestion = new Suggestion([], "", "", "", returns(1));
    suggestion.pushMatchingRanges(`${one}${two}${three}${two}`, two, ranges);
    assert.equal(
      2,
      Utils.zip([ranges, [[3, 6], [11, 14]]]).filter((pair) =>
        (pair[0][0] === pair[1][0]) && (pair[0][1] === pair[1][1])
      ).length,
    );
  });

  should("extract ranges matching term (no matches)", () => {
    const ranges = [];
    const [one, two, three] = ["one", "two", "three"];
    const suggestion = new Suggestion([], "", "", "", returns(1));
    suggestion.pushMatchingRanges(`${one}${two}${three}${two}${one}`, "does-not-match", ranges);
    assert.equal(0, ranges.length);
  });
});
