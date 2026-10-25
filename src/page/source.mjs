const ANY_API = Symbol.for("webview-preview.anyApi");

export const anyApi = (members = {}) => ({ [ANY_API]: true, members });

const asExpression = source => {
	try {
		new Function(`return (${source})`);
		return source;
	} catch {
		return source.startsWith("async ") ? `async function ${source.slice(6)}` : `function ${source}`;
	}
}

export const toSource = (value, name = "value") => {
	if (typeof value === "function") return `(${asExpression(value.toString())})`;
	if (value === undefined) return "undefined";
	if (Array.isArray(value)) return `[${value.map((item, index) => toSource(item, `${name}[${index}]`)).join(", ")}]`;
	if (value && typeof value === "object") {
		if (value[ANY_API]) return `__webviewPreviewAny(${toSource(value.members, name)}, ${JSON.stringify(name)})`;
		const entries = Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}: ${toSource(item, `${name}.${key}`)}`);
		return `{ ${entries.join(", ")} }`;
	}
	return JSON.stringify(value);
}

export const RECORD_FUNCTION = `call => (window.__webviewPreviewRequests = window.__webviewPreviewRequests || []).push(call)`;

export const ANY_FUNCTION = `(members, name) => {
	const record = ${RECORD_FUNCTION};
	const settled = () => new Proxy(function () {}, {
		get: (_, key) => key === "then" ? resolve => resolve(null) : key === Symbol.toPrimitive ? () => "" : settled(),
		apply: () => settled()
	});

	const node = path => new Proxy(function () {}, {
		get: (_, key) => {
			if (typeof key === "symbol") return key === Symbol.toPrimitive ? () => "" : undefined;
			if (key === "then" || key === "toJSON") return undefined;
			if (path === name && Object.prototype.hasOwnProperty.call(members, key)) {
				const member = members[key];
				if (typeof member !== "function") return member;
				return (...args) => {
					record("call " + path + "." + key + " -> stub");
					return member(...args);
				}
			}
			return node(path + "." + key);
		},
		apply: () => {
			record("call " + path + " -> default");
			return settled();
		}
	});
	return node(name);
}`;