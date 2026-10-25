import { ANY_FUNCTION, RECORD_FUNCTION, toSource } from "#src/page/source.mjs";

const DEFAULT_COMMANDS = {
	"plugin:app|version": "0.0.0",
	"plugin:app|name": "app",
	"plugin:app|tauri_version": "2.0.0",
	"plugin:window|is_maximized": false,
	"plugin:window|is_minimized": false,
	"plugin:window|is_fullscreen": false,
	"plugin:window|is_focused": true,
	"plugin:window|is_visible": true,
	"plugin:window|is_decorated": true,
	"plugin:window|is_resizable": true,
	"plugin:window|scale_factor": () => window.devicePixelRatio,
	"plugin:window|inner_size": () => ({ width: window.innerWidth, height: window.innerHeight }),
	"plugin:window|outer_size": () => ({ width: window.innerWidth, height: window.innerHeight })
}

export const resolveTauri = (fromConfig, fromOptions) => {
	const pick = value => value === true ? {} : value && typeof value === "object" ? value : null;
	const config = pick(fromConfig);
	const options = pick(fromOptions);
	if (!config && !options) return null;
	return {
		label: options?.label ?? config?.label ?? "main",
		commands: { ...config?.commands, ...options?.commands }
	}
}

export const tauriScript = ({ label, commands }) => `(() => {
	const __webviewPreviewAny = ${ANY_FUNCTION};
	const record = ${RECORD_FUNCTION};
	const commands = Object.assign(${toSource(DEFAULT_COMMANDS)}, ${toSource(commands, "tauri")});
	const callbacks = new Map();
	const listeners = new Map();
	let nextId = 1;

	const transformCallback = (callback, once = false) => {
		const id = nextId++;
		callbacks.set(id, data => {
			if (once) callbacks.delete(id);
			return callback && callback(data);
		});
		return id;
	}

	const runCallback = (id, data) => {
		const callback = callbacks.get(id);
		if (callback) callback(data);
	}

	const removeListener = (event, id) => {
		callbacks.delete(id);
		const ids = listeners.get(event);
		if (ids && ids.includes(id)) ids.splice(ids.indexOf(id), 1);
	}

	const emit = (event, payload) => {
		for (const id of [...(listeners.get(event) || [])]) runCallback(id, { event, id, payload });
	}

	const events = {
		"plugin:event|listen": ({ event, handler }) => {
			if (!listeners.has(event)) listeners.set(event, []);
			listeners.get(event).push(handler);
			return handler;
		},
		"plugin:event|unlisten": ({ event, eventId }) => removeListener(event, eventId),
		"plugin:event|emit": ({ event, payload }) => emit(event, payload),
		"plugin:event|emit_to": ({ event, payload }) => emit(event, payload)
	}

	const invoke = async (command, args = {}) => {
		if (events[command]) return events[command](args) ?? null;
		const isKnown = Object.prototype.hasOwnProperty.call(commands, command);
		record("invoke " + command + (isKnown ? " -> stub" : " -> null"));
		if (!isKnown) return null;
		const answer = commands[command];
		return typeof answer === "function" ? answer(args) : answer;
	}

	window.__TAURI_INTERNALS__ = {
		invoke,
		transformCallback,
		unregisterCallback: id => callbacks.delete(id),
		runCallback,
		callbacks,
		convertFileSrc: (path, protocol = "asset") => protocol + "://localhost/" + encodeURIComponent(path),
		metadata: { currentWindow: { label: ${JSON.stringify(label)} }, currentWebview: { windowLabel: ${JSON.stringify(label)}, label: ${JSON.stringify(label)} } },
		plugins: { path: { sep: "/", delimiter: ":" } }
	}
	window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: removeListener }
	window.isTauri = true;
	window.__webviewPreview = Object.assign(window.__webviewPreview || {}, { emit });
})();`;