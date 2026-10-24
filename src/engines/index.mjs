import { isWebkitGtkAvailable, runWebkitGtk } from "#src/engines/webkitgtk.mjs";
import { runPlaywright } from "#src/engines/playwright.mjs";

export const ENGINES = ["auto", "webkitgtk", "msedge", "chrome", "chromium", "webkit"];

export const resolveEngine = engine => {
	if (!ENGINES.includes(engine)) throw new Error(`Unknown engine "${engine}". Engines: ${ENGINES.join(", ")}`);
	if (engine !== "auto") return engine;
	if (isWebkitGtkAvailable()) return "webkitgtk";
	if (process.platform === "win32") return "msedge";
	if (process.platform === "darwin") return "webkit";
	throw new Error("No engine found for auto: install WebKitGTK for Python (python3-gi, gir1.2-webkit2-4.1) or pass --engine chrome / chromium");
}

export const runEngine = (engine, options) => engine === "webkitgtk"
	? runWebkitGtk(options)
	: runPlaywright({ engine, ...options });