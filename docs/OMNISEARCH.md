# OmniSearch Feature

## Overview

`Vomnibar.activateOmniSearch` is a unified search command that provides a different approach to
searching through your browser data compared to the standard `Vomnibar.activate` (omni) command.

## Key Differences from Standard Omni Search

| Feature | Standard Omni (`o`) | OmniSearch |
|---------|---------------------|------------|
| **Result Ordering** | Mixed by relevancy score | Grouped by category (tabs → top sites → bookmarks → history) |
| **Tab Sorting** | By relevancy | By Most Recently Used (MRU) |
| **Bookmark Search** | Title + URL | Full folder path + title + URL |
| **Top Sites** | Not included | Included (Chrome's frequently visited sites) |
| **Domains** | Included | Not included |
| **Search Engines** | Included | Not included |
| **Max Results** | 10 total | 10 total (4 per category max) |

## Features

### 1. Most Recently Used (MRU) Tab Ordering

When searching tabs, results are ordered by how recently you accessed each tab, with the most
recently used tabs appearing first. This makes it quick to switch back to tabs you were just
working with.

### 2. Top Sites Integration

OmniSearch includes your browser's top sites (frequently visited pages) as a dedicated category.
These are fetched using Chrome's `chrome.topSites` API and provide quick access to your most
visited websites.

### 3. Full-Path Bookmark Search

Bookmarks can be found by typing any part of their folder hierarchy. For example, if you have a
bookmark organized as:

```
Work / Projects / Vimium / GitHub
```

You can find it by typing "Work", "Projects", "Vimium", or any combination of these words.

### 4. Grouped Results

Results are displayed in distinct categories:
1. **Tabs** - Your open tabs (MRU ordered)
2. **Top Sites** - Frequently visited pages
3. **Bookmarks** - Matching bookmarks with full folder paths
4. **History** - Browser history entries

This grouping makes it easier to understand where each result comes from and find what you're
looking for.

### 5. Smart Deduplication

URLs that appear in multiple categories are deduplicated following this priority:
1. If a URL is open as a tab → it won't appear in top sites, bookmarks, or history
2. If a URL is in top sites → it won't appear in bookmarks or history
3. If a URL is bookmarked → it won't appear in history

### 6. Tab Closing with Ctrl+D

While browsing results in the vomnibar, you can press `Ctrl+D` to close a selected tab without
leaving the vomnibar. The tab is removed from the list and you can continue browsing.

## Configuration

### Result Limits

| Setting | Value | Description |
|---------|-------|-------------|
| `omniSearchMaxResultsPerCategory` | 4 | Maximum results per category |
| `omniSearchMaxResults` | 10 | Maximum total results displayed |

The per-category limit ensures a balanced distribution of results, while the total limit keeps
the interface clean and responsive.

## Usage

### Basic Usage

1. Add a key mapping in Vimium's options:
   ```
   map t Vomnibar.activateOmniSearch
   ```

2. Press your mapped key (e.g., `t`) to open the OmniSearch vomnibar.

3. Start typing to search across all categories, or browse the default results (shown on open).

### Options

You can prefill the search with a query:

```
map go Vomnibar.activateOmniSearch query=github
```

## When to Use OmniSearch vs Standard Omni

**Use OmniSearch when:**
- You want to quickly switch to a recently used tab
- You frequently visit the same sites and want quick access via top sites
- You organize bookmarks in folders and want to search by folder names
- You prefer seeing results grouped by source
- You want a cleaner interface without domain suggestions and search engine results
- You want to see suggestions immediately when opening the vomnibar (no typing required)

**Use Standard Omni when:**
- You want results ranked purely by relevancy
- You frequently use custom search engines
- You want domain auto-completion
- You prefer a single mixed list of results

## Technical Details

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    OmniSearchCompleter                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   Promise    │  │   Promise    │  │   Promise    │       │
│  │   .all()     │  │   .all()     │  │   .all()     │       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
│         │                 │                 │                │
│         ▼                 ▼                 ▼                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ tabs.query() │  │ topSites.get │  │HistoryCache  │       │
│  │ + tabRecency │  │              │  │ .onLoaded()  │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│         │                 │                 │                │
│         │    ┌────────────┴────────────┐    │               │
│         │    │                         │    │               │
│         ▼    ▼                         ▼    ▼               │
│  ┌───────────────────────────────────────────────────┐      │
│  │              Deduplication Pipeline               │      │
│  │  tabs → topSites → bookmarks → history            │      │
│  └───────────────────────────────────────────────────┘      │
│                          │                                   │
│                          ▼                                   │
│  ┌───────────────────────────────────────────────────┐      │
│  │         Final Results (max 10)                    │      │
│  └───────────────────────────────────────────────────┘      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Parallel Loading**: All data sources are loaded simultaneously using `Promise.all()`:
   - Tabs with recency scores
   - Top sites from Chrome API
   - History from HistoryCache
   - Bookmarks from cached bookmark tree

2. **Tab Annotation**: Tabs that match bookmarked URLs are annotated with bookmark info

3. **Deduplication**: URLs are tracked and excluded from subsequent categories

4. **Slicing**: Each category is limited to `omniSearchMaxResultsPerCategory` (4) results

5. **Final Slice**: Combined results are limited to `omniSearchMaxResults` (10) total

### Results Per Category

| Category | Max Results | Sorting |
|----------|-------------|---------|
| Tabs | 4 | Most Recently Used |
| Top Sites | 4 | Chrome's ranking |
| Bookmarks | 4 | Relevancy score |
| History | 4 | Relevancy (with query) or Recency (without query) |

**Total Maximum**: 10 results (after deduplication and final slice)

### Performance Optimizations

- **Parallel Loading**: All data sources load concurrently via `Promise.all()`
- **Bookmark Caching**: Bookmarks are cached after first load, with full path pre-computed
- **Lazy Favicon Loading**: Favicons use `loading="lazy"` and `decoding="async"` attributes
- **Tab Recency Cache**: Maintained by Vimium's existing tab tracking system
- **History Cache**: Uses Vimium's built-in HistoryCache with binary search

### Compatibility

OmniSearch works on both Chrome/Chromium and Firefox with the same behavior.

**Note**: Top Sites feature uses `chrome.topSites` API which may not be available in all browsers.
The implementation gracefully handles this by returning an empty array if unavailable.

## Example Key Mappings

```viml
# Basic mapping - opens results in current tab
map t Vomnibar.activateOmniSearch

# Open results in a new tab
map T Vomnibar.activateOmniSearchInNewTab

# With a default query
map gp Vomnibar.activateOmniSearch query=project
```

## Keyboard Shortcuts (in Vomnibar)

| Key | Action |
|-----|--------|
| `↑` / `Ctrl+K` / `Ctrl+P` | Move selection up |
| `↓` / `Ctrl+J` / `Ctrl+N` | Move selection down |
| `Enter` | Open selected result |
| `Ctrl+Enter` | Copy URL to input |
| `Ctrl+D` | Close selected tab (tabs only) |
| `Escape` | Close vomnibar |

## Troubleshooting

### Tabs not appearing in MRU order

Make sure Vimium has been active since you started your browser session. Tab recency tracking
begins when Vimium loads.

### Bookmarks not showing folder paths

Refresh your bookmarks by:
1. Opening Vimium's options page
2. Making any change (or no change)
3. Saving

This will trigger a bookmark cache refresh.

### Top Sites not appearing

Top Sites require the `topSites` permission. Make sure Vimium has the necessary permissions
enabled. On Firefox, this feature may have limited support.

### Results seem limited

OmniSearch intentionally limits results to keep the interface clean and fast:
- 4 results per category maximum
- 10 results total maximum

If you need to see more results, consider using the standard omni search (`o`) which shows
more comprehensive results ranked by relevancy.
