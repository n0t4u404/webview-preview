import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { preview } from "#src/index.mjs";
import { readPng } from "#src/snapshots/png.mjs";

const engine = process.env.WEBVIEW_PREVIEW_ENGINE ?? "auto";
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

test("keyboard, mouse and focus order", async () => {
	const result = await run([
		"click:#name",
		"type:hello",
		"assert:document.querySelector('#name').value === 'hello'",
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
});