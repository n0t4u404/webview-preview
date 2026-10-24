import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "#src/core/config.mjs";

const DURATION = /^(\d+)(m|h|d)$/;
const UNIT_MS = {
	m: 60_000,
	h: 3_600_000,
	d: 86_400_000
}

const parseDuration = value => {
	const match = DURATION.exec(String(value));
	if (!match) throw new Error(`--older-than needs a duration like 30m, 2h or 7d, got "${value}"`);
	return Number(match[1]) * UNIT_MS[match[2]];
}

export const cleanSnapshots = async (options = {}) => {
	const config = options.config === false ? {} : await loadConfig(options.config);
	const baseDir = config.configDir ?? process.cwd();
	const out = path.resolve(baseDir, options.out ?? config.out ?? ".webview-preview");
	const baseline = path.resolve(baseDir, options.baseline ?? config.baseline ?? "webview-preview-baseline");
	const protectedDirs = [path.parse(out).root, os.homedir(), process.cwd(), baseDir, baseline].map(dir => path.resolve(dir));
	if (protectedDirs.includes(out)) throw new Error(`refusing to clean ${out}: point "out" at a folder used only for snapshots`);
	if (!existsSync(out)) return { removed: [], out }

	const maxAge = options.olderThan ? parseDuration(options.olderThan) : 0;
	const now = Date.now();
	const removed = readdirSync(out)
		.filter(name => name.toLowerCase().endsWith(".png"))
		.map(name => path.join(out, name))
		.filter(file => statSync(file).isFile() && now - statSync(file).mtimeMs >= maxAge);
	if (!options.dryRun) for (const file of removed) rmSync(file);
	return { removed, out }
}