import { mkdirSync } from "node:fs";
import path from "node:path";
import { compareSnapshots } from "#src/snapshots/compare.mjs";
import { loadConfig } from "#src/core/config.mjs";
import { resolveEngine, runEngine } from "#src/engines/index.mjs";
import { resolveInit } from "#src/page/init.mjs";
import { compileMock, mockScript, resolveMockFiles } from "#src/page/mock.mjs";
import { startServer } from "#src/core/server.mjs";
import { parseSize, parseSteps } from "#src/core/steps.mjs";

export { ENGINES } from "#src/engines/index.mjs";
export { REQUESTS_KEY } from "#src/page/mock.mjs";
export { cleanSnapshots } from "#src/snapshots/clean.mjs";

const DEFAULTS = { engine: "auto", size: "1200x650", out: ".webview-preview", steps: ["snap:page"] }
const ABSOLUTE_URL = /^[a-z][a-z\d+.-]*:/i;

const consoleLog = {
	info: message => console.log(message),
	error: message => console.error(message)
}

export const resolveUrl = (target, baseUrl) => {
	if (ABSOLUTE_URL.test(target)) return target;
	if (!baseUrl) throw new Error(`"${target}" is not a full URL; set baseUrl to open routes`);
	return `${baseUrl}${target.startsWith("/") ? target : `/${target}`}`;
}

export const preview = async (options = {}) => {
	const config = options.config === false ? {} : await loadConfig(options.config);
	const merged = { ...DEFAULTS, ...config, ...Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined)) }
	const baseDir = config.configDir ?? process.cwd();
	const engine = resolveEngine(merged.engine);
	const steps = parseSteps(merged.steps.length ? merged.steps : DEFAULTS.steps);
	const out = path.resolve(baseDir, merged.out);
	const url = resolveUrl(merged.target ?? merged.url ?? "/", merged.baseUrl);
	parseSize(merged.size);
	const mockFiles = await resolveMockFiles(options.mockFile, process.cwd());
	const hasMock = config.mock !== undefined || options.mock !== undefined || mockFiles.length > 0
		|| !!(options.logRequests ?? config.logRequests);
	const mockRules = compileMock([config.mock, ...mockFiles, options.mock]);
	const init = (hasMock ? [mockScript(mockRules)] : []).concat(resolveInit([
		{ entries: config.init, baseDir },
		{ entries: options.init, baseDir: process.cwd() },
		{ entries: options.initFile && [].concat(options.initFile).map(file => ({ file })), baseDir: process.cwd() }
	], baseDir));
	mkdirSync(out, { recursive: true });

	const server = merged.server && { cwd: baseDir, ...merged.server }
	const stopServer = await startServer(server);
	try {
		const result = await runEngine(engine, {
			url,
			steps,
			init,
			size: merged.size,
			out,
			prefix: merged.prefix ?? `${engine}-`,
			scale: merged.scale === undefined ? undefined : Number(merged.scale),
			snapMargin: Number(merged.snapMargin ?? 8),
			isHeaded: !!merged.headed,
			isStorageKept: !!merged.keepStorage,
			waitForTimeoutMs: Number(merged.waitTimeout ?? 10000),
			log: merged.log ?? consoleLog
		});
		const shouldCompare = !!(merged.compare || merged.updateBaseline);
		const compareFailed = shouldCompare && compareSnapshots({
			saved: result.saved,
			baselineDir: path.resolve(baseDir, merged.baseline ?? "webview-preview-baseline"),
			updateBaseline: !!merged.updateBaseline,
			tolerance: Number(merged.compareTolerance ?? 2),
			maxDiffPixels: Number(merged.maxDiffPixels ?? 0),
			log: merged.log ?? consoleLog
		});
		return { engine, url, ...result, failed: result.failed || compareFailed }
	} finally {
		stopServer();
	}
}

export const defineConfig = config => config;