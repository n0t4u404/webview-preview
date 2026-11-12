import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_VALUES = new Map([...BASE64].map((character, index) => [character, index]));
const SOURCE_MAP_COMMENT = /\/\/[#@]\s*sourceMappingURL=(\S+)\s*$/m;

export const decodeVlq = segment => {
	const values = [];
	let value = 0;
	let shift = 0;
	for (const character of segment) {
		const digit = BASE64_VALUES.get(character);
		if (digit === undefined) throw new Error(`bad source map character "${character}"`);
		value += (digit & 31) << shift;
		if (digit & 32) {
			shift += 5;
			continue;
		}
		values.push(value & 1 ? -(value >>> 1) : value >>> 1);
		value = 0;
		shift = 0;
	}
	return values;
}

export const originalPosition = (map, line, column) => {
	const lines = map.mappings.split(";");
	if (line < 1 || line > lines.length) return null;
	let sourceIndex = 0;
	let sourceLine = 0;
	let sourceColumn = 0;
	let best = null;
	for (let index = 0; index < line; index += 1) {
		let generatedColumn = 0;
		for (const segment of lines[index].split(",")) {
			if (!segment) continue;
			const [columnDelta, sourceDelta, lineDelta, sourceColumnDelta] = decodeVlq(segment);
			generatedColumn += columnDelta;
			if (sourceDelta === undefined) continue;
			sourceIndex += sourceDelta;
			sourceLine += lineDelta;
			sourceColumn += sourceColumnDelta;
			if (index === line - 1 && generatedColumn <= column - 1) {
				best = { source: map.sources[sourceIndex], line: sourceLine + 1, column: sourceColumn + 1 }
			}
		}
	}
	return best;
}

const readText = async url => {
	if (url.startsWith("file:")) return readFile(fileURLToPath(url), "utf8");
	const response = await fetch(url);
	if (!response.ok) throw new Error(`${response.status}`);
	return response.text();
}

const loadMap = async moduleUrl => {
	const code = await readText(moduleUrl);
	const reference = SOURCE_MAP_COMMENT.exec(code)?.[1];
	if (!reference) return null;
	if (reference.startsWith("data:")) {
		const comma = reference.indexOf(",");
		const isBase64 = reference.slice(0, comma).endsWith(";base64");
		const body = reference.slice(comma + 1);
		return JSON.parse(isBase64 ? Buffer.from(body, "base64").toString("utf8") : decodeURIComponent(body));
	}
	return JSON.parse(await readText(new URL(reference, moduleUrl).href));
}

const projectPath = (file, baseDir) => {
	if (!path.isAbsolute(file)) return file.replaceAll("\\", "/");
	const relative = path.relative(baseDir, path.resolve(file));
	const isInside = relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
	return (isInside ? relative : file).replaceAll("\\", "/");
}

const SKIPPED_FOLDERS = new Set(["node_modules", ".git", "dist", "build", "target", "out"]);

const projectRoots = baseDir => {
	const roots = [baseDir];
	const walk = (folder, depth) => {
		if (depth === 0) return;
		let entries = [];
		try {
			entries = readdirSync(folder, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (!entry.isDirectory() || entry.name.startsWith(".") || SKIPPED_FOLDERS.has(entry.name)) continue;
			const child = path.join(folder, entry.name);
			roots.push(child);
			walk(child, depth - 1);
		}
	}
	walk(baseDir, 2);
	return roots;
}

const onDisk = (file, roots) => {
	if (existsSync(file)) return file;
	return roots.map(root => path.join(root, file)).find(candidate => existsSync(candidate)) ?? file;
}

const sourcePath = (map, source, moduleUrl, baseDir, roots) => {
	const root = map.sourceRoot ? new URL(map.sourceRoot, moduleUrl).href : moduleUrl;
	let file = source;
	if (/^[a-z][\w+.-]*:/i.test(source)) file = source.startsWith("file:") ? fileURLToPath(source) : source;
	else if (!path.isAbsolute(source)) {
		const resolved = new URL(source, root);
		file = resolved.protocol === "file:" ? fileURLToPath(resolved) : decodeURIComponent(resolved.pathname);
	}
	if (path.isAbsolute(file)) file = onDisk(file, roots());
	return projectPath(file, baseDir);
}

export const createSourceResolver = baseDir => {
	const maps = new Map();
	let roots = null;
	const getRoots = () => roots ??= projectRoots(baseDir);
	const mapFor = url => {
		if (!maps.has(url)) maps.set(url, loadMap(url).catch(() => null));
		return maps.get(url);
	}
	return async frame => {
		if (!frame) return null;
		if (frame.file) {
			const file = path.isAbsolute(frame.file) ? onDisk(frame.file, getRoots()) : frame.file;
			return { file: projectPath(file, baseDir), line: frame.line, column: frame.column, how: frame.how ?? "debug-source" }
		}
		const map = await mapFor(frame.url);
		const position = map && originalPosition(map, frame.line, frame.column);
		if (!position) return { file: frame.url, line: frame.line, column: frame.column, how: "debug-stack", isMapped: false }
		return { file: sourcePath(map, position.source, frame.url, baseDir, getRoots), line: position.line, column: position.column, how: "debug-stack" }
	}
}