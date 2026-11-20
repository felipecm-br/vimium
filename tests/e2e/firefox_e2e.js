// End-to-end tests in Firefox: the extension installed as a temporary add-on, driven by keyboard.
//
// WebDriver BiDi doesn't reach into the Vomnibar's frame (an extension page), so these check what
// shows from outside it: the state of the frame's element, the tabs, where a tab went, the hint
// markers. vomnibar_e2e.js tests the Vomnibar itself, in Chrome.
//
// Only the local server can be reached: every other request goes to a proxy on a closed port
// (Firefox never proxies localhost), so a search or a default top site goes nowhere.
//
// After the extension navigates a tab, Puppeteer's page.goto on it can hang in Firefox, so a test
// that needs another page after that opens a new tab.

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function pageHtml(path) {
  const title = `Page ${path}`;
  return `<!doctype html><meta charset="utf-8"><title>${title}</title><h1>${title}</h1>
    <p><a href="/b">a link</a> <a href="/c">another</a> <a href="/d">a third</a></p>`;
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

function assertEqual(expected, actual, message = "") {
  const e = JSON.stringify(expected);
  const a = JSON.stringify(actual);
  if (e !== a) throw new Error(`${message}\n  expected: ${e}\n  actual:   ${a}`);
}

// page.goto, again once if Firefox aborted it (NS_BINDING_ABORTED) for a navigation of its own.
async function goto(page, url) {
  try {
    await page.goto(url);
  } catch {
    await sleep(500);
    await page.goto(url);
  }
}

async function waitFor(condition, timeout = 3000) {
  for (let waited = 0; waited < timeout; waited += 100) {
    const value = await condition();
    if (value) return value;
    await sleep(100);
  }
  return null;
}

// "hidden" or "visible": the state of the Vomnibar frame's element in the page, or null if none.
function vomnibarState(page) {
  return page.evaluate(() => {
    const host = [...document.documentElement.children].find((e) =>
      e.shadowRoot?.querySelector("iframe.vomnibar-frame")
    );
    const iframe = host?.shadowRoot.querySelector("iframe.vomnibar-frame");
    if (!iframe) return null;
    return iframe.classList.contains("vimium-ui-component-visible") ? "visible" : "hidden";
  });
}

// Opens OmniSearch on `page` and types `query`.
async function openVomnibar(page, query) {
  // Keys do nothing until Vimium has started on the page, which is when it loads the Vomnibar's
  // frame, ahead.
  if (!(await waitFor(() => vomnibarState(page)))) throw new Error("Vimium never started.");
  await page.keyboard.press("t");
  if (!(await waitFor(async () => (await vomnibarState(page)) === "visible"))) {
    throw new Error("The Vomnibar never showed.");
  }
  await sleep(300);
  await page.keyboard.type(query, { delay: 30 });
  // The results come from the background page.
  await sleep(800);
}

test("the Vomnibar's frame loads ahead, hidden, and t shows it", async ({ page, base }) => {
  await goto(page, base + "/");
  assertEqual("hidden", await waitFor(() => vomnibarState(page)), "before t");
  await openVomnibar(page, "");
  await page.keyboard.press("Escape");
});

test("t: > runs one of Vimium's commands", async ({ page, base, browser }) => {
  await goto(page, base + "/");
  const before = (await browser.pages()).length;
  await openVomnibar(page, ">create new tab");
  await page.keyboard.press("Enter");
  const after = await waitFor(async () => {
    const count = (await browser.pages()).length;
    return count > before ? count : null;
  });
  assertEqual(before + 1, after, "tabs");
});

test("t: @ reopens a recently closed tab", async ({ page, base, browser }) => {
  const closing = await browser.newPage();
  await goto(closing, base + "/closed-page");
  await closing.close();
  await page.bringToFront();
  await goto(page, base + "/");
  await openVomnibar(page, "@closed");
  await page.keyboard.press("Enter");
  const reopened = await waitFor(async () =>
    (await browser.pages()).find((p) => p.url() === base + "/closed-page")
  );
  if (!reopened) throw new Error("The closed tab wasn't reopened.");
  await reopened.close();
});

// The second row for "pag" is a page (the first is the web search): once opened from there, it's
// the first row the next time, which Enter opens.
test("t: what was opened for a text comes first the next time", async ({ page, base, browser }) => {
  await goto(page, base + "/");
  await openVomnibar(page, "pag");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  const chosen = await waitFor(() => page.url() !== base + "/" && page.url());
  // Closed, so the choice comes back from the history: an open tab would be switched to instead.
  await page.close();
  const next = await browser.newPage();
  await next.bringToFront();
  await goto(next, base + "/");
  await openVomnibar(next, "pag");
  await next.keyboard.press("Enter");
  assertEqual(chosen, await waitFor(() => next.url() !== base + "/" && next.url()));
  await next.close();
});

test("f: a hint for each link, and typing one follows it", async ({ page, base }) => {
  await goto(page, base + "/");
  await waitFor(() => vomnibarState(page)); // Vimium has started on the page.
  await page.keyboard.press("f");
  const hints = await waitFor(() =>
    page.evaluate(() => {
      const markers = [...document.querySelectorAll(".vimiumHintMarker")];
      return markers.length > 0 ? markers.map((m) => m.textContent) : null;
    })
  );
  assertEqual(3, hints?.length, "markers for the page's three links");
  await page.keyboard.type(hints[0].toLowerCase(), { delay: 50 });
  const followed = await waitFor(() => page.url() !== base + "/" && page.url());
  if (![base + "/b", base + "/c", base + "/d"].includes(followed)) {
    throw new Error(`Typing the hint went to ${followed}.`);
  }
});

// Runs the tests above. `extensionPath` is a copy of the extension with Firefox's manifest, and
// `executablePath` is optional (Puppeteer finds its own Firefox otherwise).
export async function runFirefoxE2ETests({ puppeteer, extensionPath, executablePath }) {
  const server = Deno.serve({ port: 0, onListen() {} }, (req) => {
    const url = new URL(req.url);
    return new Response(pageHtml(url.pathname), { headers: { "content-type": "text/html" } });
  });
  const base = `http://localhost:${server.addr.port}`;
  const browser = await puppeteer.launch({
    browser: "firefox",
    headless: true,
    executablePath,
    extraPrefsFirefox: {
      "network.proxy.type": 1,
      "network.proxy.http": "127.0.0.1",
      "network.proxy.http_port": 9,
      "network.proxy.ssl": "127.0.0.1",
      "network.proxy.ssl_port": 9,
      "network.proxy.no_proxies_on": "localhost",
    },
  });
  let passed = 0;
  let failed = 0;
  try {
    await browser.installExtension(extensionPath);
    // Installing, the background page injects the content scripts into the open tabs.
    await sleep(1000);
    // Kept open throughout: closing a window's last tab can close the window.
    const keeper = (await browser.pages())[0] ?? await browser.newPage();
    // History to search through.
    const setup = await browser.newPage();
    for (const path of ["/b", "/c", "/"]) await goto(setup, base + path);
    await setup.close();

    for (const { name, fn } of tests) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 800 });
      // A new tab doesn't get the keyboard until it's in front.
      await page.bringToFront();
      try {
        await fn({ browser, page, base });
        passed++;
        console.log(`  pass  ${name}`);
      } catch (error) {
        failed++;
        console.log(`  FAIL  ${name}\n${error.message}`);
      } finally {
        for (const p of await browser.pages()) {
          if (p !== page && p !== keeper) await p.close().catch(() => {});
        }
        await page.close().catch(() => {});
      }
    }
  } finally {
    await browser.close();
    await server.shutdown();
  }
  console.log(`${failed == 0 ? "Pass" : "Fail"} (${passed}/${passed + failed})`);
  return failed == 0;
}
