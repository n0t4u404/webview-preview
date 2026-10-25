import { ANY_FUNCTION, toSource } from "#src/page/source.mjs";

const GLOBAL_PATH = /^(window\.)?[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/;
const LOCALE = /^[a-z]{2,3}(-[A-Za-z\d]{2,8})*$/i;

export const globalsScript = globals => {
	const entries = Object.entries(globals).map(([path, value]) => {
		if (!GLOBAL_PATH.test(path)) throw new Error(`globals: "${path}" must be a dotted path like window.api or window.go.main`);
		const name = path.startsWith("window.") ? path : `window.${path}`;
		return `assign(${JSON.stringify(name)}, ${toSource(value, name)});`;
	});
	return `(() => {
	const __webviewPreviewAny = ${ANY_FUNCTION};
	const assign = (path, value) => {
		const parts = path.split(".").slice(1);
		const last = parts.pop();
		let target = window;
		for (const part of parts) {
			if (target[part] === undefined || target[part] === null) target[part] = {};
			target = target[part];
		}
		target[last] = value;
	}
	${entries.join("\n\t")}
})();`;
}

export const checkLocale = locale => {
	if (!LOCALE.test(locale)) throw new Error(`locale must look like en-US or ru, got "${locale}"`);
	return locale;
}

export const localeScript = locale => `(() => {
	const language = ${JSON.stringify(checkLocale(locale))};
	Object.defineProperty(Navigator.prototype, "language", { get: () => language, configurable: true });
	Object.defineProperty(Navigator.prototype, "languages", { get: () => [language], configurable: true });
})();`;