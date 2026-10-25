import { REQUESTS_KEY } from "#src/page/mock.mjs";

export const NETWORK_STEPS = new Set(["offline", "online", "latency"]);

export const checkLatency = value => {
	if (value === undefined) return 0;
	if (!/^\d+$/.test(String(value))) throw new Error(`latency needs milliseconds, got "${value}"`);
	return Number(value);
}

export const networkStep = (kind, value, step) => {
	if (kind === "latency" && !/^\d+$/.test(value)) throw new Error(`latency needs milliseconds, got "${step}"`);
	if (kind !== "latency" && value) throw new Error(`${kind} takes no value, got "${step}"`);
	const state = kind === "latency" ? { latencyMs: Number(value) } : { isOffline: kind === "offline" }
	return { kind: "js", value: `window.__webviewPreview.network(${JSON.stringify(state)})` }
}

export const networkScript = ({ isOffline, latencyMs }) => `(() => {
	const state = { isOffline: ${!!isOffline}, latencyMs: ${latencyMs} }
	const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
	const record = (method, url) => {
		const requests = window.${REQUESTS_KEY};
		if (!requests) return;
		const address = new URL(url, location.href);
		const shown = address.origin === location.origin ? address.pathname + address.search : address.href;
		requests.push(method + " " + shown + " -> offline");
	}

	const onLine = Object.getOwnPropertyDescriptor(Navigator.prototype, "onLine");
	Object.defineProperty(Navigator.prototype, "onLine", {
		configurable: true,
		get() {
			return state.isOffline ? false : onLine.get.call(this);
		}
	});

	const network = next => {
		const wasOffline = state.isOffline;
		Object.assign(state, next);
		if (wasOffline !== state.isOffline) window.dispatchEvent(new Event(state.isOffline ? "offline" : "online"));
	}

	const originalFetch = window.fetch;
	window.fetch = async function (input, init) {
		if (state.latencyMs) await wait(state.latencyMs);
		if (state.isOffline) {
			const url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
			record(String(init && init.method || input && input.method || "GET").toUpperCase(), url);
			throw new TypeError("Failed to fetch");
		}
		return originalFetch.call(this, input, init);
	}

	const define = (target, name, value) => Object.defineProperty(target, name, { value, configurable: true });
	const originalOpen = XMLHttpRequest.prototype.open;
	const originalSend = XMLHttpRequest.prototype.send;
	XMLHttpRequest.prototype.open = function (method, url, ...rest) {
		this.__webviewPreviewNetwork = { method: String(method).toUpperCase(), url: String(url) }
		return originalOpen.call(this, method, url, ...rest);
	}

	XMLHttpRequest.prototype.send = function (body) {
		const xhr = this;
		const info = xhr.__webviewPreviewNetwork;
		const send = () => {
			if (!state.isOffline) return originalSend.call(xhr, body);
			if (info) record(info.method, info.url);
			define(xhr, "readyState", 4);
			define(xhr, "status", 0);
			xhr.dispatchEvent(new Event("readystatechange"));
			xhr.dispatchEvent(new ProgressEvent("error"));
			xhr.dispatchEvent(new ProgressEvent("loadend"));
		}
		if (state.latencyMs || state.isOffline) setTimeout(send, state.latencyMs);
		else send();
	}

	window.__webviewPreview = Object.assign(window.__webviewPreview || {}, { network });
})();`;