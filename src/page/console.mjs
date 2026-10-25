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

export const watchConsole = log => {
	const entries = [];
	const info = message => {
		if (typeof message === "string" && message.startsWith(MARKER)) {
			entries.push(...JSON.parse(message.slice(MARKER.length)));
			return;
		}
		log.info(message);
	}
	const report = () => {
		for (const { kind, message, count } of entries) log.error(`${kind}: ${message}${count > 1 ? ` (×${count})` : ""}`);
		return entries.length;
	}
	return { log: { ...log, info }, report }
}