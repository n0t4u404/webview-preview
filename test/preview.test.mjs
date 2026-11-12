import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { cleanSnapshots, preview } from "#src/index.mjs";
import { createSourceResolver } from "#src/core/source-map.mjs";
import { ANNOTATE_CHECK, annotateStart } from "#src/page/annotate/index.mjs";
import { readPng } from "#src/snapshots/png.mjs";

const engine = process.env.WEBVIEW_PREVIEW_ENGINE ?? "auto";
const isMacWebKit = process.platform === "darwin" && (engine === "webkit" || engine === "auto");
const fixture = pathToFileURL(fileURLToPath(new URL("./fixture/index.html", import.meta.url))).href;
const out = process.env.WEBVIEW_PREVIEW_OUT ?? mkdtempSync(path.join(os.tmpdir(), "webview-preview-test-"));

const run = async (steps, options = {}) => {
	const lines = [];
	const log = { info: line => lines.push(line), error: line => lines.push(`ERROR ${line}`) }
	const result = await preview({ target: fixture, config: false, engine, size: "640x480", out, steps, log, ...options });
	return { ...result, lines }
}

test("snapshots, print, measure and assert", async () => {
	const result = await run([
		"snap:page",
		"snap:form@#form",
		"print:document.title",
		"measure:#form",
		"assert:document.querySelector('#form').getBoundingClientRect().width === 400"
	]);
	assert.equal(result.failed, false, result.lines.join("\n"));
	assert.ok(result.lines.includes("fixture"));
	assert.match(result.lines.find(line => line.startsWith("measure")) ?? "", /w 400/);
	const page = readPng(result.saved[0]);
	assert.deepEqual([page.width, page.height], [640, 480]);
	assert.equal(readPng(result.saved[1]).width, 400 + 2 * 8);
});

test("resize shrinks and grows the window", async () => {
	const result = await run([
		"resize:500x400",
		"assert:innerWidth === 500 && innerHeight === 400",
		"snap:small",
		"resize:800x600",
		"assert:innerWidth === 800 && innerHeight === 600"
	]);
	assert.equal(result.failed, false, result.lines.join("\n"));
	const small = readPng(result.saved[0]);
	assert.deepEqual([small.width, small.height], [500, 400]);
});

test("keyboard and mouse", async () => {
	const result = await run([
		"click:#name",
		"type:hello",
		"key:Backspace",
		"assert:document.querySelector('#name').value === 'hell'",
		"click:#open",
		"waitfor:dialog[open]",
		"key:Escape",
		"waitfor:!dialog[open]"
	]);
	assert.equal(result.failed, false, result.lines.join("\n"));
});

test("a long text typed into a slow field all lands there before the next step", async () => {
	const text = "Updating the servers to version 1.1, back by the evening.";
	const result = await run([
		"click:#slow",
		`type:${text}`,
		"click:#name",
		`assert:document.querySelector('#slow').value === ${JSON.stringify(text)}`,
		"assert:document.querySelector('#name').value === ''"
	]);
	assert.equal(result.failed, false, result.lines.join("\n"));
});

test("focus order", { skip: isMacWebKit && "macOS WebKit tabs to text fields only (Full Keyboard Access is off)" }, async () => {
	const result = await run([
		"click:#name",
		"key:Tab",
		"assert:document.activeElement.id === 'open'",
		"key:Enter",
		"waitfor:dialog[open]",
		"focusorder:8"
	]);
	assert.equal(result.failed, false, result.lines.join("\n"));
	const order = result.lines.slice(result.lines.findIndex(line => line.startsWith("focus order"))).join("\n");
	assert.match(order, /button#close "Close" in dialog/);
	assert.match(order, /→ back to 1/);
});

test("Alt+Tab reaches buttons on macOS WebKit", { skip: !isMacWebKit && "macOS WebKit only" }, async () => {
	const result = await run(["click:#name", "key:Alt+Tab", "assert:document.activeElement.id === 'open'"]);
	assert.equal(result.failed, false, result.lines.join("\n"));
});

test("a failed assert and a console error fail the run", async () => {
	const result = await run(["click:#fail", "wait:100", "assert:1 === 2"], { failOnError: true });
	assert.equal(result.failed, true);
	assert.equal(result.failedAsserts, 1);
	assert.equal(result.consoleErrors, 1);
	assert.ok(result.lines.some(line => line.includes("broken on purpose")));
});

test("mock, offline and latency", async () => {
	const result = await run([
		"click:#load",
		"waitfor:text=Ada",
		"latency:300",
		"offline",
		"assert:navigator.onLine === false",
		"click:#load",
		"waitfor:text=Failed to fetch",
		"online",
		"assert:navigator.onLine === true"
	], { mock: { "GET /api/user": { json: { name: "Ada" } } } });
	assert.equal(result.failed, false, result.lines.join("\n"));
});

test("several sizes, dark scheme and reduced motion", async () => {
	const result = await run([
		"print:innerWidth",
		"assert:matchMedia('(prefers-color-scheme: dark)').matches",
		"assert:matchMedia('(prefers-reduced-motion: reduce)').matches",
		"snap:sized"
	], { size: "640x480,500x400", prefix: "sizes-", colorScheme: "dark", reducedMotion: true });
	assert.equal(result.failed, false, result.lines.join("\n"));
	assert.deepEqual(result.saved.map(file => path.basename(file)), ["sizes-640x480-sized.png", "sizes-500x400-sized.png"]);
	assert.deepEqual(result.lines.filter(line => /^\d+$/.test(line)), ["640", "500"]);
});

test("film", async () => {
	const result = await run(["click:#open", "film:open:300/4@dialog"]);
	assert.equal(result.failed, false, result.lines.join("\n"));
	assert.match(result.lines.find(line => line.startsWith("film")) ?? "", /4 frames/);
	const film = readPng(result.saved[0]);
	assert.ok(film.width > film.height * 2, `film is ${film.width}x${film.height}`);
});

test("compare and report", async () => {
	const baseline = path.join(out, "baseline");
	const steps = ["snap:compared@#form"];
	await run(steps, { baseline, updateBaseline: true });
	const same = await run(steps, { baseline, compare: true, report: true });
	assert.equal(same.failed, false, same.lines.join("\n"));
	assert.ok(same.lines.some(line => line.endsWith(": same")));
	assert.ok(existsSync(same.report));
	const changed = await run(["js:document.querySelector('#open').style.background = 'red'", ...steps], { baseline, compare: true, report: true });
	assert.equal(changed.failed, true);
	assert.match(readFileSync(changed.report, "utf8"), /px differ/);
	const diffFile = changed.saved[0].replace(/\.png$/, ".diff.png");
	assert.ok(existsSync(diffFile));
	await run(steps, { baseline, compare: true });
	assert.ok(!existsSync(diffFile), "a stale diff stays after a clean compare");
});

test("the run limit stops long runs and keeps what was saved", async () => {
	const result = await run(["snap:before", "wait:8000", "snap:after"], { timeout: 5000 });
	assert.equal(result.failed, true);
	assert.ok(result.lines.some(line => /timed out after 5000 ms/.test(line)), result.lines.join("\n"));
	assert.ok(result.saved.some(file => file.endsWith("before.png")), "the snapshot before the limit is lost");
	const unlimited = await run(["wait:2000", "snap:done"], { timeout: 0 });
	assert.equal(unlimited.failed, false, unlimited.lines.join("\n"));
});

test("one keyup reaches the page for every key", async () => {
	const result = await run([
		"click:#name",
		"type:ab",
		"key:Shift+Tab",
		"assert:window.__keyups.join(',') === 'a,b,Tab,Shift'"
	], { init: "window.__keyups = []; addEventListener('keyup', event => window.__keyups.push(event.key), true)" });
	assert.equal(result.failed, false, result.lines.join("\n"));
});

test("clean deletes snapshots and the report, not the baselines", async () => {
	const folder = mkdtempSync(path.join(os.tmpdir(), "webview-preview-clean-"));
	const baseline = path.join(folder, "baseline");
	await run(["snap:kept@#form"], { out: folder, baseline, updateBaseline: true, report: true });
	assert.ok(existsSync(path.join(folder, "report.html")));
	const { removed } = await cleanSnapshots({ config: false, out: folder, baseline });
	assert.ok(removed.some(file => file.endsWith("report.html")), removed.join("\n"));
	assert.ok(!existsSync(path.join(folder, "report.html")));
	assert.ok(existsSync(baseline) && readdirSync(baseline).length > 0, "baselines were deleted");
});

test("annotate picks elements without letting the clicks through and returns the notes", async () => {
	const shiftClick = selector => `js:{ const rect = document.querySelector('${selector}').getBoundingClientRect(); document.querySelector('${selector}').dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, detail: 1, shiftKey: true, clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2 })) }`;
	const result = await run([
		`js:${annotateStart("fixture")}`,
		"key:t",
		"click:#open",
		"type:make it wider",
		shiftClick("#load"),
		"click:#fail",
		"click:#open",
		"type: by 20 px",
		"assert:!document.querySelector('dialog').open",
		"js:window.__webviewPreviewAnnotate.finish('done')",
		`print:${ANNOTATE_CHECK}`,
		"assert:!!document.querySelector('webview-preview-annotate')",
		"js:window.__webviewPreviewAnnotate.cleanup(); window.__webviewPreviewAnnotate.dispose()",
		"assert:!document.querySelector('webview-preview-annotate')"
	]);
	assert.equal(result.failed, false, result.lines.join("\n"));
	const { status, result: annotation } = JSON.parse(result.lines.find(line => line.startsWith('{"status"')));
	assert.equal(status, "done");
	assert.deepEqual(annotation.notes.map(note => [note.id, note.text, note.elements.length]), [[1, "make it wider by 20 px", 2], [2, "", 1]]);
	assert.deepEqual(Object.values(annotation.elements).map(element => element.selector), ["#open", "#load", "#fail"]);
	assert.ok(Object.values(annotation.elements).every(element => element.selectorQuality === "stable"));
});

test("annotate as a step ends when the panel is done", async () => {
	const result = await run([
		"jsnow:setTimeout(() => window.__webviewPreviewAnnotate.finish('cancelled'), 2500)",
		"annotate:quick",
		"print:'after'"
	], { headed: false });
	assert.ok(result.lines.includes("annotate quick: cancelled"), result.lines.join("\n"));
	assert.ok(result.lines.includes("after"));
	assert.deepEqual(result.annotations.map(annotation => annotation.status), ["cancelled"]);
});

test("annotate names the React component and where it is used", async () => {
	const fiber = `{ tag: 5, _debugStack: { stack: "Panel@${fixture}:30:5" }, return: { tag: 14, type: { type: { displayName: "Panel" } }, _debugStack: { stack: "react_stack_bottom_frame@${fixture.replace("index.html", "node_modules/react.js")}:1:1\\nApp@${fixture}:12:7" }, return: { tag: 0, type: function App() {}, _debugStack: { stack: "@${fixture.replace("index.html", "node_modules/react-dom.js")}:9:9" }, return: null } } }`;
	const result = await run([
		`js:document.querySelector('#open')['__reactFiber$test'] = ${fiber}`,
		`js:${annotateStart("react")}`,
		"key:t",
		"click:#open",
		"js:window.__webviewPreviewAnnotate.finish('done')",
		`print:${ANNOTATE_CHECK}`
	]);
	assert.equal(result.failed, false, result.lines.join("\n"));
	const { result: annotation } = JSON.parse(result.lines.find(line => line.startsWith('{"status"')));
	const { component } = Object.values(annotation.elements)[0];
	assert.equal(component.name, "Panel");
	assert.deepEqual(component.chain.map(item => [item.name, item.usedAt.line]), [["Panel", 12]]);
	assert.deepEqual([component.source.line, component.source.confidence], [30, "exact"]);
});

test("source maps turn a served line back into the file and line in the project", async () => {
	const folder = mkdtempSync(path.join(os.tmpdir(), "webview-preview-map-"));
	const vlq = value => {
		let rest = value < 0 ? (-value << 1) | 1 : value << 1;
		let encoded = "";
		do {
			let digit = rest & 31;
			rest >>>= 5;
			if (rest > 0) digit |= 32;
			encoded += "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"[digit];
		} while (rest > 0);
		return encoded;
	}
	const map = { version: 3, sources: ["panel.tsx"], names: [], mappings: `;${[4, 0, 9, 2].map(vlq).join("")},${[10, 0, 1, 0].map(vlq).join("")}` }
	writeFileSync(path.join(folder, "panel.tsx"), "");
	writeFileSync(path.join(folder, "panel.js"), `let a;\nlet b = 1;\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(JSON.stringify(map)).toString("base64")}`);
	const resolve = createSourceResolver(folder);
	const moduleUrl = pathToFileURL(path.join(folder, "panel.js")).href;
	assert.deepEqual(await resolve({ url: moduleUrl, line: 2, column: 8 }), { file: "panel.tsx", line: 10, column: 3, how: "debug-stack" });
	assert.deepEqual(await resolve({ url: moduleUrl, line: 2, column: 15 }), { file: "panel.tsx", line: 11, column: 3, how: "debug-stack" });
	assert.equal((await resolve({ url: pathToFileURL(path.join(folder, "missing.js")).href, line: 1, column: 1 })).isMapped, false);
});

test("annotate writes a JSON and a Markdown report with the marked screen and every element cut out", async () => {
	const folder = mkdtempSync(path.join(os.tmpdir(), "webview-preview-report-"));
	const result = await run([
		"jsnow:setTimeout(() => { const button = document.querySelector('#load'); const rect = button.getBoundingClientRect(); button.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, detail: 1, clientX: rect.x + 5, clientY: rect.y + 5 })); setTimeout(() => window.__webviewPreviewAnnotate.finish('done'), 300) }, 2000)",
		"annotate:report",
		"assert:!document.querySelector('webview-preview-annotate')"
	], { headed: false, out: folder });
	assert.equal(result.failed, false, result.lines.join("\n"));
	const prefix = path.join(folder, result.engine + "-annotate-report");
	const report = JSON.parse(readFileSync(`${prefix}.json`, "utf8"));
	assert.equal(report.status, "done");
	assert.equal(report.image, path.basename(`${prefix}.png`));
	assert.equal(report.elements.e1.selector, "#load");
	assert.equal(report.elements.e1.image, path.basename(`${prefix}-e1.png`));
	assert.ok(report.elements.e1.style.font.length > 0);
	for (const file of [`${prefix}.png`, `${prefix}-e1.png`, `${prefix}.md`]) assert.ok(existsSync(file), file);
	assert.match(readFileSync(`${prefix}.md`, "utf8"), /selector: `#load`/);
	assert.ok(result.lines.some(line => line.endsWith(".md")));
});

test("annotate works on a page that requires Trusted Types and forbids inline styles", async () => {
	const strict = fixture.replace("index.html", "strict.html");
	const result = await run([
		"assert:(() => { try { document.body.innerHTML = '<b>x</b>'; return false } catch { return true } })()",
		`js:${annotateStart("strict")}`,
		"assert:!!document.querySelector('webview-preview-annotate')",
		"click:#strict",
		"js:window.__webviewPreviewAnnotate.finish('done')",
		`print:${ANNOTATE_CHECK}`
	], { target: strict });
	assert.equal(result.failed, false, result.lines.join("\n"));
	const { result: annotation } = JSON.parse(result.lines.find(line => line.startsWith('{"status"')));
	assert.equal(Object.values(annotation.elements)[0].selector, "#strict");
});

test("annotate names Vue 3 and Vue 2 components and their files", async () => {
	const folder = fileURLToPath(new URL("./fixture/", import.meta.url));
	const vue3 = `{ type: { __name: "SaveButton", __file: ${JSON.stringify(folder + "SaveButton.vue")} }, parent: { type: { name: "Settings", __file: ${JSON.stringify(folder + "Settings.vue")} }, parent: { type: { name: "App" }, parent: null } } }`;
	const vue2 = `{ $options: { name: "LoadButton", __file: ${JSON.stringify(folder + "LoadButton.vue")} }, $parent: { $options: { __file: ${JSON.stringify(folder + "Toolbar.vue")} }, $parent: null } }`;
	const pick = selector => `{ const button = document.querySelector('${selector}'); const rect = button.getBoundingClientRect(); button.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, detail: 1, clientX: rect.x + 5, clientY: rect.y + 5 })) }`;
	const result = await run([
		`js:document.querySelector('#open').__vueParentComponent = ${vue3}; document.querySelector('#load').__vue__ = ${vue2}`,
		`jsnow:setTimeout(() => { ${pick("#open")}; setTimeout(() => { ${pick("#load")}; setTimeout(() => window.__webviewPreviewAnnotate.finish('done'), 300) }, 300) }, 2000)`,
		"annotate:vue"
	], { headed: false, out: mkdtempSync(path.join(os.tmpdir(), "webview-preview-vue-")) });
	assert.equal(result.failed, false, result.lines.join("\n"));
	const [report] = result.annotations;
	const [modern, legacy] = Object.values(report.elements).map(element => element.component);
	assert.deepEqual([modern.framework, modern.name, modern.source.file, modern.source.confidence], ["vue", "SaveButton", "test/fixture/SaveButton.vue", "file"]);
	assert.deepEqual(modern.chain.map(item => [item.name, item.usedAt?.file ?? null]), [["App", null], ["Settings", null], ["SaveButton", "test/fixture/Settings.vue"]]);
	assert.deepEqual([legacy.name, legacy.source.file, legacy.chain.at(-1).usedAt.file], ["LoadButton", "test/fixture/LoadButton.vue", "test/fixture/Toolbar.vue"]);
});

test("annotate keeps notes across a page reload and cuts out elements from the first page", async () => {
	const script = `addEventListener("load", () => {
		const loads = Number(sessionStorage.getItem("loads") || 0) + 1;
		sessionStorage.setItem("loads", String(loads));
		const pick = selector => { const button = document.querySelector(selector); const rect = button.getBoundingClientRect(); button.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true, detail: 1, clientX: rect.x + 5, clientY: rect.y + 5 })) };
		setTimeout(() => {
			if (loads === 1) {
				pick("#open");
				setTimeout(() => location.reload(), 800);
			} else {
				pick("#load");
				setTimeout(() => window.__webviewPreviewAnnotate.finish("done"), 300);
			}
		}, 2500);
	});`;
	const folder = mkdtempSync(path.join(os.tmpdir(), "webview-preview-pages-"));
	const result = await run(["annotate:pages"], { headed: false, out: folder, init: script });
	assert.equal(result.failed, false, result.lines.join("\n"));
	const [report] = result.annotations;
	assert.deepEqual(report.notes.map(note => note.elements.map(id => report.elements[id].selector)), [["#open"], ["#load"]]);
	assert.ok(report.elements.e1.image && existsSync(path.join(folder, report.elements.e1.image)), "the first page's element was not cut out");
});

test("annotate keeps a picked element to its page when the app reuses the node on another route", async () => {
	const isLiveAfter = async hashes => {
		const result = await run([
			"js:location.hash = '#/one'",
			`js:${annotateStart("routes")}`,
			"key:t",
			"click:#open",
			"key:Escape",
			...hashes.map(hash => `js:location.hash = '${hash}'`),
			"js:window.__webviewPreviewAnnotate.finish('done')",
			`print:${ANNOTATE_CHECK}`
		]);
		assert.equal(result.failed, false, result.lines.join("\n"));
		return JSON.parse(result.lines.find(line => line.startsWith('{"status"'))).result.elements.e1.isLive;
	}
	assert.equal(await isLiveAfter(["#/two"]), false, "the element shows on another route");
	assert.equal(await isLiveAfter(["#/two", "#/one"]), true, "the element is not back on its own route");
});

test("annotate freezes the page so a hover-only tooltip stays open to be picked", async () => {
	const result = await run([
		`js:${annotateStart("freeze")}`,
		"key:t",
		"hover:#target",
		"assert:!document.querySelector('#tip').hidden",
		"key:f",
		"wait:3400",
		"hover:#away",
		"assert:!document.querySelector('#tip').hidden",
		"assert:document.getAnimations().every(animation => animation.playState === 'paused')",
		"click:#tip",
		"key:Escape",
		"key:f",
		"assert:document.getAnimations().some(animation => animation.playState === 'running')",
		"js:window.__webviewPreviewAnnotate.finish('done')",
		`print:${ANNOTATE_CHECK}`
	], { target: fixture.replace("index.html", "hover.html") });
	assert.equal(result.failed, false, result.lines.join("\n"));
	const { result: annotation } = JSON.parse(result.lines.find(line => line.startsWith('{"status"')));
	assert.deepEqual(annotation.notes.map(note => [annotation.elements[note.elements[0]].selector, note.isFrozen]), [["#tip", true]]);
});

test("annotate hides private text from the report and paints private elements over", async () => {
	const folder = mkdtempSync(path.join(os.tmpdir(), "webview-preview-private-"));
	const pick = selector => `{ const element = document.querySelector('${selector}'); const rect = element.getBoundingClientRect(); element.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, detail: 1, clientX: rect.x + 4, clientY: rect.y + 4 })) }`;
	const result = await run([
		`jsnow:setTimeout(() => { ${pick("#card")}; setTimeout(() => { ${pick("#password")}; setTimeout(() => window.__webviewPreviewAnnotate.finish('done'), 300) }, 300) }, 2000)`,
		"annotate:private"
	], { headed: false, out: folder, target: fixture.replace("index.html", "private.html"), private: ".extra" });
	assert.equal(result.failed, false, result.lines.join("\n"));
	const [report] = result.annotations;
	assert.equal(report.maskedCount, 4);
	assert.equal(report.elements.e1.text, "Card holder ••• and •••");
	assert.equal(report.elements.e2.isPrivate, true);
	assert.doesNotMatch(report.elements.e2.selector, /aria-label/);
	const files = readdirSync(folder).filter(file => /\.(json|md)$/.test(file)).map(file => readFileSync(path.join(folder, file), "utf8")).join("\n");
	assert.doesNotMatch(files, /john|Smith|hunter2|custom secret/i);
	assert.ok(result.lines.some(line => line.includes("4 private element(s) hidden")));
});

test("annotate treats the same node on another route as a separate element", async () => {
	const result = await run([
		"js:location.hash = '#/one'",
		`js:${annotateStart("same-node")}`,
		"key:t",
		"click:#open",
		"key:Escape",
		"js:location.hash = '#/two'",
		"click:#open",
		"key:Escape",
		"js:window.__webviewPreviewAnnotate.finish('done')",
		`print:${ANNOTATE_CHECK}`
	]);
	assert.equal(result.failed, false, result.lines.join("\n"));
	const { result: annotation } = JSON.parse(result.lines.find(line => line.startsWith('{"status"')));
	assert.deepEqual(annotation.notes.map(note => [note.elements, note.url.split("#")[1]]), [[["e1"], "/one"], [["e2"], "/two"]]);
});

test("annotate with keepOpen reports every Send at once and keeps going until Done", async () => {
	const folder = mkdtempSync(path.join(os.tmpdir(), "webview-preview-rounds-"));
	const lines = [];
	const pick = selector => `const element = document.querySelector('${selector}'); const rect = element.getBoundingClientRect(); element.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, detail: 1, clientX: rect.x + 4, clientY: rect.y + 4 }));`;
	const ctrlEnter = "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', ctrlKey: true, bubbles: true }));";
	const result = await run([
		`jsnow:setTimeout(() => { ${pick("#open")} setTimeout(() => { ${ctrlEnter} setTimeout(() => { ${pick("#load")} setTimeout(() => window.__webviewPreviewAnnotate.finish('done'), 400) }, 1500) }, 400) }, 2000)`,
		"annotate:rounds"
	], { headed: false, out: folder, keepOpen: true, log: { info: line => lines.push(line), error: line => lines.push(`ERROR ${line}`) } });
	assert.equal(result.failed, false, lines.join("\n"));
	assert.deepEqual(result.annotations.map(annotation => [annotation.status, annotation.round, Object.values(annotation.elements).map(element => element.selector)]), [["sent", 1, ["#open"]], ["done", 2, ["#load"]]]);
	for (const file of ["annotate-rounds.json", "annotate-rounds-2.json", "annotate-rounds-2-e1.png"]) assert.ok(existsSync(path.join(folder, `${result.engine}-${file}`)), file);
	assert.ok(lines.some(line => line.startsWith("annotate rounds: sent (round 1)")), lines.join("\n"));
});

test("annotate replays the steps before it when the page reloads and comes back to the same address", async () => {
	const pick = selector => `const element = document.querySelector('${selector}'); const rect = element.getBoundingClientRect(); element.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, detail: 1, clientX: rect.x + 4, clientY: rect.y + 4 }));`;
	const script = `addEventListener("load", () => {
		const loads = Number(sessionStorage.getItem("loads") || 0) + 1;
		sessionStorage.setItem("loads", String(loads));
		if (loads === 1) setTimeout(() => { ${pick("#first")} location.hash = "#/three"; setTimeout(() => location.reload(), 900) }, 3000);
		if (loads === 2) setTimeout(() => {
			window.__checked = location.hash + " " + document.querySelector("#app").hidden;
			${pick("#second")}
			setTimeout(() => window.__webviewPreviewAnnotate.finish("done"), 400);
		}, 4500);
	});`;
	const result = await run([
		"click:#signin",
		"js:location.hash = '#/two'",
		"annotate:session",
		"print:'state ' + window.__checked"
	], { headed: false, target: fixture.replace("index.html", "session.html"), init: script, out: mkdtempSync(path.join(os.tmpdir(), "webview-preview-replay-")) });
	assert.equal(result.failed, false, result.lines.join("\n"));
	assert.ok(result.lines.includes("state #/three false"), result.lines.join("\n"));
	const [report] = result.annotations;
	assert.deepEqual(report.notes.map(note => report.elements[note.elements[0]].selector), ["#first", "#second"]);
});