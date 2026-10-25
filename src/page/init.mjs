import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ERRORS_KEY = "__webviewPreviewInitErrors";
export const INIT_ERRORS_EXPRESSION = `JSON.stringify(window.${ERRORS_KEY} || [])`;
const toList = value => value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];

const readEntry = (entry, baseDir, index) => {
	if (typeof entry === "string") return { label: `init[${index}]`, source: entry }
	if (entry && typeof entry.file === "string") {
		const file = path.resolve(baseDir, entry.file);
		if (!existsSync(file)) throw new Error(`init file not found: ${file}`);
		return { label: path.basename(file), source: readFileSync(file, "utf8") }
	}
	throw new Error(`init entries must be code strings or { file: "path" }, got ${JSON.stringify(entry)}`);
}

export const wrapInit = ({ label, source }) => `{
	try {
		${source}
	} catch (error) {
		(window.${ERRORS_KEY} = window.${ERRORS_KEY} || []).push(${JSON.stringify(label)} + ": " + (error && error.message || error));
	}
}`;

export const resolveInit = (groups, baseDir) => groups
	.flatMap(group => toList(group.entries).map(entry => ({ entry, baseDir: group.baseDir })))
	.map(({ entry, baseDir: dir }, index) => wrapInit(readEntry(entry, dir ?? baseDir, index)));

export const reportInitErrors = (json, log) => {
	for (const message of JSON.parse(json || "[]")) log.error(`init failed: ${message}`);
}