// Synthetic pages to time how long link hints take to find what to hint, and a signature of what
// they found, so an optimization can show it finds exactly the same hints. Run through
// `./make.js bench-link-hints`, which loads this page in Chrome.

globalThis.vimiumDomTestsAreRunning = true;

const pixel = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";

const range = (n) => Array.from({ length: n }, (_, i) => i);

// Each shape returns the HTML of a page, and optionally a function to run once it's in the DOM.
const shapes = {
  // A social feed: a few cards in view, thousands below, each with a hidden menu and tooltip.
  feed: (n = 2000) => ({
    html: range(n).map((i) => `
      <article class="card">
        <div class="header">
          <a href="/u/${i}"><img alt="" src="${pixel}"></a>
          <span class="name">User ${i}</span> <a class="time" href="/p/${i}">${i % 59}m</a>
        </div>
        <div class="body">
          <p>Post ${i}: some text <a href="/tag/${i % 97}">#tag${i % 97}</a>, <b>bold</b> and
          <i>italic</i> words to read.</p>
        </div>
        <div class="actions">${
      ["reply", "repost", "like", "share"].map((action) => `
          <div role="button" tabindex="0" class="action-btn" aria-label="${action}">
            <svg viewBox="0 0 16 16"><path d="M1 1h14v14H1z"/></svg><span>${i % 13}</span>
          </div>`).join("")
    }
        </div>
        <div class="menu" hidden>
          <a href="/report/${i}">Report</a><a href="/mute/${i}">Mute</a><button>Block</button>
        </div>
        <span class="tooltip">Tooltip ${i}</span>
      </article>`).join(""),
  }),

  // A site menu of thousands of links hidden until hovered, over an article.
  hiddenMenus: (menus = 40, linksPerMenu = 100) => ({
    html: `<nav>${
      range(menus).map((m) => `
        <div class="menu-item"><a href="/section/${m}">Section ${m}</a>
          <ul style="display: none">${
        range(linksPerMenu).map((l) => `<li><a href="/section/${m}/${l}">Page ${l}</a></li>`)
          .join("")
      }</ul>
        </div>`).join("")
    }</nav>
    <main>${
      range(300).map((p) =>
        `<p>Paragraph ${p} links to <a href="/a/${p}">one page</a> and <a href="/b/${p}">another</a>.</p>`
      ).join("")
    }</main>`,
  }),

  // A long data table, like an issue list or a diff.
  table: (rows = 3000) => ({
    html: `<table><tbody>${
      range(rows).map((r) => `
        <tr>
          <td><input type="checkbox"></td>
          <td><a href="/item/${r}">Item ${r}</a></td>
          <td><span class="label">open</span> <span class="label">bug</span></td>
          <td>${r * 7 % 1000} comments</td>
          <td><button class="btn">Edit</button></td>
        </tr>`).join("")
    }</tbody></table>`,
  }),

  // Chat-like panes, each scrolling its own list of messages.
  scrollers: (panes = 200, messages = 30) => ({
    html: range(panes).map((p) => `
      <div class="scroller">${
      range(messages).map((m) => `
          <div class="message"><a href="/user/${m}">user${m}</a> <span>message ${p}.${m}</span></div>`)
        .join("")
    }
      </div>`).join(""),
  }),

  // Web components: the hintable elements live in shadow roots, some nested, some slotted.
  shadow: (n = 1500) => ({
    html: range(n).map((i) =>
      `<x-card data-i="${i}"><a slot="title" href="/slotted/${i}">Slotted ${i}</a></x-card>`
    ).join(""),
    build() {
      for (const host of document.querySelectorAll("x-card")) {
        const i = host.dataset.i;
        host.attachShadow({ mode: "open" }).innerHTML = `
          <div class="c"><slot name="title"></slot> <button>Like ${i}</button>
            <a href="/s/${i}">Open</a> <span>text</span> <x-inner></x-inner></div>`;
        host.shadowRoot.querySelector("x-inner").attachShadow({ mode: "open" }).innerHTML =
          `<span role="button" tabindex="0">Inner ${i}</span>`;
      }
    },
  }),

  // A long document whose sections skip rendering until they come near the viewport, as
  // content-visibility: auto makes them.
  contentVisibility: (sections = 400) => ({
    html: range(sections).map((s) => `
      <section style="content-visibility: auto; contain-intrinsic-size: auto 600px">
        <h2><a href="#s${s}">Section ${s}</a></h2>${
      range(6).map((p) => `
        <p>Paragraph ${p} cites <a href="/ref/${s}/${p}/1">one</a>, <a href="/ref/${s}/${p}/2">two</a>
          and <a href="/ref/${s}/${p}/3">three</a> sources, and has a <button>button</button>.</p>`)
        .join("")
    }
      </section>`).join(""),
  }),

  // What the check for overlapping hints is for: a fixed header and a dialog over links, links
  // clipped by their container or wrapping across lines, and clickables nested in clickables.
  overlaps: () => ({
    html: `
      <header style="position: fixed; top: 0; left: 0; right: 0; height: 60px; background: #eee;
        z-index: 10"><a href="/home">Home</a> <button>Menu</button></header>
      <main style="padding-top: 40px; width: 600px">${
      range(60).map((i) => `
        <p>Line ${i} has <a href="/w/${i}">a link that is long enough to wrap onto the next line
          of this narrow column</a> and <span class="btn"><a href="/n/${i}">nested</a></span>.</p>
        <div style="overflow: hidden; height: 12px"><a href="/c/${i}">clipped<br>below</a></div>`)
        .join("")
    }</main>
      <div role="dialog" style="position: fixed; top: 200px; left: 100px; width: 300px;
        height: 200px; background: white; z-index: 5"><button>Close</button></div>`,
  }),
};

// All elements in the order link hints visit them, shadow roots included, mapped to their index.
function elementIndexes() {
  const indexes = new Map();
  const visit = (root) => {
    for (const element of root.querySelectorAll("*")) {
      indexes.set(element, indexes.size);
      if (element.shadowRoot) visit(element.shadowRoot);
    }
  };
  visit(document.documentElement);
  return indexes;
}

function signatureOf(hints) {
  const indexes = elementIndexes();
  const round = (n) => Math.round(n * 10) / 10;
  return hints.map((hint) => {
    const r = hint.rect;
    return [
      indexes.get(hint.element),
      indexes.get(hint.image) ?? "",
      round(r.left),
      round(r.top),
      round(r.width),
      round(r.height),
      hint.secondClassCitizen ? 1 : 0,
      hint.possibleFalsePositive ? 1 : 0,
      hint.reason ?? "",
    ].join(",");
  }).join("\n");
}

// FNV-1a, to print a short fingerprint of a signature.
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// The page is a single frame, so the coordinator's messages to the background page and the other
// frames come straight back to it, as in dom_tests.js.
HintCoordinator.sendMessage = (name, request = {}) => {
  HintCoordinator[name]?.(request);
  return request;
};

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)));

const median = (times) => times.slice().sort((a, b) => a - b)[Math.floor(times.length / 2)];

async function run(shapeName, runs = 7) {
  await Settings.onLoaded();
  globalThis.windowIsFocused = () => true;
  const shape = shapes[shapeName]();
  document.body.innerHTML = shape.html;
  shape.build?.();
  globalThis.scrollTo(0, 0);
  // Pressing f on a page usually finds its layout done, so do it before timing.
  document.body.offsetHeight;
  await nextFrame();

  // Finding the hints.
  const times = [];
  let hints;
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    hints = LocalHints.getLocalHints(false);
    times.push(performance.now() - start);
  }

  // All of pressing f: finding the hints, showing their markers, and the frame that paints them.
  const activationTimes = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    HintCoordinator.getHintDescriptors({ modeIndex: 0 });
    HintCoordinator.activateMode({
      frameIdToHintDescriptors: {},
      modeIndex: 0,
      originatingFrameId: frameId,
    });
    await nextFrame();
    activationTimes.push(performance.now() - start);
    HintCoordinator.linkHintsMode.deactivateMode();
    await nextFrame();
  }

  const signature = signatureOf(hints);
  return {
    shape: shapeName,
    elements: elementIndexes().size,
    hints: hints.length,
    firstMs: times[0],
    medianMs: median(times),
    activationMs: median(activationTimes),
    signature: hash(signature),
    fullSignature: signature,
  };
}

globalThis.linkHintsBenchmark = { shapes: Object.keys(shapes), run };
