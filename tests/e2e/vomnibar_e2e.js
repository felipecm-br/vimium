// End-to-end tests: Chrome with the extension loaded, driven like a user would.
//
// Unit and DOM tests run the Vomnibar page on its own, with the background page stubbed out. These
// load the real extension, so they catch what only shows up when the pieces meet: a click that
// never reached a handler, Enter ignored by one completer, results ordered by the background page.
//
// Pages come from a local server, so history is made by visiting them. Bookmarks are created
// through the extension's service worker. Searches go to the browser's default engine (Google), and
// requests to it are answered locally, so nothing leaves the machine.

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
        (document.documentElement.dataset.vomnibarEffects === "fast" &&
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

test("t: Enter with no matches searches the web", async ({ page, base }) => {
  await page.goto(base + "/");
  const frame = await openVomnibar(page, "t", "zzqq nomatch");
  assertEqual([{ text: "zzqq nomatch", selected: true, kind: "web" }], await rows(frame));
  await Promise.all([page.waitForNavigation(), page.keyboard.press("Enter")]);
  const url = new URL(page.url());
  assertEqual(["www.google.com", "zzqq nomatch"], [url.hostname, url.searchParams.get("q")]);
});

// In b (bookmarks) the selection starts empty, and nothing but this row is offered.
test("b: Down then Enter reaches the web search when nothing matches", async ({ page, base }) => {
  await page.goto(base + "/");
  const frame = await openVomnibar(page, "b", "zzqq nomatch");
  await page.keyboard.press("ArrowDown");
  assertEqual([{ text: "zzqq nomatch", selected: true, kind: "web" }], await rows(frame));
  await Promise.all([page.waitForNavigation(), page.keyboard.press("Enter")]);
  assertEqual("zzqq nomatch", new URL(page.url()).searchParams.get("q"));
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
  const { page, base, browser } = ctx;
  const rustTab = await browser.newPage();
  await rustTab.goto(base + "/rust.html");
  await page.bringToFront();
  await page.goto(base + "/");
  const frame = await openVomnibar(page, "t", "rust");
  assertEqual("page", (await rows(frame))[0].kind, "a page is selected");
  await page.keyboard.down("Alt");
  await Promise.all([page.waitForNavigation(), page.keyboard.press("Enter")]);
  await page.keyboard.up("Alt");
  assertEqual("rust", new URL(page.url()).searchParams.get("q"));
  await rustTab.close();
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

test("t: picking the Fast effects level makes the next Vomnibar open without motion", async (ctx) => {
  const { page, base } = ctx;
  await page.goto(base + "/");
  await openVomnibar(page, "t", "effects fast");
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
  if (!next) throw new Error("The Vomnibar never opened after picking Fast.");
  const state = await next.evaluate(() => ({
    level: document.documentElement.dataset.vomnibarEffects,
    sliding: document.getElementById("vomnibar").classList.contains("vomnibar-slide-in"),
    moving: document.getAnimations().filter((a) => a.playState === "running").length,
  }));
  assertEqual({ level: "fast", sliding: false, moving: 0 }, state);
  // Back to Full for any later test.
  await page.keyboard.type("effects full");
  await sleep(300);
  await page.keyboard.press("Enter");
  await sleep(300);
});

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
    args: ["--no-first-run", "--no-default-browser-check"],
  });
  let passed = 0;
  let failed = 0;
  try {
    const workerTarget = await browser.waitForTarget(
      (t) => t.type() === "service_worker" && t.url().includes("background_scripts/main.js"),
    );
    const worker = await workerTarget.worker();

    // A fresh tab per test, so one test's failure doesn't leave state for the next. Requests to the
    // default search engine are answered locally: searches show up as a navigation to its URL.
    const newPage = async () => {
      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 800 });
      await page.setRequestInterception(true);
      page.on("request", (request) => {
        if (new URL(request.url()).hostname.endsWith("google.com")) {
          request.respond({ contentType: "text/html", body: pageHtml("Search results") });
        } else {
          request.continue();
        }
      });
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
