import { writeFileSync } from "node:fs";
import path from "node:path";

const escape = value => String(value)
	.replace(/&/g, "&amp;")
	.replace(/</g, "&lt;")
	.replace(/>/g, "&gt;")
	.replace(/"/g, "&quot;");

const STYLE = `
	:root { color-scheme: light dark; --bg: #f6f6f7; --panel: #fff; --text: #1d1d1f; --muted: #6e6e73; --line: #d9d9de; --ok: #1a7f37; --bad: #cf222e; --code: #efeff2 }
	@media (prefers-color-scheme: dark) { :root { --bg: #111113; --panel: #1b1b1e; --text: #ededf0; --muted: #9a9aa2; --line: #2e2e33; --ok: #3fb950; --bad: #f85149; --code: #232327 } }
	* { box-sizing: border-box }
	body { margin: 0; padding: 24px 16px 48px; background: var(--bg); color: var(--text); font: 14px/1.5 system-ui, sans-serif }
	main { max-width: 1400px; margin: 0 auto }
	h1 { font-size: 20px; margin: 0 0 4px }
	h2 { font-size: 15px; margin: 0 }
	.meta { color: var(--muted); margin: 0 0 20px; overflow-wrap: anywhere }
	.status { font-weight: 600 }
	.ok { color: var(--ok) }
	.bad { color: var(--bad) }
	pre { background: var(--code); padding: 12px; border-radius: 8px; white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.5 ui-monospace, monospace; margin: 0 0 24px }
	pre .bad { color: var(--bad) }
	section { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 16px; margin: 0 0 16px }
	section header { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline; margin: 0 0 12px }
	.images { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px }
	figure { margin: 0 }
	figcaption { color: var(--muted); font-size: 12px; margin: 0 0 4px }
	img { display: block; max-width: 100%; border: 1px solid var(--line); background: repeating-conic-gradient(#8882 0 25%, transparent 0 50%) 0 0 / 16px 16px }
	a:focus-visible { outline: 2px solid currentColor; outline-offset: 2px }
`;

const figure = (caption, file, out) => {
	const href = escape(path.relative(out, file).split(path.sep).join("/"));
	return `<figure><figcaption>${escape(caption)}</figcaption><a href="${href}"><img src="${href}" alt="${escape(caption)}" loading="lazy"></a></figure>`;
}

const snapshotSection = (file, compared, out) => {
	const images = compared?.baseline && compared.status !== "new baseline" && compared.status !== "baseline updated"
		? [figure("baseline", compared.baseline, out), figure("this run", file, out), ...(compared.diffFile ? [figure("difference (red)", compared.diffFile, out)] : [])]
		: [figure("this run", file, out)];
	const status = compared ? `<span class="status ${compared.isFailed ? "bad" : "ok"}">${escape(compared.status)}</span>` : "";
	return `<section><header><h2>${escape(path.basename(file))}</h2>${status}</header><div class="images">${images.join("")}</div></section>`;
}

export const writeReport = ({ out, url, engine, sizes, lines, saved, compared = [], failed }) => {
	const file = path.join(out, "report.html");
	const byFile = new Map(compared.map(result => [result.file, result]));
	const changed = compared.filter(result => result.isFailed).length;
	const log = lines.map(([kind, text]) => kind === "error" ? `<span class="bad">${escape(text)}</span>` : escape(text)).join("\n");
	const html = `<!doctype html>
		<html lang="en">
		<head>
		<meta charset="utf-8">
		<meta name="viewport" content="width=device-width, initial-scale=1">
		<title>webview-preview report</title>
		<style>${STYLE}</style>
		</head>
		<body>
		<main>
		<h1>webview-preview report <span class="status ${failed ? "bad" : "ok"}">${failed ? "failed" : "passed"}</span></h1>
		<p class="meta">${escape(url)} · ${escape(engine)} · ${escape(sizes.join(", "))} · ${saved.length} snapshot(s)${compared.length ? ` · ${changed} changed` : ""} · ${escape(new Date().toLocaleString())}</p>
		${log ? `<pre>${log}</pre>` : ""}
		${saved.map(snapshot => snapshotSection(snapshot, byFile.get(snapshot), out)).join("\n")}
		</main>
		</body>
		</html>
	`;
	writeFileSync(file, html);
	return file;
}