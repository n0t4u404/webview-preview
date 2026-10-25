import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { INIT_ERRORS_EXPRESSION, reportInitErrors } from "#src/page/init.mjs";
import { JS_SETTLE_MS, LOAD_SETTLE_MS, parseSize, TIMEOUT_MS, WAIT_FOR_POLL_MS, WAIT_FOR_TIMEOUT_MS } from "#src/core/steps.mjs";

const SCRIPT = fileURLToPath(new URL("./webkitgtk.py", import.meta.url));
const PROBE = "import gi; gi.require_version('Gtk', '3.0'); gi.require_version('WebKit2', '4.1')";

export const isWebkitGtkAvailable = () => process.platform === "linux"
	&& spawnSync("python3", ["-c", PROBE], { stdio: "ignore" }).status === 0;

export const runWebkitGtk = ({
	url, steps, init = [], size, colorScheme,
	isMotionReduced = false, out, prefix, snapMargin = 8,
	isHeaded = false, isStorageKept = false,
	waitForTimeoutMs = WAIT_FOR_TIMEOUT_MS, timeoutMs = TIMEOUT_MS, log
}) => new Promise((resolve, reject) => {
	if (!isWebkitGtkAvailable()) {
		reject(new Error("WebKitGTK engine needs Linux with python3-gi and WebKit2 4.1 (gir1.2-webkit2-4.1)"));
		return;
	}

	const { width, height } = parseSize(size);
	const child = spawn("python3", [
		SCRIPT, url,
		"--init-errors", INIT_ERRORS_EXPRESSION,
		"--out", out,
		"--prefix", prefix,
		"--width", String(width),
		"--height", String(height),
		"--snap-margin", String(snapMargin),
		...(colorScheme ? ["--color-scheme", colorScheme] : []),
		...(isMotionReduced ? ["--reduced-motion"] : []),
		...(isHeaded ? ["--headed"] : []),
		...(isStorageKept ? ["--keep-storage"] : []),
		"--wait-for-timeout-ms", String(waitForTimeoutMs),
		"--wait-for-poll-ms", String(WAIT_FOR_POLL_MS),
		"--load-settle-ms", String(LOAD_SETTLE_MS),
		"--js-settle-ms", String(JS_SETTLE_MS),
		"--timeout-ms", String(timeoutMs)
	], {
		stdio: ["pipe", "pipe", "pipe"],
		env: { PYTHONUNBUFFERED: "1", ...process.env }
	});

	child.stdin.on("error", () => undefined);
	child.stdin.end(JSON.stringify({ steps, init }));

	const saved = [];
	let buffer = "";
	child.stdout.setEncoding("utf8");
	child.stdout.on("data", chunk => {
		buffer += chunk;
		const lines = buffer.split("\n");
		buffer = lines.pop() ?? "";
		for (const line of lines) {
			const tab = line.indexOf("\t");
			if (tab === -1) continue;
			const kind = line.slice(0, tab);
			const value = JSON.parse(line.slice(tab + 1));
			if (kind === "saved") saved.push(value);
			else if (kind === "print") log.info(value);
			else if (kind === "error") log.error(value);
			else if (kind === "init-errors") reportInitErrors(value, log);
		}
	});
	child.stderr.setEncoding("utf8");
	child.stderr.on("data", chunk => {
		for (const line of chunk.split("\n")) {
			if (line.trim() && !/Gdk-(WARNING|CRITICAL)/.test(line)) process.stderr.write(`${line}\n`);
		}
	});
	child.once("error", reject);
	child.once("exit", code => resolve({ saved, failed: code !== 0 }));
});