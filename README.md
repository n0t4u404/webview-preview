# webview-preview

See your UI the way your desktop app really renders it. `webview-preview` opens a page in the **same engine your app
runs on** — WebKitGTK on Linux, Edge (the WebView2 engine) on Windows, WebKit on macOS — runs a list of steps
(click, type, wait, measure) and saves PNG snapshots.

It is made for apps built on a system webview: **Tauri**, **Wails**, **Neutralinojs**. Their UI looks right in Chrome
during development and then breaks in the real window — a header that stops sticking, a font that falls back, a
backdrop blur that renders nothing, a date picker that looks nothing like the design. With `webview-preview` you
(or an AI agent working on your code) can check the real engine from the command line, without building and
starting the app.

```sh
npx webview-preview https://example.com snap:home
# → .webview-preview/webkitgtk-home.png  (on Linux)
```

**What it is — and what it is not.** A tool to *look at* a screen in the real engine: open it in the state you need,
press keys, measure, snap, compare with yesterday. Steps stay one-liners you can type in a terminal; mocks and
desktop stubs only say *what to answer* so the screen renders. It is not a test runner: no test suites, no stateful
mocks, no `expect` library, no retries. For end-to-end tests use Playwright Test or WebdriverIO — the stubs here are
plain init scripts and fit there too.

- [Which engine matches my app](#which-engine-matches-my-app)
- [Install](#install)
- [Quick start](#quick-start)
- [Config file](#config-file)
- [Steps](#steps)
- [Macros](#macros)
- [Errors in the page](#errors-in-the-page)
- [Command line](#command-line)
- [JavaScript API](#javascript-api)
- [Login, backend and other things outside the page](#login-backend-and-other-things-outside-the-page)
- [Desktop bridges: Tauri, Electron, Wails](#desktop-bridges-tauri-electron-wails)
- [Comparing with a baseline](#comparing-with-a-baseline)
- [Cleaning up snapshots](#cleaning-up-snapshots)
- [Recipes](#recipes)
- [Troubleshooting](#troubleshooting)
- [For AI agents](#for-ai-agents)

## Which engine matches my app

| Your app runs on | Engine it uses | `--engine` | How close |
|---|---|---|---|
| Tauri / Wails on **Linux** | WebKitGTK | `webkitgtk` | The same library your app loads — exact |
| Tauri / Wails on **Windows** | WebView2 (Edge, Chromium) | `msedge` | The same browser engine as WebView2 |
| Tauri / Wails on **macOS** | WKWebView (WebKit) | `webkit` | Playwright's WebKit build — close, not the system one |
| Electron, or just Chrome | Chromium | `chrome` / `chromium` | Exact for Chrome |

`--engine auto` (the default) picks the first row that fits the current computer: `webkitgtk` on Linux, `msedge` on
Windows, `webkit` on macOS.

To check another platform's engine from your machine, pass it explicitly — for example `--engine chrome` on Linux
gives you a Chromium picture close to what Windows users see.

## Install

```sh
npm i -D webview-preview
```

Then the engine for your system.

### Linux — WebKitGTK

WebKitGTK is driven through Python (GObject introspection). Install the bindings once:

```sh
# Debian, Ubuntu, Mint
sudo apt install python3-gi gir1.2-gtk-3.0 gir1.2-webkit2-4.1

# Fedora
sudo dnf install python3-gobject gtk3 webkit2gtk4.1

# Arch
sudo pacman -S python-gobject gtk3 webkit2gtk-4.1
```

These are the same `webkit2gtk-4.1` libraries Tauri 2 needs, so on a Tauri dev machine they are usually there already.
Check:

```sh
python3 -c "import gi; gi.require_version('WebKit2', '4.1'); print('ok')"
```

The page renders **off-screen** — no window shows up — but GTK still needs a display connection (under Wayland it uses
XWayland). On a server or CI without one, wrap the command in `xvfb-run`. Pass `--headed` to watch a real window.

### Windows — Edge

```sh
npm i -D playwright-core
```

Microsoft Edge is already installed on Windows 10 and 11; nothing else to download. Runs headless — no window shows.

### macOS — WebKit

```sh
npm i -D playwright-core
npx playwright install webkit
```

### Chrome or Chromium (any system)

`--engine chrome` uses your installed Google Chrome (`playwright-core` needed). `--engine chromium` uses Playwright's
own build: `npx playwright install chromium`.

## Quick start

A public page:

```sh
npx webview-preview https://example.com snap:home
```

Your app's dev server — say Vite on port 5173:

```sh
npx webview-preview http://localhost:5173 "js:document.querySelector('button').click()" snap:after-click
```

Each `snap:<name>` saves `<out>/<engine>-<name>.png` and prints its path. Each `print:<expression>` prints a value.
Exit code is `0` when every step ran and `1` otherwise.

## Config file

Put the things you repeat into `webview-preview.config.mjs` (or `.js`, `.json`) in the folder you run the command
from. Then you pass only a route and steps:

```js
// webview-preview.config.mjs
import { defineConfig } from "webview-preview";

export default defineConfig({
	baseUrl: "http://localhost:5173/#",
	server: {
		command: "npx vite --port 5173 --strictPort",
		port: 5173
	},
	size: "1200x650",
	out: ".tmp/preview"
});
```

```sh
npx webview-preview /settings snap:settings
```

| Field | What it does | Default |
|---|---|---|
| `baseUrl` | Put in front of a route that is not a full URL: `baseUrl + "/settings"`. End it with `#` for hash routers. | — |
| `server.command` | Started (through the shell) when nothing listens on `server.port`, stopped after the run. Already running? It is reused and left alone. | — |
| `server.port` | Port to wait for. | — |
| `server.host` | Host to wait on. | `localhost` |
| `server.cwd` | Folder for `server.command`. | the config's folder |
| `server.readyTimeoutMs` | How long to wait for the port. | `30000` |
| `engine` | See [engines](#which-engine-matches-my-app). | `auto` |
| `size` | Window size in CSS pixels, `WxH`. Several sizes — `"1200x650,800x600"` or a list — run the steps once per size; snapshots get the size in the name: `webkitgtk-800x600-page.png`. | `1200x650` |
| `colorScheme` | `prefers-color-scheme` for the page: `light` or `dark`. | system |
| `reducedMotion` | `prefers-reduced-motion: reduce` for the page. | `false` |
| `offline` / `latency` | Start offline / delay every `fetch` / XHR request by ms. See [Slow network and offline](#4-slow-network-and-offline). | `false` / `0` |
| `out` | Snapshot folder, relative to the config's folder. | `.webview-preview` |
| `prefix` | File name prefix. | `<engine>-` |
| `scale` | Device pixel ratio for Playwright engines (`2` = HiDPI). WebKitGTK: off-screen snapshots are 1×, `--headed` ones follow your screen. | `1` |
| `headed` | WebKitGTK: show a real window instead of rendering off-screen. | `false` |
| `snapMargin` | Room in CSS pixels around `snap:name@selector`, so focus rings and shadows fit. | `8` |
| `waitTimeout` | How long `waitfor:` waits, ms. | `10000` |
| `keepStorage` | WebKitGTK: keep `localStorage`, cookies and cache between runs. By default every run starts clean, like Playwright engines always do. | `false` |
| `compare` / `updateBaseline` / `baseline` / `maxDiffPixels` / `compareTolerance` | See [Comparing with a baseline](#comparing-with-a-baseline). | — |
| `init` | Code that runs **before the page's own scripts**, on every load: a string, `{ file: "path" }`, or a list of them. See [below](#1-init--set-things-up-before-the-app-starts). | — |
| `mock` | Answers for `fetch` / `XMLHttpRequest` requests: `{ "GET /api/me": { json: { … } } }`. See [below](#2-mock--answer-backend-requests). | — |
| `logRequests` | List every `fetch` / `XMLHttpRequest` request in `window.__webviewPreviewRequests` (also on whenever `mock` is set). | `false` |
| `tauri` | Stub the Tauri bridge: `true`, or `{ commands: { … }, label: "main" }`. See [Desktop bridges](#desktop-bridges-tauri-electron-wails). | — |
| `globals` | Objects to put on `window` before the page starts, by path: `{ "window.api": anyApi({ … }) }`. See [Desktop bridges](#desktop-bridges-tauri-electron-wails). | — |
| `locale` | `navigator.language` for the page, `en-US`, `ru-RU` … Playwright engines also switch `Intl` and `Accept-Language`; WebKitGTK only `navigator.language`. | system |
| `macros` | Named lists of steps, run with `macro:<name>`. See [Macros](#macros). | — |
| `failOnError` | Exit with 1 when the page logged `console.error` or threw. See [Errors in the page](#errors-in-the-page). | `false` |

Command-line options win over the config file.

### Examples

**Tauri + Vite** (Tauri's default dev port):

```js
export default {
	baseUrl: "http://localhost:1420",
	server: { command: "npx vite --port 1420 --strictPort", port: 1420 }
}
```

**Wails** (`wails dev` serves the frontend on 34115):

```js
export default {
	baseUrl: "http://localhost:34115",
	server: { command: "wails dev", port: 34115, readyTimeoutMs: 120000 }
}
```

**A built site from a folder:**

```js
export default {
	baseUrl: "http://localhost:4173",
	server: { command: "npx vite preview --port 4173 --strictPort", port: 4173 }
}
```

## Steps

Steps run one after another, after the page has loaded and settled for 1.5 s.

| Step | What it does |
|---|---|
| `js:<code>` | Runs JavaScript in the page, then waits 700 ms so animations and re-renders finish. |
| `jsnow:<code>` | Runs JavaScript and goes on at once — for measuring something right after an action. |
| `wait:<ms>` | Waits. |
| `waitfor:<selector>` | Waits until a matching element is **visible and has stopped moving** — same position, size and opacity in two checks 50 ms apart, so an element that slides or fades in is caught at its final place. Gives up after `--wait-timeout` (10 s) with an error. |
| `waitfor:!<selector>` | Waits until no matching element is visible — a spinner or skeleton is gone. |
| `snap:<name>` | Saves a PNG of the window. |
| `snap:<name>@<selector>` | Saves only the element matched by the CSS selector, plus `snapMargin` (8 px) around it. |
| `key:<key>` | Presses a key with the real keyboard: `Tab`, `Shift+Tab`, `Enter`, `Escape`, `ArrowDown`, `Control+a`, `x`. Keys: a character or `Tab Enter Escape Backspace Delete Insert Space Home End PageUp PageDown ArrowUp ArrowDown ArrowLeft ArrowRight F1–F12`; modifiers: `Shift Control Alt Meta`. |
| `type:<text>` | Types the text key by key (any language). Click or focus a field first. |
| `hover:<selector>` | Moves the real mouse to the middle of the element (scrolls it into view first). `:hover` styles and `mouseover` fire. |
| `click:<selector>` | Clicks the middle of the element with the real mouse — focus moves, `:active` and `:focus` apply like for a person. |
| `print:<expression>` | Prints the value: strings as they are, DOM elements as their HTML (first 200 characters), everything else as JSON. Promises are not awaited. |
| `measure:<selector>` | Prints one line about the element: how many match, position and size, margin / padding / border, visible or hidden, display, opacity, font, colours and text. |
| `offline` / `online` | Drops the connection for `fetch` / XHR and brings it back, with `navigator.onLine` and the events, then waits 700 ms like `js:`. See [Slow network and offline](#4-slow-network-and-offline). |
| `latency:<ms>` | Delays every `fetch` / XHR request from now on; `latency:0` turns it off. |
| `focusorder` / `focusorder:<n>` | Presses `Tab` with the real keyboard n times (20 by default) and prints where focus went, one line per stop — tag, role, name, label, "in dialog" — and `→ back to 1 after N stops` when it loops. Shows a focus trap, a skipped field or focus escaping a dialog at a glance. Starts from the current focus. |
| `assert:<expression>` | Checks that the expression is truthy: prints `assert ok: …`, or `assert failed: … — got <value>` / `— threw <message>` and makes the run exit with 1. The other steps still run. |
| `resize:<W>x<H>` | Resizes the window. |
| `macro:<name>` | Runs the steps of a macro from the config. See [Macros](#macros). |

### Selectors

Every step that takes a selector (`waitfor`, `measure`, `click`, `hover`, `snap:name@…`) accepts:

- **CSS**: `[role=dialog]`, `button[type=submit]`, `[class*=card]` (stable part of a hashed CSS-module class);
- **text**: `text=Save` — the innermost element whose whole text (spaces collapsed) is exactly `Save`. Handy for
  buttons, tabs and options; for a snapshot of the whole control prefer a CSS selector, because `text=` finds the
  label inside it.

When several elements match, the steps pick what a person would see: the first **visible** one (has a size, not
`visibility: hidden`, no fully transparent ancestor) and, for `click` / `hover` / `snap`, preferably the one that is
**on top** at its centre — not a copy hidden behind a dialog or inside a closed menu.

A failing `js:` or `print:` writes `js failed: …` / `print failed: …` to stderr and the run goes on. A selector that
matches nothing (or a hidden element) in `snap@`, `hover:` or `click:` writes an error, the run goes on, and the exit
code becomes `1`.

**`js:` vs the real input steps.** `js:document.querySelector('button').click()` runs the click handler, but no mouse
moves and no key is pressed: no `:hover`, no focus change, no `:focus-visible`. `click:`, `hover:`, `key:` and `type:`
go through the engine's real input path (GTK events in WebKitGTK, Playwright's mouse and keyboard elsewhere), so
focus moves on `Tab`, `:hover` styles apply and focus rings are painted — as for a person. The two engines produce the
same DOM events: `Shift+Tab` gives `keydown` `Shift`, then `Tab` with `shiftKey: true`.

Quote steps in the shell — they contain spaces, brackets and quotes:

```sh
npx webview-preview / \
  "js:document.querySelector('[data-test=open]').click()" \
  "print:document.querySelectorAll('[role=dialog]').length" \
  snap:dialog
```

On Windows PowerShell use the same double quotes; inside them, keep JavaScript strings in single quotes.

## Macros

Steps you repeat — signing in, opening a dialog — go into the config under a name:

```js
export default {
	macros: {
		signIn: [
			"js:location.hash = '#/sign-in'",
			"waitfor:input[name=email]",
			"click:input[name=email]",
			"type:demo@example.com",
			"click:input[name=password]",
			"type:secret",
			"click:button[type=submit]",
			"waitfor:[role=tab]"
		],
		openSettings: ["macro:signIn", "click:text=Settings", "waitfor:[role=dialog]"]
	}
}
```

```sh
npx webview-preview / macro:openSettings snap:settings
```

A macro may run other macros; one that runs itself stops with an error. Prefer real clicks and typing over setting
values from code: the run then goes through the same handlers, focus and validation as for a person.

## Errors in the page

Every run collects what went wrong inside the page — `console.error` calls, uncaught exceptions and unhandled promise
rejections — and prints them after the steps, the same message once with a count:

```
console.error: Failed to load {"code":500} (×2)
unhandled rejection: Error: no session — global code@http://localhost:5173/src/app.tsx:4:25
uncaught: TypeError: null is not an object (evaluating 'user.name') — onclick@http://localhost:5173/src/app.tsx:12:5
```

A blank snapshot usually has its reason here. With `--fail-on-error` (`failOnError: true`) the run exits with 1 when
there is anything to print — useful in CI. Pages opened from `file://` report uncaught errors only as
"Script error." in WebKit; serve the page over `http://` to see them.

## Command line

```
webview-preview [route-or-url] [steps...] [options]
```

| Option | |
|---|---|
| `--engine <name>` | `auto`, `webkitgtk`, `msedge`, `chrome`, `chromium`, `webkit` |
| `--size <WxH>` | Window size; several, comma-separated: `1200x650,800x600` |
| `--color-scheme <light\|dark>` | `prefers-color-scheme` for the page |
| `--reduced-motion` | `prefers-reduced-motion: reduce` for the page |
| `--offline` / `--latency <ms>` | Start offline / delay every `fetch` / XHR request |
| `--out <dir>` | Snapshot folder |
| `--prefix <text>` | File name prefix |
| `--scale <n>` | Device pixel ratio (Playwright engines) |
| `--headed` | WebKitGTK: show a real window |
| `--snap-margin <px>` | Room around `snap:name@selector` |
| `--wait-timeout <ms>` | How long `waitfor:` waits |
| `--keep-storage` | WebKitGTK: keep storage between runs |
| `--compare` / `--update-baseline` | Compare snapshots with baselines / replace the baselines |
| `--baseline <dir>` / `--max-diff-pixels <n>` / `--compare-tolerance <n>` | Baseline folder, allowed difference |
| `--base-url <url>` | Base for routes |
| `--init <code>` | Run code before the page's scripts (repeatable) |
| `--init-file <file>` | Same, from a file (repeatable) |
| `--mock-file <file>` | Mocks from a `.json` or `.mjs` file (repeatable, added to the config's `mock`) |
| `--log-requests` | Only list requests, answer nothing |
| `--tauri` | Stub the Tauri bridge (answers from `tauri.commands` in the config) |
| `--locale <tag>` | `navigator.language` for the page |
| `--fail-on-error` | Exit with 1 when the page logged `console.error` or threw |
| `--config <file>` | Use this config file |
| `--no-config` | Ignore config files |
| `-h`, `--help` / `-v`, `--version` | |

Add it to `package.json` so everyone runs it the same way:

```json
{
	"scripts": {
		"preview:ui": "webview-preview"
	}
}
```

```sh
npm run preview:ui -- /settings snap:settings
```

## JavaScript API

```js
import { preview } from "webview-preview";

const result = await preview({
	target: "/settings",
	steps: ["js:document.querySelector('#dark').click()", "snap:dark"],
	engine: "auto",
	log: { info: line => lines.push(line), error: console.error }
});

result.engine; // "webkitgtk"
result.saved;  // ["/abs/path/.webview-preview/webkitgtk-dark.png"]
result.failed; // false
```

`preview()` reads the config file the same way the CLI does; pass `config: false` to skip it or `config: "path"` to
choose one. Types are included.

## Login, backend and other things outside the page

A real app rarely shows the screen you want straight away: it checks a session and sends you to a login page, it
loads data from a server that may not be running, it calls the desktop side (Tauri's `invoke`). Do **not** add
"skip login" switches to the app for this — sooner or later such a switch ships in a release, and that is a hole.
Change what the page *receives* instead, only for the preview run:

| What stands in the way | Use |
|---|---|
| A session or token kept in `localStorage`, `sessionStorage`, cookies | [`init`](#1-init--set-things-up-before-the-app-starts) |
| Requests to your backend (`fetch`, `axios`, `XMLHttpRequest`) | [`mock`](#2-mock--answer-backend-requests) |
| You don't know yet what the app requests | [`--log-requests`](#3-find-out-what-the-app-requests) |
| Desktop APIs (Tauri `invoke`, Electron preload, Wails bindings) | [`tauri`, `globals`](#desktop-bridges-tauri-electron-wails) |
| Login that lives only in memory, or a flow you want to click through | steps, kept as a [macro](#macros): `macro:signIn` |

### 1. `init` — set things up before the app starts

`init` code runs in the page **before any of its scripts**, on every load and reload. Whatever it puts in place, the
app finds there on start — as if the user had logged in yesterday.

```js
// webview-preview.config.mjs
export default {
	baseUrl: "http://localhost:5173",
	init: [
		"localStorage.setItem('token', 'preview-token')",
		{ file: "preview/session.js" }
	]
}
```

```js
// preview/session.js — a file is easier for anything longer than a line
localStorage.setItem("user", JSON.stringify({ id: 1, nickname: "bodya", role: "admin" }));
document.cookie = "session=preview; path=/";
```

From the command line: `--init "<code>"` and `--init-file <file>`, both repeatable, added after the config's `init`.

- Each entry runs in its own block: `const` inside does not leak. To share something, put it on `window`.
- An entry that throws does not stop the run: you get `init failed: <entry>: <message>` before the first step.
- File paths in the config are relative to the config's folder; on the command line, to the current folder.

### 2. `mock` — answer backend requests

`mock` replaces `fetch` and `XMLHttpRequest` in the page (from `init`, before the app starts) and answers the requests
that match. Everything else goes to the network as usual.

```js
export default {
	baseUrl: "http://localhost:5173",
	init: "localStorage.setItem('token', 'preview-token')",
	mock: {
		"GET /api/me": { json: { nickname: "bodya", role: "admin" } },
		"GET /api/instances": { json: [{ id: 1, name: "Survival" }, { id: 2, name: "Creative" }] },
		"GET /api/instances/*": { json: { id: 1, name: "Survival", players: 12 } },
		"POST /api/login": { status: 401, json: { error: "wrong password" } },
		"DELETE /api/instances/*": { status: 204 },
		"/api/news": { json: [], delayMs: 1500 },
		"GET https://api.example.com/v1/**": { json: { ok: true } }
	}
}
```

**Keys** — `"METHOD path"` or just `"path"` for any method.

- The path is compared with the request's path; the query string is ignored unless the key has a `?`.
- `*` matches one path segment (`/api/items/*` → `/api/items/42`), `**` matches any number (`/api/**`).
- A key starting with `http://` / `https://` matches the full address (another origin).
- The first matching key wins.

**Answers** — an object with any of:

| Field | |
|---|---|
| `json` | Body as JSON, `content-type: application/json` is added |
| `body` | Body as text (instead of `json`) |
| `status` | HTTP status, default `200` |
| `headers` | Extra response headers |
| `delayMs` | Answer after this many milliseconds — for loading states |

Keep big mocks in a file: `--mock-file preview/mocks.json` (or `.mjs` with `export default { … }`). Files add to the
config's `mock`; for the same key, the later one wins.

**Use it to test the unhappy paths too:** a `500` for the error message, `delayMs: 3000` for the skeleton, an empty
list for the empty state, a `401` for the expired session.

### 3. Find out what the app requests

Before writing mocks, look at what the screen asks for:

```sh
npx webview-preview /dashboard --log-requests wait:2000 "print:__webviewPreviewRequests.join('\n')"
```

```
GET /api/me -> network
GET /api/instances?limit=20 -> network
POST /api/telemetry -> network
```

With `mock` set, the same list shows which requests were answered: `GET /api/me -> mock 200`. A request still marked
`-> network` that fails is the next one to mock.

### What `mock` does not cover

`WebSocket` and `EventSource`, requests made by service workers, `<img>` / `<script>` / CSS loads, and anything your
desktop side does by itself (a Tauri command that calls a server from Rust). For desktop calls, stub the bridge in
`init`; for the rest, run the real service locally.

### 4. Slow network and offline

How does the screen look while data is on its way, and what happens when the connection drops?

```sh
npx webview-preview /dashboard --latency 2000 wait:300 snap:loading wait:2500 snap:loaded
npx webview-preview /dashboard waitfor:.instance-card offline snap:offline online wait:1000 snap:back-online
```

| | |
|---|---|
| `latency:<ms>` step / `--latency <ms>` / `latency` in the config | Every `fetch` / XHR request waits that long first, answers from `mock` too. `latency:0` turns it off. |
| `offline` / `online` steps, `--offline` / `offline: true` | `navigator.onLine` turns `false`, the page gets the `offline` event, `fetch` rejects with `TypeError: Failed to fetch`, XHR fires `error`. `online` brings it all back and fires `online`. `--offline` starts that way; the page itself still loads. |

While offline, the request list shows `GET /api/me -> offline`. Like `mock`, this covers `fetch` and XHR only:
pictures, WebSocket and the desktop side keep their connection.


Your frontend calls the desktop side: Tauri's `invoke`, an Electron preload API, Wails bindings. Outside the app
there is no desktop side, so those calls fail — and the screen you want may never render. `webview-preview` puts a
stand-in in place before the page starts, so you open **your real entry page**, not a copy made for previews.

Every call to a stand-in is listed in `window.__webviewPreviewRequests`, next to `fetch` / XHR requests — print it
to see what the page asks for and what is still unanswered:

```sh
npx webview-preview / wait:2000 "print:__webviewPreviewRequests.join('\n')"
# invoke plugin:app|version -> stub
# invoke get_settings -> null
# call window.api.onUpdate -> default
```

### Tauri

```js
export default {
	baseUrl: "http://localhost:1420",
	server: { command: "npx vite --port 1420 --strictPort", port: 1420 },
	tauri: {
		commands: {
			"plugin:app|version": "1.4.0",
			get_settings: { theme: "dark" },
			greet: ({ name }) => `Hello, ${name}`
		}
	}
}
```

Or just `--tauri` on the command line. What you get (Tauri 2, `@tauri-apps/api`):

- `invoke` answers from `commands` — a value, or a function of the arguments (it may be `async`). A command not in
  the list gets `null`. Plugin commands are named as `@tauri-apps/api` sends them: `plugin:<plugin>|<command>`.
- Built-in answers you can override: `plugin:app|version` / `name` / `tauri_version`, window state
  (`plugin:window|is_maximized` → `false`, `is_focused` → `true`, `scale_factor`, `inner_size` …).
- Events work inside the page: `listen`, `once`, `emit`, `unlisten`. To act as the Rust side, emit from a step:
  `js:__webviewPreview.emit("download-progress", { percent: 40 })`.
- `getCurrentWindow()` / `getCurrentWebview()` get the label `main` (`label` changes it), `isTauri()` is `true`,
  `convertFileSrc` and `path.sep` work.

Functions in `commands` are copied into the page as source code, so they cannot use variables from the config
file — only their arguments and what is in the page.

### Electron, Wails and other bridges — `globals`

`globals` puts objects on `window` by path before the page starts. `anyApi()` is a stand-in that answers **any**
call: awaiting it gives `null`, calling the result works too (handy for "subscribe" functions that return an
"unsubscribe"). Pass the members you care about:

```js
import { anyApi, defineConfig } from "webview-preview";

export default defineConfig({
	globals: {
		// Electron: what your preload exposes with contextBridge.exposeInMainWorld("api", …)
		"window.api": anyApi({
			getVersion: async () => "1.4.0",
			platform: "linux"
		}),

		// Wails: generated bindings and the runtime
		"window.go": anyApi(),
		"window.runtime": anyApi()
	}
});
```

Plain values work as well: `"window.__APP_CONFIG__": { apiUrl: "http://localhost:3000" }`.

### What stays different

Real Rust, Node or Go is not involved: anything that depends on it shows what the stand-in answers. Window chrome,
native menus and dialogs are not there. That is the trade-off for checking a screen in seconds without building
the app.

## Comparing with a baseline

Save how a screen looks once, then let every later run tell you whether it changed:

```sh
npx webview-preview /settings snap:settings "snap:menu@[role=menu]" --compare
```

- **First run**: no baseline yet → the snapshots are copied to `webview-preview-baseline/` (next to the config).
  Commit that folder.
- **Next runs**: each snapshot is compared pixel by pixel with the baseline of the same name:

  ```
  compare webkitgtk-settings.png: same
  compare webkitgtk-menu.png: 499 px differ (0.06%) → .webview-preview/webkitgtk-menu.diff.png
  ```

  The `.diff.png` shows the snapshot in grey with the changed pixels in red. More than `maxDiffPixels` changed
  (default `0`) → exit code `1`.
- **The change is intended**: `--update-baseline` replaces the baselines with this run's snapshots.

Snapshots differ between engines and screen scales, so the engine is part of the file name (`webkitgtk-…`,
`msedge-…`) and each engine has its own baselines. `compareTolerance` (default `2` of 255 per channel) ignores
invisible rounding noise; raise it a little if antialiasing differs between machines.

## Cleaning up snapshots

Snapshots pile up in the snapshot folder. Clear them when you no longer need them:

```sh
npx webview-preview clean                  # delete every *.png in the snapshot folder
npx webview-preview clean --dry-run        # only list what would be deleted
npx webview-preview clean --older-than 2h  # only files older than 2 hours (30m, 7d …)
```

`clean` reads the same config (`out`, `baseline`) as a normal run. It deletes only `*.png` files directly in the
snapshot folder (including `.diff.png`), never the baselines, and refuses to run when the snapshot folder is the
project folder, your home folder, the disk root or the baseline folder.

## Recipes

**Same screen in every engine you ship to** — compare side by side:

```sh
for engine in webkitgtk chrome; do npx webview-preview /settings --engine $engine snap:settings; done
```

**Different window sizes:**

```sh
npx webview-preview / snap:wide resize:900x500 wait:300 snap:narrow
npx webview-preview / snap:home --size 1200x650,800x600,480x800
```

**Light and dark, with and without motion:**

```sh
for scheme in light dark; do npx webview-preview / snap:home-$scheme --color-scheme $scheme; done
npx webview-preview / click:.menu-button snap:menu-open --reduced-motion
```

With `--reduced-motion` a page that respects it skips its transitions, so a snapshot right after a click shows the
final state instead of a frame in the middle of the animation — and you see whether the page respects it at all.

**Measure instead of looking** — sizes and positions are more reliable than eyes:

```sh
npx webview-preview / "print:JSON.stringify(document.querySelector('header').getBoundingClientRect())"
```

**Type into a React-controlled input** (setting `.value` alone does not reach React):

```sh
"js:const input = document.querySelector('input[name=email]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'a@b.c'); input.dispatchEvent(new Event('input', { bubbles: true }))"
```

**Keyboard path through a form** — check the focus order and that the ring is not clipped:

```sh
npx webview-preview /signup "click:input[name=email]" type:me@example.com key:Tab type:secret key:Tab "print:document.activeElement.textContent" "snap:submit@button[type=submit]"
```

**A flow, step by step, the way a person does it** — no fixed waits:

```sh
npx webview-preview / "click:text=Sign in" "waitfor:[role=dialog]" "click:input[name=email]" type:me@example.com \
  key:Enter "waitfor:!text=Signing in…" "waitfor:text=Dashboard" "measure:[data-test=sidebar]" snap:dashboard
```

**Hover state of one element:**

```sh
npx webview-preview / "hover:[data-test=card]" wait:300 "snap:card-hover@[data-test=card]"
```

More of these — animations frame by frame, measuring, getting past login — in [AGENTS.md](./AGENTS.md).

## Troubleshooting

| Problem | Fix |
|---|---|
| `WebKitGTK engine needs Linux with python3-gi and WebKit2 4.1` | Install the [Linux packages](#linux--webkitgtk). |
| `This engine needs playwright-core` | `npm i -D playwright-core`. |
| `Executable doesn't exist` (Playwright) | `npx playwright install webkit` (or `chromium`); for `msedge` / `chrome` install the browser itself. |
| `Server did not open port …` | The `server.command` failed or uses another port. Run it by hand to see why; raise `readyTimeoutMs` for slow starts. |
| `"/route" is not a full URL` | Set `baseUrl` in the config or pass `--base-url`. |
| Blank snapshot | The page needs more time or threw on start: add `wait:2000`, and `print:document.body.innerHTML.length`. |
| `timed out after 30000 ms` (WebKitGTK) | A run longer than 30 s; split it into several runs. |
| The app starts in its default state every time | Runs start with empty storage on purpose. Set what you need with [`init`](#1-init--set-things-up-before-the-app-starts), or pass `--keep-storage` (WebKitGTK) to carry it over. |
| `waitfor:… timed out` | The element never became visible, or keeps moving (an endless animation). Check with `measure:`; raise `--wait-timeout`; use `wait:` for elements that never stop moving. |
| `--headed` Linux snapshot is twice the size | A real window follows your screen's scale (HiDPI): PNG pixels = CSS pixels × scale. Off-screen snapshots are 1×. |
| Off-screen page is half as wide as `--size` | `GDK_SCALE` is set in your environment; it shrinks the off-screen window. Unset it for the run. |
| `cannot open display` (Linux) | No display at all (server, CI): run under `xvfb-run`. |

## For AI agents

[AGENTS.md](./AGENTS.md) is written for an AI coding agent that checks its own UI changes with this tool: how to
read results, measure layout, step through animations, show focus rings, and the traps that waste time. Point your
agent to it (for example from `CLAUDE.md` or `AGENTS.md` in your project):

```md
UI changes: check them in the real engine with `npx webview-preview` — see node_modules/webview-preview/AGENTS.md.
```

## License

MIT © n0t4u404