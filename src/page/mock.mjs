import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const RESPONSE_KEYS = new Set(["status", "json", "body", "headers", "delayMs"]);
export const REQUESTS_KEY = "__webviewPreviewRequests";

const globToRegExp = pattern => {
	const source = pattern
		.split(/(\*\*|\*)/)
		.map(part => part === "**" ? ".*" : part === "*" ? "[^/]*" : part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
		.join("");
	return `^${source}$`;
}

const parseKey = key => {
	const [first, ...rest] = key.trim().split(/\s+/);
	const hasMethod = METHODS.has(first.toUpperCase()) && rest.length > 0;
	const pattern = hasMethod ? rest.join(" ") : key.trim();
	return {
		method: hasMethod ? first.toUpperCase() : null,
		pattern,
		regex: globToRegExp(pattern),
		isFullUrl: /^https?:\/\//i.test(pattern),
		withQuery: pattern.includes("?")
	}
}

const parseResponse = (key, response) => {
	if (!response || typeof response !== "object") throw new Error(`mock "${key}" must be an object like { json: … } or { status: 500 }`);
	const unknown = Object.keys(response).filter(name => !RESPONSE_KEYS.has(name));
	if (unknown.length) throw new Error(`mock "${key}": unknown field ${unknown.join(", ")}; use ${[...RESPONSE_KEYS].join(", ")}`);
	if ("json" in response && "body" in response) throw new Error(`mock "${key}": use json or body, not both`);
	const isJson = "json" in response;
	return {
		status: response.status ?? 200,
		body: isJson ? JSON.stringify(response.json) : String(response.body ?? ""),
		headers: { ...(isJson ? { "content-type": "application/json" } : {}), ...(response.headers ?? {}) },
		delayMs: response.delayMs ?? 0
	}
}

export const loadMockFile = async file => {
	if (!existsSync(file)) throw new Error(`mock file not found: ${file}`);
	if (file.endsWith(".json")) return JSON.parse(readFileSync(file, "utf8"));
	const module = await import(pathToFileURL(file).href);
	return module.default ?? module;
}

export const compileMock = mocks => Object.entries(Object.assign({}, ...mocks.filter(Boolean)))
	.map(([key, response]) => ({ key, ...parseKey(key), ...parseResponse(key, response) }));

export const resolveMockFiles = async (files, baseDir) => Promise.all(
	[].concat(files ?? []).map(file => loadMockFile(path.resolve(baseDir, file)))
);

export const mockScript = rules => `(() => {
	const rules = ${JSON.stringify(rules)}.map(rule => ({ ...rule, regex: new RegExp(rule.regex) }));
	const requests = window.${REQUESTS_KEY} = window.${REQUESTS_KEY} || [];
	const pathOf = address => address.protocol === "file:" ? address.pathname.replace(/^\\/[A-Za-z]:/, "") : address.pathname;
	const find = (method, url) => {
		const address = new URL(url, location.href);
		return rules.find(rule => {
			if (rule.method && rule.method !== method) return false;
			const base = rule.isFullUrl ? address.origin + address.pathname : pathOf(address);
			return rule.regex.test(rule.withQuery ? base + address.search : base);
		});
	}
	
	const record = (method, url, rule) => {
		const address = new URL(url, location.href);
		const shown = address.origin === location.origin ? pathOf(address) + address.search : address.href;
		requests.push(method + " " + shown + (rule ? " -> mock " + rule.status : " -> network"));
	}
	const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

	const originalFetch = window.fetch.bind(window);
	window.fetch = async (input, init) => {
		const url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
		const method = String(init && init.method || input && input.method || "GET").toUpperCase();
		const rule = find(method, url);
		record(method, url, rule);
		if (!rule) return originalFetch(input, init);
		if (rule.delayMs) await wait(rule.delayMs);
		return new Response(rule.status === 204 || rule.status === 304 ? null : rule.body, { status: rule.status, headers: rule.headers });
	}

	const define = (target, name, value) => Object.defineProperty(target, name, { value, configurable: true });
	const originalOpen = XMLHttpRequest.prototype.open;
	const originalSend = XMLHttpRequest.prototype.send;
	XMLHttpRequest.prototype.open = function (method, url, ...rest) {
		this.__webviewPreview = { method: String(method).toUpperCase(), url: String(url) }
		return originalOpen.call(this, method, url, ...rest);
	}
	
	XMLHttpRequest.prototype.send = function (body) {
		const info = this.__webviewPreview;
		const rule = info && find(info.method, info.url);
		if (info) record(info.method, info.url, rule);
		if (!rule) return originalSend.call(this, body);
		const xhr = this;
		const headers = Object.fromEntries(Object.entries(rule.headers).map(([name, value]) => [name.toLowerCase(), String(value)]));
		setTimeout(() => {
			define(xhr, "readyState", 4);
			define(xhr, "status", rule.status);
			define(xhr, "statusText", "");
			define(xhr, "responseURL", new URL(info.url, location.href).href);
			define(xhr, "responseText", rule.body);
			define(xhr, "response", xhr.responseType === "json" ? (rule.body ? JSON.parse(rule.body) : null) : rule.body);
			define(xhr, "getResponseHeader", name => headers[String(name).toLowerCase()] ?? null);
			define(xhr, "getAllResponseHeaders", () => Object.entries(headers).map(([name, value]) => name + ": " + value).join("\\r\\n"));
			xhr.dispatchEvent(new Event("readystatechange"));
			xhr.dispatchEvent(new ProgressEvent("load"));
			xhr.dispatchEvent(new ProgressEvent("loadend"));
		}, rule.delayMs);
	}
})();`;