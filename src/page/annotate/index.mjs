import { pageDom } from "#src/page/annotate/dom.mjs";
import { ICONS } from "#src/page/annotate/icons.mjs";
import { pageKeys } from "#src/page/annotate/keys.mjs";
import { MARKUP } from "#src/page/annotate/markup.mjs";
import { annotatePanel } from "#src/page/annotate/panel.mjs";
import { pageReact } from "#src/page/annotate/react.mjs";
import { pageSelectors } from "#src/page/annotate/selector.mjs";
import { STYLES } from "#src/page/annotate/styles.mjs";
import { pageVue } from "#src/page/annotate/vue.mjs";

export { formatAnnotation } from "#src/page/annotate/format.mjs";

export const ANNOTATE_KEY = "__webviewPreviewAnnotate";
export const ANNOTATE_POLL_MS = 250;
export const ANNOTATE_CLEANUP = `window.${ANNOTATE_KEY}?.cleanup?.()`;

export const annotateStart = (name, keys = null, privateSelectors = [], keepOpen = false) => `(${annotatePanel})(${JSON.stringify({ key: ANNOTATE_KEY, name, markup: MARKUP, styles: STYLES, icons: ICONS, keepOpen })}, {
	keys: (${pageKeys})(${JSON.stringify(keys)}),
	selectors: (${pageSelectors})(${JSON.stringify(privateSelectors)}),
	react: (${pageReact})(),
	vue: (${pageVue})(),
	dom: (${pageDom})()
})`;

export const ANNOTATE_CHECK = `(() => {
	const state = window.${ANNOTATE_KEY};
	if (!state) return "missing";
	if (state.status === "open") {
		const draft = state.version !== state.sentVersion ? (state.sentVersion = state.version, state.draft()) : null;
		const captures = state.captures.splice(0);
		if (captures.length) state.capturing = captures;
		const url = location.href !== state.sentUrl ? (state.sentUrl = location.href) : null;
		return draft || captures.length || url ? JSON.stringify({ status: "open", draft, captures, url }) : null;
	}
	return JSON.stringify({ status: state.status, result: state.result, keys: state.keys });
})()`;

export const annotateRestore = draft => `window.${ANNOTATE_KEY}Draft = ${JSON.stringify(draft)};`;

export const annotateStep = (name, keys, privateSelectors = [], keepOpen = false) => ({
	kind: "annotate",
	value: name,
	start: annotateStart(name, keys, privateSelectors, keepOpen),
	resume: `window.${ANNOTATE_KEY}?.resume?.()`,
	check: ANNOTATE_CHECK,
	hide: `window.${ANNOTATE_KEY}?.setHidden?.(true)`,
	show: `window.${ANNOTATE_KEY}?.setHidden?.(false)`,
	cleanup: ANNOTATE_CLEANUP,
	dispose: `window.${ANNOTATE_KEY}?.dispose?.()`,
	restoreKey: `${ANNOTATE_KEY}Draft`,
	pollMs: ANNOTATE_POLL_MS
});