import { copyFileSync, mkdirSync, mkdtempSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../../src/core/server.mjs";
import { preview } from "../../src/index.mjs";
import { annotateStart } from "../../src/page/annotate/index.mjs";

const demo = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(demo, "../../assets/readme");
const work = mkdtempSync(path.join(os.tmpdir(), "webview-preview-readme-"));
mkdirSync(target, { recursive: true });
process.chdir(demo);
const stopServer = await startServer({ command: "npx vite --port 5310 --strictPort", port: 5310, cwd: demo });

const shoot = async (name, steps, options = {}) => {
	const result = await preview({ config: false, baseUrl: "http://localhost:5310/#", size: "1200x700", target: "/", engine: "webkitgtk", out: work, prefix: "", steps: ["waitfor:.plants", ...steps], log: { info: () => {}, error: line => console.error(`${name}: ${line}`) }, ...options });
	if (result.failed) throw new Error(`${name} failed`);
	return result;
}

const start = `js:${annotateStart("plants")}`;
const markersShown = "js:window.__webviewPreviewAnnotate.setHidden(false)";
const pick = (selector, isAdding = false) => `js:{ const element = document.querySelector('${selector}'); const rect = element.getBoundingClientRect(); element.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, detail: 1, shiftKey: ${isAdding}, clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2 })) }`;

await shoot("pick", [start, "hover:.stat:nth-child(2) .stat-value", "wait:300", "snap:annotate-pick"]);
await shoot("notes", [
	start,
	"click:.stat:nth-child(2) .stat-value",
	"type:Orange when it is above 0",
	"key:Escape",
	"click:.plant:nth-child(1) .button",
	"wait:400",
	pick(".plant:nth-child(3) .button", true),
	"wait:400",
	"type:Same width as the row's text column, not wider",
	"hover:.sidebar",
	"wait:300",
	markersShown,
	"snap:annotate-notes"
]);
await shoot("freeze", [
	start,
	"hover:.plant:nth-child(3) .button",
	"key:f",
	"wait:3400",
	"click:[role=tooltip]",
	"type:The tooltip covers the row above",
	markersShown,
	"snap:annotate-freeze"
]);
await shoot("report", [
	`jsnow:setTimeout(() => { const click = selector => { const element = document.querySelector(selector); const rect = element.getBoundingClientRect(); element.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, detail: 1, clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2 })) }; click('.stat:nth-child(2) .stat-value'); setTimeout(() => { click('.plant:nth-child(1) .button'); setTimeout(() => window.__webviewPreviewAnnotate.finish('done'), 500) }, 500) }, 1500)`,
	"annotate:plants"
], { headed: false });

for (const name of ["annotate-pick", "annotate-notes", "annotate-freeze"]) copyFileSync(path.join(work, `${name}.png`), path.join(target, `${name}.png`));
copyFileSync(path.join(work, "annotate-plants.png"), path.join(target, "annotate-report.png"));
stopServer();
console.log(readdirSync(target).map(file => path.join(target, file)).join("\n"));