import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { compareSnapshots } from "#src/snapshots/compare.mjs";
import { stitchFilm } from "#src/snapshots/film.mjs";
import { writeReport } from "#src/snapshots/report.mjs";
import { loadConfig } from "#src/core/config.mjs";
import { resolveEngine, runEngine } from "#src/engines/index.mjs";
import { consoleScript, consoleStep, watchOutput } from "#src/page/console.mjs";
import { checkLocale, globalsScript, localeScript } from "#src/page/globals.mjs";
import { resolveInit, wrapInit } from "#src/page/init.mjs";
import { compileMock, mockScript, resolveMockFiles } from "#src/page/mock.mjs";
import { startServer } from "#src/core/server.mjs";
import { watchFiles } from "#src/core/watch.mjs";
import { expandMacros, parseSize, parseSteps } from "#src/core/steps.mjs";
import { checkLatency, networkScript } from "#src/page/network.mjs";
import { resolveTauri, tauriScript } from "#src/page/tauri.mjs";

export { ENGINES } from "#src/engines/index.mjs";
export { REQUESTS_KEY } from "#src/page/mock.mjs";
export { cleanSnapshots } from "#src/snapshots/clean.mjs";
export { anyApi } from "#src/page/source.mjs";

const DEFAULTS = { engine: "auto", size: "1200x650", out: ".webview-preview", steps: ["snap:page"] }
const ABSOLUTE_URL = /^[a-z][a-z\d+.-]*:/i;

const consoleLog = {
	info: message => console.log(message),
	error: message => console.error(message)
}

export const resolveUrl = (target, baseUrl) => {
	if (ABSOLUTE_URL.test(target)) return target;
	if (!baseUrl) throw new Error(`"${target}" is not a full URL; set baseUrl to open routes`);
	const route = target.startsWith("/") ? target : `/${target}`;
	return baseUrl.endsWith("/") ? `${baseUrl}${route.slice(1)}` : `${baseUrl}${route}`;
}

const COLOR_SCHEMES = ["light", "dark"];

const parseSizes = value => {
	const sizes = [].concat(value).flatMap(item => String(item).split(",")).map(item => item.trim()).filter(Boolean);
	if (!sizes.length) throw new Error("size needs at least one WxH");
	for (const size of sizes) parseSize(size);
	return sizes;
}

const checkColorScheme = value => {
	if (value === undefined) return undefined;
	if (!COLOR_SCHEMES.includes(value)) throw new Error(`colorScheme must be ${COLOR_SCHEMES.join(" or ")}, got "${value}"`);
	return value;
}

export const preview = async (options = {}) => {
	const config = options.config === false ? {} : await loadConfig(options.config);
	const merged = { ...DEFAULTS, ...config, ...Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined)) }
	const baseDir = config.configDir ?? process.cwd();
	const engine = resolveEngine(merged.engine);
	const macros = { ...config.macros, ...options.macros }
	const steps = parseSteps(expandMacros(merged.steps.length ? merged.steps : DEFAULTS.steps, macros));
	const out = path.resolve(baseDir, merged.out);
	const url = resolveUrl(merged.target ?? merged.url ?? "/", merged.baseUrl);
	const sizes = parseSizes(merged.size);
	const snapMargin = Number(merged.snapMargin ?? 8);
	const colorScheme = checkColorScheme(merged.colorScheme);
	const mockFiles = await resolveMockFiles(options.mockFile, process.cwd());
	const hasMock = config.mock !== undefined || options.mock !== undefined || mockFiles.length > 0
		|| !!(options.logRequests ?? config.logRequests);
	const mockRules = compileMock([config.mock, ...mockFiles, options.mock]);
	const locale = merged.locale === undefined ? undefined : checkLocale(String(merged.locale));
	const tauri = resolveTauri(config.tauri, options.tauri);
	const globals = { ...config.globals, ...options.globals }
	const network = { isOffline: !!merged.offline, latencyMs: checkLatency(merged.latency) }
	const checked = stubs => stubs.filter(Boolean).map(stub => {
		try {
			new Function(stub.source);
		} catch (error) {
			throw new Error(`${stub.label}: the generated script does not parse (${error.message}); check the functions in your config`);
		}
		return wrapInit(stub);
	});
	const init = [
		...checked([
			{ label: "console", source: consoleScript() },
			locale && { label: "locale", source: localeScript(locale) },
			tauri && { label: "tauri", source: tauriScript(tauri) },
			Object.keys(globals).length && { label: "globals", source: globalsScript(globals) }
		]),
		...(hasMock ? [mockScript(mockRules)] : []),
		...checked([{ label: "network", source: networkScript(network) }]),
		...resolveInit([
			{ entries: config.init, baseDir },
			{ entries: options.init, baseDir: process.cwd() },
			{ entries: options.initFile && [].concat(options.initFile).map(file => ({ file })), baseDir: process.cwd() }
		], baseDir)
	];
	mkdirSync(out, { recursive: true });

	const baseLog = merged.log ?? consoleLog;
	const lines = [];
	const log = {
		info: message => {
			lines.push(["info", message]);
			baseLog.info(message);
		},
		error: message => {
			lines.push(["error", message]);
			baseLog.error(message);
		}
	}
	const output = watchOutput(log);
	const server = merged.server && { cwd: baseDir, ...merged.server }
	const stopServer = await startServer(server);
	try {
		const prefix = merged.prefix ?? `${engine}-`;
		const result = { saved: [], failed: false }
		for (const size of sizes) {
			if (sizes.length > 1) output.log.info(`size ${size}`);
			const run = await runEngine(engine, {
				url,
				steps: [...steps, consoleStep],
				init,
				size,
				locale,
				colorScheme,
				isMotionReduced: !!merged.reducedMotion,
				out,
				prefix: sizes.length > 1 ? `${prefix}${size}-` : prefix,
				scale: merged.scale === undefined ? undefined : Number(merged.scale),
				snapMargin,
				isHeaded: !!merged.headed,
				isStorageKept: !!merged.keepStorage,
				waitForTimeoutMs: Number(merged.waitTimeout ?? 10000),
				log: output.log
			});
			result.saved.push(...run.saved);
			for (const film of run.films ?? []) {
				try {
					output.log.info(stitchFilm(film, snapMargin));
					result.saved.push(film.file);
				} catch (error) {
					output.log.error(`film:${film.name} failed: ${error.message}`);
					result.failed = true;
				}
			}
			result.failed ||= run.failed;
		}
		
		const { consoleErrors, failedAsserts } = output.report();
		const shouldCompare = !!(merged.compare || merged.updateBaseline);
		const compared = shouldCompare ? compareSnapshots({
			saved: result.saved,
			baselineDir: path.resolve(baseDir, merged.baseline ?? "webview-preview-baseline"),
			updateBaseline: !!merged.updateBaseline,
			tolerance: Number(merged.compareTolerance ?? 2),
			maxDiffPixels: Number(merged.maxDiffPixels ?? 0),
			log
		}) : { failed: false, results: [] }
		const consoleFailed = !!merged.failOnError && consoleErrors > 0;
		const failed = result.failed || compared.failed || consoleFailed || failedAsserts > 0;
		const report = merged.report
			? writeReport({ out, url, engine, sizes, lines, saved: result.saved, compared: compared.results, failed })
			: undefined;
		if (report) baseLog.info(`report → ${report}`);
		return { engine, url, sizes, ...result, consoleErrors, failedAsserts, report, failed }
	} finally {
		stopServer();
	}
}

export const watchPreview = async (options = {}, onRun = () => {}) => {
	const config = options.config === false ? {} : await loadConfig(options.config);
	const baseDir = config.configDir ?? process.cwd();
	const log = options.log ?? consoleLog;
	const entries = [].concat(options.watch ?? config.watch ?? (existsSync(path.join(baseDir, "src")) ? "src" : "."));
	const folders = entries.map(entry => path.resolve(baseDir, entry));
	const isConfigWatched = !config.configFile || folders.some(folder => config.configFile === folder || config.configFile.startsWith(folder + path.sep));
	const targets = isConfigWatched ? folders : [...folders, config.configFile];
	const ignore = [
		path.resolve(baseDir, options.out ?? config.out ?? DEFAULTS.out),
		path.resolve(baseDir, options.baseline ?? config.baseline ?? "webview-preview-baseline")
	];
	const server = options.server ?? config.server;
	const stopServer = await startServer(server && { cwd: baseDir, ...server });
	let isRunning = false;
	let next = null;

	const run = async reason => {
		if (isRunning) {
			next = reason;
			return;
		}
		isRunning = true;
		log.info(reason);
		try {
			onRun(await preview(options));
		} catch (error) {
			log.error(`webview-preview: ${error.message}`);
		}
		isRunning = false;
		if (next) {
			const queued = next;
			next = null;
			await run(queued);
		}
	}

	let stopWatching;
	try {
		stopWatching = watchFiles({
			targets,
			ignore,
			onChange: file => run(`\nchanged ${path.relative(baseDir, file) || file}, running again`)
		});
	} catch (error) {
		stopServer();
		throw error;
	}
	
	await run(`watching ${targets.map(target => path.relative(baseDir, target) || ".").join(", ")}; Ctrl+C to stop`);
	return () => {
		stopWatching();
		stopServer();
	}
}

export const defineConfig = config => config;