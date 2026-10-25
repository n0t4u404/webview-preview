#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { cleanSnapshots, ENGINES, preview, watchPreview } from "#src/index.mjs";

const FLAGS = {
	"--engine": "engine",
	"--size": "size",
	"--out": "out",
	"--prefix": "prefix",
	"--scale": "scale",
	"--config": "config",
	"--base-url": "baseUrl",
	"--snap-margin": "snapMargin",
	"--baseline": "baseline",
	"--max-diff-pixels": "maxDiffPixels",
	"--compare-tolerance": "compareTolerance",
	"--older-than": "olderThan",
	"--wait-timeout": "waitTimeout",
	"--locale": "locale",
	"--color-scheme": "colorScheme",
	"--latency": "latency"
}
const LIST_FLAGS = { "--init": "init", "--init-file": "initFile", "--mock-file": "mockFile" }

const HELP = `Usage: webview-preview [route-or-url] [steps...] [options]
       webview-preview clean [--dry-run] [--older-than 2h] [--out <dir>] [--config <file>]

Opens the page in a real browser engine, runs the steps in order and saves PNG snapshots.

Steps:
  js:<code>        run JavaScript, then wait 700 ms
  jsnow:<code>     run JavaScript, go on right away
  wait:<ms>        wait
  waitfor:<css selector>   wait until a matching element is visible (up to --wait-timeout)
  waitfor:!<css selector>  wait until no matching element is visible
  snap:<name>      save <out>/<prefix><name>.png
  print:<expr>     print the value of an expression
  measure:<css selector>  print size, position, box, visibility, font and text of the element
  assert:<expr>    check that the expression is truthy; if not, print why and exit with 1
  focusorder[:<n>] press Tab n times (default 20) and print where focus went; shows when it loops
  film:<name>:<ms>[/<n>][@<css selector>]  n frames (default 10) over ms, from now, into one
                   <out>/<prefix><name>.png, 5 per row; with a selector, cropped to where the element was
  resize:<WxH>     resize the window
  snap:<name>@<css selector>  save only that element (plus --snap-margin)
  key:<key>        press a key: Tab, Shift+Tab, Enter, Escape, ArrowDown, Control+a, x …
  type:<text>      type text with the keyboard
  hover:<css selector>  move the mouse to the element's centre
  click:<css selector>  click the element's centre with the mouse
  offline / online go offline or back: navigator.onLine, online/offline events, fetch and XHR fail
  latency:<ms>     delay every fetch/XHR request by ms (0 turns it off)
  macro:<name>     run the steps of a macro from the config (macros: { name: [...] })

Options:
  --engine <name>  ${ENGINES.join(" | ")} (default: auto)
  --size <WxH>     window size in CSS pixels (default: 1200x650); several sizes, comma-separated
                   (1200x650,800x600), run the steps once per size into <prefix><WxH>-<name>.png
  --color-scheme <light|dark>  prefers-color-scheme for the page (default: the system's)
  --reduced-motion prefers-reduced-motion: reduce
  --out <dir>      folder for snapshots (default: .webview-preview)
  --prefix <text>  file name prefix (default: "<engine>-")
  --scale <n>      device pixel ratio for Playwright engines (default: 1); WebKitGTK renders
                   1x off-screen and at the screen's scale with --headed
  --snap-margin <px>  room around snap:name@selector (default: 8)
  --headed         WebKitGTK: show a real window instead of rendering off-screen
  --wait-timeout <ms>  how long waitfor waits (default: 10000)
  --keep-storage   WebKitGTK: keep localStorage, cookies and cache between runs (default: start clean)
  --report         write <out>/report.html: the output and every snapshot, with baseline and
                   difference next to it after --compare
  --compare        compare every snapshot with the baseline of the same name (a missing one is created)
  --update-baseline  replace the baselines with this run's snapshots
  --baseline <dir> baseline folder (default: webview-preview-baseline)
  --max-diff-pixels <n>  pixels allowed to differ before the run fails (default: 0)
  --compare-tolerance <n>  per-channel difference ignored, 0-255 (default: 2)
  --base-url <url> prepended to routes that are not full URLs
  --init <code>    run code before the page's own scripts, on every load (repeatable)
  --init-file <f>  same, from a file (repeatable)
  --mock-file <f>  answer fetch/XHR requests from a .json/.mjs file of mocks (repeatable);
                   every request is listed in window.__webviewPreviewRequests
  --log-requests   only list fetch/XHR requests in window.__webviewPreviewRequests
  --tauri          stub the Tauri bridge (invoke, events, window); answers come from
                   tauri.commands in the config, anything else gets null
  --locale <tag>   navigator.language for the page: en-US, ru-RU … (Playwright: also Intl)
  --offline        start offline (the page itself still loads)
  --latency <ms>   delay every fetch/XHR request from the start
  --watch          run again whenever a file changes (the config's watch, default src/ or the config's folder,
                   plus the config file); the server stays up between runs
  --fail-on-error  exit with 1 when the page logged console.error or threw (they are always printed)
  --config <file>  config file (default: webview-preview.config.{mjs,js,json})
  --no-config      ignore config files

Clean:
  clean            delete the snapshots (*.png, also *.diff.png) in the snapshot folder;
                   baselines are never touched
  --dry-run        only list what would be deleted
  --older-than <t> only files older than 30m, 2h, 7d …

  -h, --help       show this help
  -v, --version    show the version`;

const parseArgs = argv => {
	const options = { steps: [] }
	const positional = [];
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "-h" || arg === "--help") return { help: true }
		if (arg === "-v" || arg === "--version") return { version: true }
		if (arg === "--keep-storage") {
			options.keepStorage = true;
			continue;
		}
		if (arg === "--dry-run") {
			options.dryRun = true;
			continue;
		}
		if (arg === "--compare" || arg === "--update-baseline") {
			options[arg === "--compare" ? "compare" : "updateBaseline"] = true;
			continue;
		}
		if (arg === "--headed") {
			options.headed = true;
			continue;
		}
		if (arg === "--report") {
			options.report = true;
			continue;
		}
		if (arg === "--watch") {
			options.isWatching = true;
			continue;
		}
		if (arg === "--offline") {
			options.offline = true;
			continue;
		}
		if (arg === "--reduced-motion") {
			options.reducedMotion = true;
			continue;
		}
		if (arg === "--fail-on-error") {
			options.failOnError = true;
			continue;
		}
		if (arg === "--tauri") {
			options.tauri = true;
			continue;
		}
		if (arg === "--log-requests") {
			options.logRequests = true;
			continue;
		}
		if (arg === "--no-config") {
			options.config = false;
			continue;
		}
		const [flag, inline] = arg.split(/=(.*)/s, 2);
		if (flag in LIST_FLAGS) {
			const value = inline ?? argv[++index];
			if (value === undefined) throw new Error(`${flag} needs a value`);
			(options[LIST_FLAGS[flag]] ??= []).push(value);
			continue;
		}
		if (flag in FLAGS) {
			const value = inline ?? argv[++index];
			if (value === undefined) throw new Error(`${flag} needs a value`);
			options[FLAGS[flag]] = value;
			continue;
		}
		if (arg.startsWith("--")) throw new Error(`Unknown option ${arg}`);
		positional.push(arg);
	}
	const [target, ...steps] = positional;
	return { options: { ...options, target, steps } }
}

try {
	const parsed = parseArgs(process.argv.slice(2));
	if (parsed.help) {
		console.log(HELP);
		process.exit(0);
	}
	if (parsed.version) {
		console.log(JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version);
		process.exit(0);
	}
	if (parsed.options.target === "clean") {
		const { target, steps, ...cleanOptions } = parsed.options;
		if (steps.length) throw new Error(`clean takes no steps, got ${steps.join(" ")}`);
		const { removed, out } = await cleanSnapshots(cleanOptions);
		for (const file of removed) console.log(file);
		console.log(`${cleanOptions.dryRun ? "would delete" : "deleted"} ${removed.length} snapshot(s) in ${out}`);
		process.exit(0);
	}
	const { isWatching, ...previewOptions } = parsed.options;
	if (isWatching) {
		const stop = await watchPreview(previewOptions, result => {
			for (const file of result.saved) console.log(file);
		});
		for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.once(signal, () => {
			stop();
			process.exit(0);
		});
		await new Promise(() => {});
	}
	const result = await preview(previewOptions);
	for (const file of result.saved) console.log(file);
	process.exit(result.failed ? 1 : 0);
} catch (error) {
	console.error(`webview-preview: ${error.message}`);
	process.exit(1);
}