import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const FOLDER = "webview-preview";
const FILE = "annotate.json";

export const settingsFile = () => {
	if (process.env.WEBVIEW_PREVIEW_SETTINGS) return process.env.WEBVIEW_PREVIEW_SETTINGS;
	if (process.platform === "linux") return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), FOLDER, FILE);
	if (process.platform === "win32") return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), FOLDER, FILE);
	if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", FOLDER, FILE);
	return path.join(os.homedir(), `.${FOLDER}`, FILE);
}

export const loadAnnotateKeys = () => {
	try {
		const { keys } = JSON.parse(readFileSync(settingsFile(), "utf8"));
		return keys && typeof keys === "object" ? keys : null;
	} catch {
		return null;
	}
}

export const saveAnnotateKeys = keys => {
	const file = settingsFile();
	mkdirSync(path.dirname(file), { recursive: true });
	writeFileSync(file, JSON.stringify({ keys }, null, "\t"));
	return file;
}