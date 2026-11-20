import "../test_helper.js";
import "../../../background_scripts/tab_recency.js";
import "../../../background_scripts/bg_utils.js";
import { Choices, normalize, strength } from "../../../background_scripts/completion/choices.js";
import {
  HistoryCache,
  OmniSearchCompleter,
  placeWebSearch,
  rankOmniSearch,
} from "../../../background_scripts/completion/completers.js";

const day = 24 * 60 * 60 * 1000;

const resetChoices = () => {
  Choices.entries = null;
  Choices.loading = null;
  chrome.storage.local.store = {};
};

context("Choices strength", () => {
  const now = Date.now();
  const choice = (text, hits = 1, ageDays = 0) => ({ text, hits, lastUsed: now - ageDays * day });

  should("count only when the text typed starts what was typed before", () => {
    assert.equal(0, strength(choice("gi"), "hub", now));
    assert.equal(0, strength(choice("gi"), "git", now));
    assert.equal(0, strength(choice("gi"), "", now));
    assert.isTrue(strength(choice("gi"), "g", now) > 0);
  });

  should("grow with how much of the text is typed, and with how often it was chosen", () => {
    assert.isTrue(strength(choice("github"), "github", now) > strength(choice("github"), "g", now));
    assert.isTrue(strength(choice("gi", 4), "gi", now) > strength(choice("gi", 1), "gi", now));
    assert.equal(0.5, strength(choice("gi", 1), "gi", now));
  });

  should("fade with time, more slowly for a choice made often", () => {
    assert.equal(0.25, strength(choice("gi", 1, 7), "gi", now));
    const often = strength(choice("gi", 10, 14), "gi", now) / strength(choice("gi", 10), "gi", now);
    const once = strength(choice("gi", 1, 14), "gi", now) / strength(choice("gi", 1), "gi", now);
    assert.isTrue(often > once);
  });

  should("remember queries lowercase, with single spaces", () => {
    assert.equal("rust book", normalize("  Rust   Book "));
  });
});

context("Choices", () => {
  setup(resetChoices);

  should("update a choice made again after typing more or less of the same text", async () => {
    await Choices.record({ query: "git", url: "https://github.com/" });
    await Choices.record({ query: "gi", url: "https://github.com/" });
    assert.equal(
      [{ text: "gi", url: "https://github.com/", hits: 2 }],
      Choices.entries.map(({ text, url, hits }) => ({ text, url, hits })),
    );
  });

  should("keep apart choices of different pages, or of the same page for other text", async () => {
    await Choices.record({ query: "gi", url: "https://github.com/" });
    await Choices.record({ query: "gi", url: "https://gitlab.com/" });
    await Choices.record({ query: "code", url: "https://github.com/" });
    await Choices.record({ query: "gi", search: true });
    assert.equal(4, Choices.entries.length);
  });

  should("ignore a choice without a query or a destination", async () => {
    await Choices.record({ query: "  ", url: "https://github.com/" });
    await Choices.record({ query: "gi" });
    assert.equal({ pages: new Map(), search: 0 }, await Choices.lookup("gi"));
  });

  should("say how strongly each page, and searching, was chosen for a query", async () => {
    await Choices.record({ query: "gi", url: "https://github.com/" });
    await Choices.record({ query: "rust book", search: true });
    const { pages, search } = await Choices.lookup("G");
    assert.equal(["https://github.com/"], [...pages.keys()]);
    assert.equal(0, search);
    assert.isTrue((await Choices.lookup("rust b")).search > 0);
  });

  should("keep choices across restarts of the background page", async () => {
    await Choices.record({ query: "gi", url: "https://github.com/" });
    Choices.entries = null;
    Choices.loading = null;
    assert.isTrue((await Choices.lookup("gi")).pages.has("https://github.com/"));
  });

  should("forget a page removed from the history, and everything when it's cleared", async () => {
    await Choices.record({ query: "gi", url: "https://github.com/" });
    await Choices.record({ query: "gl", url: "https://gitlab.com/" });
    await Choices.record({ query: "rust", search: true });
    await Choices.onVisitRemoved({ allHistory: false, urls: ["https://github.com/"] });
    assert.equal(["gl", "rust"], Choices.entries.map((e) => e.text));
    await Choices.onVisitRemoved({ allHistory: true, urls: [] });
    assert.equal([], Choices.entries);
  });
});

context("OmniSearch with choices", () => {
  const page = (description, title, url, relevancyData = {}) => ({
    description,
    title,
    url,
    relevancyData,
  });

  should("put a page chosen a few times for the text first", () => {
    const now = Date.now();
    const pages = [
      page("tab", "Rust Book", "https://doc.rust-lang.org/book/", { recency: 1 }),
      page("history", "Rust Playground", "https://play.rust-lang.org/", { lastVisitTime: now }),
    ];
    const rank = (chosen) => rankOmniSearch(["rust"], pages, chosen).map((s) => s.url)[0];
    assert.equal("https://doc.rust-lang.org/book/", rank(new Map()));
    const chosen = new Map([["https://play.rust-lang.org/", 0.75]]);
    assert.equal("https://play.rust-lang.org/", rank(chosen));
  });

  should("let a decisive choice decide between searching and opening a page", () => {
    const web = { webSearchQuery: "rust" };
    const tab = page("tab", "The Rust Book", "https://a.com/");
    // The tab is a strong match, so it would come first, but searching was chosen for this text.
    assert.equal([tab, web], placeWebSearch(["rust"], [tab], web));
    const searched = { pages: new Map(), search: 0.5 };
    assert.equal([web, tab], placeWebSearch(["rust"], [tab], web, searched));
    // A question would search the web, but the page was chosen for it.
    const question = ["how", "rust"];
    assert.equal([web, tab], placeWebSearch(question, [tab], web));
    const opened = { pages: new Map([["https://a.com/", 0.5]]), search: 0 };
    assert.equal([tab, web], placeWebSearch(question, [tab], web, opened));
    // A faint choice leaves it to the query.
    const faint = { pages: new Map(), search: 0.1 };
    assert.equal([tab, web], placeWebSearch(["rust"], [tab], web, faint));
  });

  context("filter", () => {
    let completer;
    setup(() => {
      resetChoices();
      stub(chrome.tabs, "query", () => Promise.resolve([]));
      stub(chrome, "topSites", { get: () => Promise.resolve([]) });
      stub(chrome.bookmarks, "getTree", () => Promise.resolve([]));
      stub(chrome.runtime, "getURL", returns("https://test/"));
      HistoryCache.history = [
        { url: "https://mail.google.com/", title: "Inbox", lastVisitTime: Date.now() },
        { url: "https://mastodon.social/", title: "Mastodon", lastVisitTime: Date.now() },
      ];
      HistoryCache.version = 0;
      completer = new OmniSearchCompleter();
    });

    teardown(() => {
      HistoryCache.history = null;
    });

    const urls = async (query) =>
      (await completer.filter({ queryTerms: query.split(" "), query }))
        .map((s) => s.url || "search");

    should("bring up a page chosen for the text even when the text doesn't match it", async () => {
      // "ma" matches both pages, so Gmail can be chosen; "gm" matches neither.
      assert.equal(["search"], await urls("gm"));
      await Choices.record({ query: "gmail", url: "https://mail.google.com/" });
      assert.equal(["https://mail.google.com/", "search"], await urls("gm"));
    });

    should("put a page chosen for the text first", async () => {
      const gmail = "https://mail.google.com/";
      const mastodon = "https://mastodon.social/";
      assert.equal([mastodon, gmail, "search"], await urls("ma"));
      await Choices.record({ query: "ma", url: gmail });
      await Choices.record({ query: "mai", url: gmail });
      assert.equal([gmail, mastodon, "search"], await urls("ma"));
    });

    should("leave out the page the tab is on, though it was chosen", async () => {
      await Choices.record({ query: "gmail", url: "https://mail.google.com/" });
      const tab = { url: "https://mail.google.com/" };
      const results = await completer.filter({ queryTerms: ["gm"], query: "gm", tab });
      assert.equal([""], results.map((s) => s.url));
    });

    should("not bring up a chosen page that is no longer anywhere", async () => {
      await Choices.record({ query: "gmail", url: "https://gone.example/" });
      assert.equal(["search"], await urls("gm"));
    });
  });
});
