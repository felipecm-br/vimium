// Utilities which help us compute a relevancy score for a given item.

// deno-lint-ignore no-control-regex
const nonAsciiRegexp = /[^\x00-\x7f]/;
const combiningDiacriticsRegexp = /[\u0300-\u036f]/g;
const isCombiningMark = (code) => code >= 0x0300 && code <= 0x036f;

// Strips diacritical marks ("Relatório" -> "Relatorio") so ASCII queries match accented titles
// and URLs. Pure ASCII strings skip normalization with zero allocation.
export function foldDiacritics(string) {
  if (!string || !nonAsciiRegexp.test(string)) return string;
  return string.normalize("NFD").replace(combiningDiacriticsRegexp, "");
}

// True when `string` contains characters with diacritical marks (used for smart diacritics:
// typing an explicit accent like "café" stays strict, while "cafe" matches both).
export function hasDiacritics(string) {
  return Boolean(string && nonAsciiRegexp.test(string) && foldDiacritics(string) !== string);
}

// Folds `string` while keeping a mapping from each folded code-unit index back to the exact
// [start, end) range in `string`, so match highlighting stays aligned on both NFC and NFD text.
export function foldDiacriticsWithMap(string) {
  let folded = "";
  const starts = [];
  const ends = [];
  for (let i = 0; i < string.length;) {
    const start = i;
    const cp = string.codePointAt(i);
    i += cp > 0xffff ? 2 : 1;
    while (i < string.length && isCombiningMark(string.charCodeAt(i))) i++;
    const chunk = string.slice(start, i);
    const piece = nonAsciiRegexp.test(chunk)
      ? chunk.normalize("NFD").replace(combiningDiacriticsRegexp, "")
      : chunk;
    for (let k = 0; k < piece.length; k++) {
      folded += piece[k];
      starts.push(start);
      ends.push(i);
    }
  }
  return { folded, starts, ends };
}

// Splits `string` into word and CamelCase segments with exact [start, end) offsets in the
// original string. HTML entities (e.g. "&amp;") are skipped so match highlighting on escaped HTML
// never matches inside an entity name.
const htmlEntityRegexp = /&(?:#\d+|#x[\da-f]+|[a-z]+);/iy;
const wordCharRegexp = /[\p{L}\p{N}]/u;
const upperCharRegexp = /\p{Lu}/u;
const lowerOrDigitRegexp = /[\p{Ll}\p{N}]/u;
const acronymTermRegexp = /^[\p{L}\p{N}]{2,12}$/u;

function splitWordSegments(string, fold) {
  const { folded, starts, ends } = fold
    ? foldDiacriticsWithMap(string)
    : { folded: string, starts: null, ends: null };
  const segments = [];
  let i = 0;
  while (i < folded.length) {
    // Skip HTML entities in already-escaped display strings.
    if (folded[i] === "&") {
      htmlEntityRegexp.lastIndex = i;
      const entity = htmlEntityRegexp.exec(folded);
      if (entity) {
        i = htmlEntityRegexp.lastIndex;
        continue;
      }
    }
    if (!wordCharRegexp.test(folded[i])) {
      i++;
      continue;
    }
    const segStart = i;
    i++;
    while (i < folded.length && wordCharRegexp.test(folded[i])) {
      const prev = folded[i - 1];
      const curr = folded[i];
      const next = i + 1 < folded.length ? folded[i + 1] : "";
      // Split CamelCase boundaries: "Git|Hub" (lower->Upper) and "VS|Code" (Upper->Upper+lower).
      const lowerToUpper = lowerOrDigitRegexp.test(prev) && upperCharRegexp.test(curr);
      const acronymToWord = upperCharRegexp.test(prev) && upperCharRegexp.test(curr) &&
        next && lowerOrDigitRegexp.test(next);
      if (lowerToUpper || acronymToWord) break;
      i++;
    }
    segments.push({
      text: folded.slice(segStart, i),
      origStart: (idx) => (starts ? starts[segStart + idx] : segStart + idx),
      origEnd: (idx) => (ends ? ends[segStart + idx] : segStart + idx + 1),
    });
  }
  return segments;
}

// Matches `term` against word/CamelCase segment initials and segment prefixes (e.g. "gh" ->
// "GitHub", "vsc" -> "Visual Studio Code" or "VSCode", "cnt" -> "Create new tab").
// Requires spanning at least two segments (1-segment matches are already substrings).
// With `allowSkip: false` (default, for tabs/bookmarks/titles), transitions only move to the
// immediately adjacent segment so unrelated words across a URL never create false positives.
// With `allowSkip: true` (for Vimium's ~65 commands), later word initials may also match.
export function acronymRanges(term, string, { allowSkip = false } = {}) {
  if (!term || !string || string.length < term.length || !acronymTermRegexp.test(term)) {
    return null;
  }
  const fold = !hasDiacritics(term);
  const caseSensitive = Utils.hasUpperCase(term);
  const needle = caseSensitive ? term : term.toLowerCase();
  const segments = splitWordSegments(string, fold);
  if (segments.length < 2) return null;

  const segTexts = caseSensitive
    ? segments.map((s) => s.text)
    : segments.map((s) => s.text.toLowerCase());
  const ranges = [];

  const search = (ti, segIdx, charIdx, segCount) => {
    if (ti === needle.length) return segCount >= 2;
    const ch = needle[ti];
    // Option 1: continue matching contiguously inside the current segment.
    if (charIdx < segTexts[segIdx].length && segTexts[segIdx][charIdx] === ch) {
      const seg = segments[segIdx];
      ranges.push([seg.origStart(charIdx), seg.origEnd(charIdx)]);
      if (search(ti + 1, segIdx, charIdx + 1, segCount)) return true;
      ranges.pop();
    }
    // Option 2: jump to the start of the next segment (or any later segment when allowSkip is on).
    const maxNext = allowSkip ? segments.length - 1 : Math.min(segments.length - 1, segIdx + 1);
    for (let nextSeg = segIdx + 1; nextSeg <= maxNext; nextSeg++) {
      if (segTexts[nextSeg][0] === ch) {
        const seg = segments[nextSeg];
        ranges.push([seg.origStart(0), seg.origEnd(0)]);
        if (search(ti + 1, nextSeg, 1, segCount + 1)) return true;
        ranges.pop();
        if (allowSkip) break; // Prefer the earliest matching word initial.
      }
    }
    return false;
  };

  for (let startSeg = 0; startSeg < segments.length - 1; startSeg++) {
    if (segTexts[startSeg][0] !== needle[0]) continue;
    ranges.length = 0;
    const seg = segments[startSeg];
    ranges.push([seg.origStart(0), seg.origEnd(0)]);
    if (search(1, startSeg, 1, 1)) return ranges;
  }
  return null;
}

// Like matches(), but falls back to controlled segment-initial/acronym matching when a term isn't
// a contiguous substring (e.g. "gh vim" matching "GitHub" + "vimium", or ">cnt" matching
// "Create new tab"). Fast substring check always runs first.
export function fuzzyMatches(queryTerms, options, ...things) {
  let foldedThings = null;
  for (const term of queryTerms) {
    const regexp = RegexpCache.get(term);
    const fold = !hasDiacritics(term);
    let matchedTerm = false;
    for (let i = 0; i < things.length; i++) {
      let thing = things[i];
      if (!thing) continue;
      if (fold && nonAsciiRegexp.test(thing)) {
        foldedThings ??= things.map(foldDiacritics);
        thing = foldedThings[i];
      }
      if (regexp.test(thing)) {
        matchedTerm = true;
        break;
      }
    }
    if (!matchedTerm) {
      for (const thing of things) {
        if (thing && acronymRanges(term, thing, options) != null) {
          matchedTerm = true;
          break;
        }
      }
    }
    if (!matchedTerm) return false;
  }
  return true;
}

// Whether the given things (usually URLs or titles) match any one of the query terms.
// This is used to prune out irrelevant suggestions before we try to rank them, and for
// calculating word relevancy. Every term must match at least one thing.
export function matches(queryTerms, ...things) {
  let foldedThings = null;
  for (const term of queryTerms) {
    const regexp = RegexpCache.get(term);
    const fold = !hasDiacritics(term);
    let matchedTerm = false;
    for (let i = 0; i < things.length; i++) {
      // test(), not match(): no match array is allocated. These regexps have no "g" flag, so
      // test() is stateless.
      if (!matchedTerm) {
        let thing = things[i];
        if (fold && thing && nonAsciiRegexp.test(thing)) {
          foldedThings ??= things.map(foldDiacritics);
          thing = foldedThings[i];
        }
        matchedTerm = regexp.test(thing);
      }
    }
    if (!matchedTerm) return false;
  }
  return true;
}

// Weights used for scoring matches.
const matchWeights = {
  matchAnywhere: 1,
  matchStartOfWord: 1,
  matchWholeWord: 1,
  // The following must be the sum of the three weights above; it is used for normalization.
  maximumScore: 3,
  //
  // Calibration factor for balancing word relevancy and recency.
  recencyCalibrator: 2.0 / 3.0,
};

// The current value of 2.0/3.0 has the effect of:
//   - favoring the contribution of recency when matches are not on word boundaries ( because 2.0/3.0 > (1)/3     )
//   - favoring the contribution of word relevance when matches are on whole words  ( because 2.0/3.0 < (1+1+1)/3 )

// Calculate a score for matching term against string.
// The score is in the range [0, matchWeights.maximumScore], see above.
// Returns: [ score, count ], where count is the number of matched characters in string.
function scoreTerm(term, string) {
  const target = hasDiacritics(term) ? string : foldDiacritics(string);
  let score = 0;
  let count = 0;
  // Count the non-overlapping occurrences without allocating (this used string.split(), which
  // built an array per call; it runs for every history entry on every keystroke). The regexp is an
  // escaped literal without the "u" flag, so every match is exactly term.length code units long and
  // the matched character count is occurrences * term.length, as the split arithmetic gave.
  // An empty term would match the empty string forever, so it keeps the original arithmetic.
  let matched;
  if (term.length === 0) {
    const nonMatching = target.split(RegexpCache.get(term));
    matched = nonMatching.length > 1;
    count = nonMatching.reduce((p, c) => p - c.length, target.length);
  } else {
    const occurrences = RegexpCache.countMatches(term, target);
    matched = occurrences > 0;
    count = occurrences * term.length;
  }
  if (matched) {
    // Have match.
    score = matchWeights.matchAnywhere;
    if (RegexpCache.get(term, "\\b").test(target)) {
      // Have match at start of word.
      score += matchWeights.matchStartOfWord;
      if (RegexpCache.get(term, "\\b", "\\b").test(target)) {
        // Have match of whole word.
        score += matchWeights.matchWholeWord;
      }
    }
  } else if (acronymRanges(term, string) != null) {
    // Segment-initial match scores below word-start substring matches (2.0) so exact substrings
    // always outrank acronyms when both match.
    score = 1.5;
    count = term.length;
  }
  return [score, count < target.length ? count : target.length];
}

// Returns a number between [0, 1] indicating how often the query terms appear in the url and title.
export function wordRelevancy(queryTerms, url, title) {
  let titleCount, titleScore;
  let urlScore = (titleScore = 0.0);
  let urlCount = (titleCount = 0);
  // Calculate initial scores.
  for (const term of queryTerms) {
    let [s, c] = scoreTerm(term, url);
    urlScore += s;
    urlCount += c;
    if (title) {
      [s, c] = scoreTerm(term, title);
      titleScore += s;
      titleCount += c;
    }
  }

  const maximumPossibleScore = matchWeights.maximumScore * queryTerms.length;

  // Normalize scores.
  urlScore /= maximumPossibleScore;
  urlScore *= normalizeDifference(urlCount, url.length);

  if (title) {
    titleScore /= maximumPossibleScore;
    titleScore *= normalizeDifference(titleCount, title.length);
  } else {
    titleScore = urlScore;
  }

  // Prefer matches in the title over matches in the URL.
  // In other words, don't let a poor urlScore pull down the titleScore.
  // For example, urlScore can be unreasonably poor if the URL is very long.
  if (urlScore < titleScore) {
    urlScore = titleScore;
  }

  // Return the average.
  return (urlScore + titleScore) / 2;
}

// Untested alternative to the above:
//   - Don't let a poor urlScore pull down a good titleScore, and don't let a poor titleScore pull
//     down a good urlScore.
//
// return Math.max(urlScore, titleScore)

const oneMonthAgo = 1000 * 60 * 60 * 24 * 30;

// Returns a score between [0, 1] which indicates how recent the given timestamp is. Items which
// are over a month old are counted as 0. This range is quadratic, so an item from one day ago has
// a much stronger score than an item from two days ago.
export function recencyScore(lastAccessedTime) {
  const recency = Date.now() - lastAccessedTime;
  const recencyDifference = Math.max(0, oneMonthAgo - recency) / oneMonthAgo;

  // recencyScore is between [0, 1]. It is 1 when recenyDifference is 0. This quadratic equation
  // will incresingly discount older history entries.
  let recencyScore = recencyDifference * recencyDifference * recencyDifference;

  // Calibrate recencyScore vis-a-vis word-relevancy scores.
  return recencyScore *= matchWeights.recencyCalibrator;
}

// Takes the difference of two numbers and returns a number between [0, 1] (the percentage difference).
function normalizeDifference(a, b) {
  const max = Math.max(a, b);
  return (max - Math.abs(a - b)) / max;
}

// We cache regexps because we use them frequently when comparing a query to history entries and
// bookmarks, and we don't want to create fresh objects for every comparison.
export const RegexpCache = {
  init() {
    this.initialized = true;
    this.clear();
  },

  clear() {
    this.cache = {};
    this.byArguments = {};
  },

  // Get rexexp for `string` from cache, creating it if necessary.
  // Regexp meta-characters in `string` are escaped.
  // Regexp is wrapped in `prefix`/`suffix`, which may contain meta-characters (these are not
  // escaped).
  // With their default values, `prefix` and `suffix` have no effect.
  // Example:
  //   - string="go", prefix="\b", suffix=""
  //   - this returns regexp matching "google", but not "agog" (the "go" must occur at the start of
  //     a word)
  // TODO: `prefix` and `suffix` might be useful in richer word-relevancy scoring.
  get(string, prefix, suffix) {
    if (prefix == null) prefix = "";
    if (suffix == null) suffix = "";
    if (!this.initialized) this.init();
    // Fast path keyed by the raw arguments: this runs for every history entry on every keystroke,
    // and escaping the term and building the regexp source each time cost more than the match
    // itself. "\0" can't appear in a query term.
    const rawKey = prefix + "\0" + string + "\0" + suffix;
    const cached = this.byArguments[rawKey];
    if (cached) return cached;
    return (this.byArguments[rawKey] = this.build(string, prefix, suffix));
  },

  build(string, prefix, suffix) {
    let regexpString = Utils.escapeRegexSpecialCharacters(string);
    // Avoid cost of constructing new strings if prefix/suffix are empty (which is expected to be a
    // common case).
    if (prefix) regexpString = prefix + regexpString;
    if (suffix) regexpString = regexpString + suffix;
    // Smartcase: Regexp is case insensitive, unless `string` contains a capital letter (testing
    // `string`, not `regexpString`).
    return this.cache[regexpString] ||
      (this.cache[regexpString] = new RegExp(regexpString, Utils.hasUpperCase(string) ? "" : "i"));
  },

  // The number of non-overlapping occurrences of `string` (escaped, smartcase as in get()) in
  // `text`. Uses a cached global regexp; lastIndex is reset on every call.
  countMatches(string, text) {
    if (!this.initialized) this.init();
    const key = "\0g" + string;
    const regexp = this.cache[key] ||
      (this.cache[key] = new RegExp(
        Utils.escapeRegexSpecialCharacters(string),
        Utils.hasUpperCase(string) ? "g" : "gi",
      ));
    if (string.length === 0) throw new Error("countMatches needs a non-empty string.");
    regexp.lastIndex = 0;
    let n = 0;
    while (regexp.test(text)) n++;
    return n;
  },
};
