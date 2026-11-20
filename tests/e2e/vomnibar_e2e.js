// End-to-end tests: Chrome with the extension loaded, driven like a user would.
//
// Unit and DOM tests run the Vomnibar page on its own, with the background page stubbed out. These
// load the real extension, so they catch what only shows up when the pieces meet: a click that
// never reached a handler, Enter ignored by one completer, results ordered by the background page.
//
// Pages come from a local server, so history is made by visiting them. Bookmarks are created
// through the extension's service worker. Searches go to the browser's default engine (Google),
// whose host never resolves, so nothing leaves the machine: a search shows up as the URL of the tab
// that failed to load it. Request interception can't stand in for this: Chrome doesn't report the
// navigation chrome.search.query makes, only its redirects.

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The query of the web search the tab running the test tried to open, or null if there is none.
async function searchedQuery(worker) {
  for (let waited = 0; waited < 2000; waited += 100) {
    const urls = await worker.evaluate(async () =>
      (await chrome.tabs.query({ url: "*://*.google.com/*" })).map((tab) => tab.url)
    );
    const query = urls.map((url) => new URL(url).searchParams.get("q")).find((q) => q != null);
    if (query != null) return query;
    await sleep(100);
  }
  return null;
}

const pages = {
  "/": "Start page",
  "/b.html": "Pagina B",
  // Not "Rust Book": once Chrome counts it as a top site, it would rightly win "rust book" below.
  "/rust.html": "The Rust Programming Language",
  "/react.html": "React Hooks Guide",
  "/search.html?q=rust+book": "rust book - Pesquisa Google",
};

function pageHtml(title) {
  return `<!doctype html><meta charset="utf-8"><title>${title}</title><h1>${title}</h1>`;
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

function assertEqual(expected, actual, message = "") {
  const e = JSON.stringify(expected);
  const a = JSON.stringify(actual);
  if (e !== a) throw new Error(`${message}\n  expected: ${e}\n  actual:   ${a}`);
}

// Opens the Vomnibar with `key` on `page`, types `query` and returns its frame once results show.
async function openVomnibar(page, key, query) {
  // The content scripts may still be starting after a navigation: retry until the key opens it.
  let frame = null;
  for (let attempt = 0; attempt < 10 && !frame; attempt++) {
    await page.keyboard.press(key);
    frame = await waitForVomnibarFrame(page, 500);
  }
  if (!frame) throw new Error("The Vomnibar never opened.");
  await frame.waitForFunction(() => document.activeElement?.tagName === "INPUT");
  await page.keyboard.type(query, { delay: 20 });
  await frame.waitForFunction(
    (q) => {
      const input = document.querySelector("#vomnibar input");
      return input?.value === q && document.querySelectorAll("#vomnibar-results li").length > 0;
    },
    { timeout: 5000 },
    query,
  );
  // Let a pending filter request for an earlier prefix settle.
  await sleep(300);
  return frame;
}

// The Vomnibar's frame once it is shown, or null after `timeout` ms.
async function waitForVomnibarFrame(page, timeout) {
  for (let waited = 0; waited < timeout; waited += 100) {
    const frame = page.frames().find((f) => f.url().includes("vomnibar_page.html"));
    const shown = frame &&
      await frame.evaluate(() =>
        document.querySelector("#vomnibar")?.classList.contains("vomnibar-slide-in") ||
        (["quick", "fast"].includes(document.documentElement.dataset.vomnibarEffects) &&
          document.activeElement?.tagName === "INPUT")
      ).catch(() => false);
    if (shown) return frame;
    await sleep(100);
  }
  return null;
}

// The visible rows: { text, selected, kind } where kind is "web" for the search-the-web row.
function rows(frame) {
  return frame.evaluate(() =>
    [...document.querySelectorAll("#vomnibar-results li")].map((li) => ({
      text: li.querySelector(".title")?.textContent.trim(),
      selected: li.classList.contains("selected"),
      kind: li.querySelector(".url")?.textContent.trim() === "Search the web" ? "web" : "page",
    }))
  );
}

async function closeVomnibar(page) {
  await page.keyboard.press("Escape");
  await sleep(400);
}

test("o: clicking a result opens it", async ({ page, base }) => {
  await page.goto(base + "/");
  const frame = await openVomnibar(page, "o", "pagina");
  const items = await frame.$$("#vomnibar-results li");
  const titles = await rows(frame);
  const index = titles.findIndex((r) => r.text === "Pagina B");
  if (index < 0) throw new Error(`"Pagina B" is not listed: ${JSON.stringify(titles)}`);
  await Promise.all([page.waitForNavigation(), items[index].click()]);
  assertEqual(base + "/b.html", page.url());
});

test("t: Enter with no matches searches the web", async ({ page, base, worker }) => {
  await page.goto(base + "/");
  const frame = await openVomnibar(page, "t", "zzqq nomatch");
  assertEqual([{ text: "zzqq nomatch", selected: true, kind: "web" }], await rows(frame));
  await page.keyboard.press("Enter");
  assertEqual("zzqq nomatch", await searchedQuery(worker));
});

// In b (bookmarks) the selection starts empty, and nothing but this row is offered.
test("b: Down then Enter reaches the web search when nothing matches", async (ctx) => {
  const { page, base, worker } = ctx;
  await page.goto(base + "/");
  const frame = await openVomnibar(page, "b", "zzqq nomatch");
  await page.keyboard.press("ArrowDown");
  assertEqual([{ text: "zzqq nomatch", selected: true, kind: "web" }], await rows(frame));
  await page.keyboard.press("Enter");
  assertEqual("zzqq nomatch", await searchedQuery(worker));
});

test("t: an open tab that matches strongly comes before the web search", async (ctx) => {
  const { page, base, browser } = ctx;
  const rustTab = await browser.newPage();
  await rustTab.goto(base + "/rust.html");
  await page.bringToFront();
  await page.goto(base + "/");
  const frame = await openVomnibar(page, "t", "rust");
  const list = await rows(frame);
  assertEqual({ text: "The Rust Programming Language", selected: true, kind: "page" }, list[0]);
  assertEqual("web", list.at(-1).kind, "the web search is last");
  await closeVomnibar(page);
  await rustTab.close();
});

test("t: a results page or a bookmark's folder never outranks the web search", async (ctx) => {
  const { page, base, browser, worker } = ctx;
  const resultsTab = await browser.newPage();
  await resultsTab.goto(base + "/search.html?q=rust+book");
  await worker.evaluate(async (url) => {
    const folder = await chrome.bookmarks.create({ parentId: "1", title: "dev" });
    await chrome.bookmarks.create({
      parentId: folder.id,
      title: "lazygitrs: a faster lazygit in rust, with ai commit messages",
      url,
    });
  }, base + "/lazygitrs.html");
  await page.bringToFront();
  await page.goto(base + "/");
  for (const query of ["rust book", "rust c"]) {
    const frame = await openVomnibar(page, "t", query);
    assertEqual({ text: query, selected: true, kind: "web" }, (await rows(frame))[0], query);
    await closeVomnibar(page);
  }
  await resultsTab.close();
});

test("t: Alt+Enter searches the web even when a page is selected", async (ctx) => {
  const { page, base, browser, worker } = ctx;
  const rustTab = await browser.newPage();
  await rustTab.goto(base + "/rust.html");
  await page.bringToFront();
  await page.goto(base + "/");
  const frame = await openVomnibar(page, "t", "rust");
  assertEqual("page", (await rows(frame))[0].kind, "a page is selected");
  await page.keyboard.down("Alt");
  await page.keyboard.press("Enter");
  await page.keyboard.up("Alt");
  assertEqual("rust", await searchedQuery(worker));
  await rustTab.close();
});

test("t: a page opened after typing a letter comes first the next time", async ({ page, base }) => {
  await page.goto(base + "/");
  let frame = await openVomnibar(page, "t", "p");
  const before = await rows(frame);
  // The last page listed, so the choice has to move it up. Not the page the tab is on.
  const index = before.findLastIndex((r) => r.kind === "page" && r.text !== "Start page");
  if (index < 1) {
    throw new Error(`Nothing to choose below the first row: ${JSON.stringify(before)}`);
  }
  for (let i = 0; i < index; i++) await page.keyboard.press("ArrowDown");
  await Promise.all([page.waitForNavigation(), page.keyboard.press("Enter")]);
  await page.goto(base + "/");
  frame = await openVomnibar(page, "t", "p");
  assertEqual({ text: before[index].text, selected: true, kind: "page" }, (await rows(frame))[0]);
  await closeVomnibar(page);
});

test("t: shift-delete forgets a visited page", async ({ page, base, worker }) => {
  await page.goto(base + "/");
  const frame = await openVomnibar(page, "t", "react hooks");
  const list = await rows(frame);
  const index = list.findIndex((r) => r.text === "React Hooks Guide");
  if (index < 0) throw new Error(`"React Hooks Guide" is not listed: ${JSON.stringify(list)}`);
  for (let i = 0; i < index; i++) await page.keyboard.press("ArrowDown");
  await page.keyboard.down("Shift");
  await page.keyboard.press("Delete");
  await page.keyboard.up("Shift");
  await sleep(300);
  const remaining = await worker.evaluate(
    async (url) => (await chrome.history.getVisits({ url })).length,
    base + "/react.html",
  );
  assertEqual(0, remaining, "visits left in history");
  await closeVomnibar(page);
});

// Fast: nothing moves. Quick: opens at once too, but the border keeps rotating.
for (const [level, expectedAnimations] of [["Fast", []], ["Quick", ["border-rotate"]]]) {
  test(`t: picking the ${level} effects level makes the next Vomnibar open at once`, async (ctx) => {
    const { page, base } = ctx;
    await page.goto(base + "/");
    await openVomnibar(page, "t", `effects ${level.toLowerCase()}`);
    await page.keyboard.press("Enter");
    await sleep(500);
    await page.goto(base + "/b.html");
    // The new page's Vomnibar picks the level up from Settings.
    let next = null;
    for (let attempt = 0; attempt < 10 && !next; attempt++) {
      await page.keyboard.press("t");
      await sleep(400);
      next = page.frames().find((f) => f.url().includes("vomnibar_page.html"));
      const open = next && await next.evaluate(() => document.activeElement?.tagName === "INPUT");
      if (!open) next = null;
    }
    if (!next) throw new Error(`The Vomnibar never opened after picking ${level}.`);
    const state = await next.evaluate(() => ({
      level: document.documentElement.dataset.vomnibarEffects,
      sliding: document.getElementById("vomnibar").classList.contains("vomnibar-slide-in"),
      running: document.getAnimations().filter((a) => a.playState === "running")
        .map((a) => a.animationName),
    }));
    assertEqual({ level: level.toLowerCase(), sliding: false, running: expectedAnimations }, state);
    // Back to Full for any later test.
    await page.keyboard.type("effects full");
    await sleep(300);
    await page.keyboard.press("Enter");
    await sleep(300);
  });
}

// Runs the tests above. `puppeteer` is the module make.js uses; returns whether all passed.
export async function runE2ETests({ puppeteer, extensionPath }) {
  const server = Deno.serve({ port: 0, onListen() {} }, (req) => {
    const url = new URL(req.url);
    const title = pages[url.pathname + url.search] ?? pages[url.pathname] ?? url.pathname;
    return new Response(pageHtml(title), { headers: { "content-type": "text/html" } });
  });
  const base = `http://localhost:${server.addr.port}`;

  const browser = await puppeteer.launch({
    headless: true,
    pipe: true,
    enableExtensions: [extensionPath],
    args: [
      "--no-first-run",
      "--no-default-browser-check",
      // Searches go nowhere; see the comment at the top of this file.
      "--host-resolver-rules=MAP *.google.com ~NOTFOUND",
    ],
  });
  let passed = 0;
  let failed = 0;
  try {
    const workerTarget = await browser.waitForTarget(
      (t) => t.type() === "service_worker" && t.url().includes("background_scripts/main.js"),
    );
    const worker = await workerTarget.worker();

    // A fresh tab per test, so one test's failure doesn't leave state for the next.
    const newPage = async () => {
      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 800 });
      return page;
    };

    // History to search through: visit the pages once.
    const setup = await newPage();
    for (const path of Object.keys(pages)) await setup.goto(base + path);
    await setup.close();

    for (const { name, fn } of tests) {
      const page = await newPage();
      try {
        await fn({ browser, page, base, worker });
        passed++;
        console.log(`  pass  ${name}`);
      } catch (error) {
        failed++;
        console.log(`  FAIL  ${name}\n${error.message}`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
    await server.shutdown();
  }
  console.log(`${failed == 0 ? "Pass" : "Fail"} (${passed}/${passed + failed})`);
  return failed == 0;
}
