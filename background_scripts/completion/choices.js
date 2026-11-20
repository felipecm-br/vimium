// What the user chose in OmniSearch for what they typed, so that typing it again puts that choice
// first, the way Chrome's omnibox learns its shortcuts: after opening GitHub from "gi" a few times,
// "g" or "gi" leads with GitHub. A choice is a page, or searching the web for what was typed.
//
// Typing the start of what was typed before finds the choice. It counts for more the more of that
// text is typed again, the more often it was chosen, and the more recently; one choice made often
// fades more slowly than one made once.
//
// Choices are kept in chrome.storage.local. None are made in incognito windows (see main.js), and
// removing a page from the history forgets the choices of it; clearing the history forgets all.

const storageKey = "vomnibarChoices";
const maxChoices = 300;
const day = 24 * 60 * 60 * 1000;

// What a query is remembered as: lowercase, with single spaces.
export function normalize(query) {
  return (query ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

// How strongly a past choice says the user wants it again when they type `text`, from 0 to 1.
export function strength(choice, text, now = Date.now()) {
  if (text.length === 0 || !choice.text.startsWith(text)) return 0;
  const typed = Math.sqrt(text.length / choice.text.length);
  const confidence = choice.hits / (choice.hits + 1);
  const halfLifeDays = 7 * Math.min(5, 1 + Math.floor(choice.hits / 5));
  const ageDays = Math.max(0, now - choice.lastUsed) / day;
  return typed * confidence * 0.5 ** (ageDays / halfLifeDays);
}

export const Choices = {
  // [{ text, url, search, hits, lastUsed }]: `url` is the page chosen, or "" when `search` is true.
  entries: null,
  loading: null,

  async load() {
    if (this.entries) return;
    this.loading ??= chrome.storage.local.get(storageKey)
      .then((items) => items[storageKey] ?? [])
      .catch(() => [])
      .then((entries) => {
        this.entries ??= entries;
      });
    await this.loading;
  },

  save() {
    return chrome.storage.local.set({ [storageKey]: this.entries });
  },

  // Remembers that, after typing `query`, the user opened `url`, or searched the web if `search`.
  async record({ query, url = "", search = false }) {
    const text = normalize(query);
    if (text.length === 0 || (!url && !search)) return;
    await this.load();
    const now = Date.now();
    // Choosing the same again after typing more or less of the same text updates that choice, to
    // what was typed this time: what's typed before a choice tends to get shorter with habit.
    const related = (e) =>
      (search ? e.search : e.url === url) && (e.text.startsWith(text) || text.startsWith(e.text));
    const previous = this.entries.filter(related);
    const hits = previous.reduce((sum, e) => sum + e.hits, 0) + 1;
    this.entries = this.entries.filter((e) => !related(e));
    this.entries.push({ text, url: search ? "" : url, search, hits, lastUsed: now });
    if (this.entries.length > maxChoices) {
      this.entries.sort((a, b) => b.lastUsed - a.lastUsed);
      this.entries.length = maxChoices;
    }
    await this.save();
  },

  // For `query`: how strongly each page was chosen, by URL, and how strongly searching the web was.
  async lookup(query) {
    const text = normalize(query);
    const pages = new Map();
    let search = 0;
    if (text.length === 0) return { pages, search };
    await this.load();
    const now = Date.now();
    for (const choice of this.entries) {
      const s = strength(choice, text, now);
      if (s === 0) continue;
      if (choice.search) search = Math.max(search, s);
      else pages.set(choice.url, Math.max(pages.get(choice.url) ?? 0, s));
    }
    return { pages, search };
  },

  // Follows chrome.history.onVisitRemoved.
  async onVisitRemoved({ allHistory, urls }) {
    await this.load();
    const removed = new Set(urls ?? []);
    const kept = allHistory ? [] : this.entries.filter((e) => e.search || !removed.has(e.url));
    if (kept.length === this.entries.length) return;
    this.entries = kept;
    await this.save();
  },
};
