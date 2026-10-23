import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const CONFIG_FILES = ["webview-preview.config.mjs", "webview-preview.config.js", "webview-preview.config.json"];

export const loadConfig = async (configPath, cwd = process.cwd()) => {
	const file = configPath
		? path.resolve(cwd, configPath)
		: CONFIG_FILES.map(name => path.join(cwd, name)).find(candidate => existsSync(candidate));
	if (!file) return {}
	if (!existsSync(file)) throw new Error(`Config not found: ${file}`);
	if (file.endsWith(".json")) return { ...JSON.parse(readFileSync(file, "utf8")), configDir: path.dirname(file) }
	const module = await import(pathToFileURL(file).href);
	return { ...(module.default ?? module), configDir: path.dirname(file) }
}