# OmniSearch Feature Implementation Plan

## Overview

This document outlines the plan to implement `Vomnibar.activateOmniSearch` in Vimium, inspired by the OmniSearch feature from Surfing Keys. This feature provides a **unified search interface** that displays results from multiple sources in **grouped sections** rather than mixing them together.

## Feature Description

Unlike the existing `Vomnibar.activate` (omni) completer which combines all results and ranks them by relevancy, OmniSearch displays results in **distinct grouped categories**:

1. **Tabs** - Open tabs (with MRU/Most Recently Used ordering)
2. **Top Sites** - Frequently visited sites
3. **Bookmarks** - User bookmarks (with full folder path fuzzy search)
4. **History** - Browser history

This approach provides better UX when users want to see results from specific categories without them being mixed together based on relevancy scores.

## Key Differences from Existing Omni Completer

| Feature | Omni Completer | OmniSearch |
|---------|---------------|------------|
| Result Display | Mixed, ranked by relevancy | Grouped by source type |
| Tab Ordering | By relevancy | MRU (Most Recently Used) |
| Bookmark Search | Title + URL | Full folder path + fuzzy matching |
| Categories | Implicit | Explicit sections |
| Domains | Included | Not included (less noise) |
| Search Engines | Included | Not included |

## Implementation Steps

### Step 1: Create OmniSearchCompleter Class

Create a new completer class in `background_scripts/completion.js` that:
- Fetches results from tabs, bookmarks, and history
- Returns results grouped by category
- Supports MRU ordering for tabs
- Implements full-path bookmark search

**File:** `background_scripts/completion.js`

```javascript
export class OmniSearchCompleter {
  async filter(request) {
    // Returns { tabs: [], bookmarks: [], history: [], topSites: [] }
  }
}
```

### Step 2: Register the OmniSearch Completer

Add the new completer to the completers registry in `background_scripts/main.js`:

```javascript
const completers = {
  omni: new MultiCompleter([...]),
  bookmarks: new MultiCompleter([...]),
  tabs: new MultiCompleter([...]),
  omniSearch: new OmniSearchCompleter(),  // NEW
};
```

### Step 3: Add the Command Definition

Add the new command to `background_scripts/all_commands.js`:

```javascript
{
  name: "Vomnibar.activateOmniSearch",
  desc: "Unified search across tabs, bookmarks, and history (grouped)",
  group: "vomnibar",
  topFrame: true,
}
```

### Step 4: Add Vomnibar Activation Method

Add a new method in `content_scripts/vomnibar.js`:

```javascript
activateOmniSearch(sourceFrameId, registryEntry) {
  const options = Object.assign({}, registryEntry.options, {
    completer: "omniSearch",
    selectFirst: true,
  });
  this.open(sourceFrameId, options);
}
```

### Step 5: Update Vomnibar UI (if needed)

The Vomnibar page may need updates to handle grouped results display:
- Show category headers (Tabs, Bookmarks, History)
- Visual separation between groups

**File:** `pages/vomnibar_page.js`, `pages/vomnibar_page.css`

### Step 6: Testing

Create unit tests in `tests/unit_tests/`:
- Test OmniSearchCompleter filtering
- Test MRU tab ordering
- Test bookmark path search
- Test result grouping

## Technical Details

### OmniSearchCompleter Implementation

```javascript
export class OmniSearchCompleter {
  constructor() {
    this.bookmarkCompleter = new BookmarkCompleter();
    this.historyCompleter = new HistoryCompleter();
    this.tabCompleter = new TabCompleter();
  }

  async filter(request) {
    const { queryTerms, query } = request;
    
    // Get tabs with MRU ordering
    const tabs = await this.getTabsWithMRU(queryTerms);
    
    // Get bookmarks with full path
    const bookmarks = await this.getBookmarksWithPath(queryTerms);
    
    // Get history
    const history = await this.getHistory(queryTerms);
    
    // Get top sites (if no query)
    const topSites = query ? [] : await this.getTopSites();
    
    return {
      grouped: true,
      tabs,
      bookmarks,
      history,
      topSites,
    };
  }
}
```

### MRU Tab Ordering

Tabs will be sorted by `lastAccessed` timestamp from Chrome's tab API, with the current tab excluded from results when MRU is enabled.

### Full-Path Bookmark Search

When searching bookmarks, the search will match against:
- Bookmark title
- Full folder path (e.g., "Work/Projects/Vimium")
- URL

This allows users to find bookmarks by typing folder names.

## Files to Modify

1. **`background_scripts/completion.js`** - Add `OmniSearchCompleter` class
2. **`background_scripts/main.js`** - Register the new completer
3. **`background_scripts/all_commands.js`** - Add command definition
4. **`content_scripts/vomnibar.js`** - Add activation method
5. **`pages/vomnibar_page.js`** - Handle grouped results (if needed)
6. **`pages/vomnibar_page.css`** - Style grouped sections (if needed)

## Files to Create

1. **`tests/unit_tests/omni_search_test.js`** - Unit tests
2. **`docs/OMNISEARCH.md`** - User documentation

## Default Key Binding Suggestion

No default key binding will be assigned. Users can map it via custom key mappings:

```
map go Vomnibar.activateOmniSearch
```

## Timeline

1. **Phase 1:** Create OmniSearchCompleter with basic functionality
2. **Phase 2:** Add MRU tab ordering
3. **Phase 3:** Add full-path bookmark search
4. **Phase 4:** Update UI for grouped display
5. **Phase 5:** Add tests and documentation

## Success Criteria

- [ ] OmniSearch command appears in help dialog
- [ ] Results are grouped by category
- [ ] Tabs are ordered by MRU
- [ ] Bookmarks can be found by folder path
- [ ] Empty query shows recent tabs and top sites
- [ ] All existing Vomnibar features still work
