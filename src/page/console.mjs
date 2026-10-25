import { ASSERT_MARKER, FOCUS_MARKER } from "#src/core/steps.mjs";

export const CONSOLE_KEY = "__webviewPreviewConsole";
const MARKER = "__webviewPreviewConsole:";

export const consoleScript = () => `(() => {
	const entries = window.${CONSOLE_KEY} = window.${CONSOLE_KEY} || [];
	const text = value => {
		if (value instanceof Error) {
			const head = value.name + ": " + value.message;
			const stack = String(value.stack || "");
			const frame = stack.split("\\n").find(line => line && !line.startsWith(head)) || "";
			return frame ? head + " — " + frame.trim() : head;
		}
		if (typeof value === "string") return value;
		try {
			return JSON.stringify(value);
		} catch {
			return String(value);
		}
	}
	const add = (kind, message) => {
		const last = entries[entries.length - 1];
		if (last && last.kind === kind && last.message === message) last.count += 1;
		else entries.push({ kind, message: message.slice(0, 2000), count: 1 });
	}
	const originalError = console.error;
	console.error = (...args) => {
		add("console.error", args.map(text).join(" "));
		return originalError.apply(console, args);
	}
	window.addEventListener("error", event => {
		const where = event.filename ? " (" + event.filename.replace(location.origin, "") + ":" + event.lineno + ")" : "";
		add("uncaught", event.error ? text(event.error) : event.message + where);
	});
	window.addEventListener("unhandledrejection", event => add("unhandled rejection", text(event.reason)));
})();`;

export const consoleStep = { kind: "print", value: `"${MARKER}" + JSON.stringify(window.${CONSOLE_KEY} || [])`, isInternal: true }

export const watchOutput = log => {
	const entries = [];
	let failedAsserts = 0;
	let focus = null;
	const printFocus = () => {
		const { presses, items } = focus;
		const firstPath = items[0]?.path;
		const loopAt = items.findIndex((item, index) => index > 0 && item.path !== undefined && item.path === firstPath);
		const shown = loopAt === -1 ? items : items.slice(0, loopAt);
		log.info(`focus order (Tab ×${presses}):`);
		shown.forEach((item, index) => log.info(`  ${index + 1}. ${item.label ?? "(nothing focused)"}`));
		if (loopAt !== -1) log.info(`  → back to 1 after ${loopAt} stop${loopAt === 1 ? "" : "s"}`);
	}
	const info = message => {
		if (typeof message !== "string") return log.info(message);
		if (message.startsWith(MARKER)) {
			entries.push(...JSON.parse(message.slice(MARKER.length)));
			return;
		}
		
		if (message.startsWith(FOCUS_MARKER)) {
			const [type, value, path] = JSON.parse(message.slice(FOCUS_MARKER.length));
			if (type === "start") focus = { presses: value, items: [] }
			else if (type === "item" && focus) focus.items.push({ label: value, path });
			else if (type === "end" && focus) {
				printFocus();
				focus = null;
			}
			return;
		}
		if (message.startsWith(ASSERT_MARKER)) {
			const [expression, problem] = JSON.parse(message.slice(ASSERT_MARKER.length));
			if (problem === null) return log.info(`assert ok: ${expression}`);
			failedAsserts += 1;
			return log.error(`assert failed: ${expression} — ${problem}`);
		}
		log.info(message);
	}
	const report = () => {
		for (const { kind, message, count } of entries) log.error(`${kind}: ${message}${count > 1 ? ` (×${count})` : ""}`);
		return { consoleErrors: entries.length, failedAsserts }
	}
	return { log: { ...log, info }, report }
}