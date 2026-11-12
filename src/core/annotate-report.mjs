import { writeFileSync } from "node:fs";
import path from "node:path";

const routeOf = (url, baseUrl) => (baseUrl && url.startsWith(baseUrl) ? url.slice(baseUrl.length) || "/" : url);

const localTime = date => {
	const pad = value => String(value).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const sourceText = source => (source ? `${source.file}${source.line ? `:${source.line}` : ""}` : null);

const markdown = report => {
	const lines = [`# annotate: ${report.name}`, ""];
	const { page } = report;
	lines.push(`${page.route} · ${page.engine} · ${page.size.width}×${page.size.height} · ${localTime(new Date(page.takenAt))}`, "");
	if (report.image) lines.push(`![${report.name}](${report.image})`, "");
	for (const note of report.notes) {
		lines.push(`## ${note.id}. ${note.text || "(no text)"}`, "");
		if (note.url && note.url !== page.url) lines.push(`On another page: \`${routeOf(note.url, report.baseUrl)}\``, "");
		for (const id of note.elements) {
			const element = report.elements[id];
			if (!element) continue;
			const where = sourceText(element.component?.source);
			const component = element.component?.name ? `\`${element.component.name}\` ` : "";
			lines.push(`- ${component}${element.label}${where ? ` — \`${where}\`` : ""}`);
			lines.push(`  - selector: \`${element.selector}\``);
			if (element.image) lines.push("", `  ![${id}](${element.image})`, "");
		}
		lines.push("");
	}
	if (report.generalNote) lines.push("## General note", "", report.generalNote, "");
	return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

export const writeAnnotationReport = ({ annotation, out, prefix, engine, url, baseUrl, size }) => {
	const { result } = annotation;
	const report = {
		version: 1,
		baseUrl,
		name: annotation.name,
		status: annotation.status,
		page: {
			url: result?.url ?? url,
			route: routeOf(result?.url ?? url, baseUrl),
			engine,
			size: result?.viewport ?? size,
			scale: annotation.scale ?? 1,
			takenAt: new Date().toISOString()
		},
		image: annotation.image ?? null,
		notes: result?.notes ?? [],
		generalNote: result?.generalNote ?? null,
		maskedCount: result?.maskedCount ?? 0,
		elements: result?.elements ?? {}
	}
	if (result) {
		delete result.url;
		delete result.viewport;
	}
	const base = path.join(out, `${prefix}annotate-${annotation.name}`);
	writeFileSync(`${base}.md`, markdown(report));
	delete report.baseUrl;
	writeFileSync(`${base}.json`, JSON.stringify(report, null, "\t"));
	return { json: `${base}.json`, markdown: `${base}.md`, report }
}