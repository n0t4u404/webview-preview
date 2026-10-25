import { NETWORK_STEPS, networkStep } from "#src/page/network.mjs";

export const LOAD_SETTLE_MS = 1500;
export const JS_SETTLE_MS = 700;
export const TIMEOUT_MS = 30000;
export const WAIT_FOR_TIMEOUT_MS = 10000;
export const WAIT_FOR_POLL_MS = 50;

const STEP_KINDS = new Set(["js", "jsnow", "wait", "waitfor", "snap", "print", "measure", "assert", "focusorder", "resize", "key", "type", "hover", "click", "offline", "online", "latency"]);
export const ASSERT_MARKER = "__webviewPreviewAssert:";
export const FOCUS_MARKER = "__webviewPreviewFocus:";
const FOCUS_ORDER_DEFAULT = 20;
const FOCUS_ORDER_MAX = 200;
const MODIFIERS = { Shift: "Shift", Control: "Control", Ctrl: "Control", Alt: "Alt", Meta: "Meta" }
export const KEY_NAMES = [
	"Tab", "Enter", "Escape", "Backspace", "Delete", "Insert", "Space", "Home", "End", "PageUp", "PageDown",
	"ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", ...Array.from({ length: 12 }, (_, index) => `F${index + 1}`)
];

const PRINT_FORMAT = `(value => {
	if (typeof value === "string") return value;
	if (value === undefined) return "undefined";
	if (typeof Node !== "undefined" && value instanceof Node) return value.nodeType === 1 ? value.outerHTML.slice(0, 200) : String(value.nodeName);
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		return String(value);
	}
})`;

export const printExpression = expression => `${PRINT_FORMAT}((${expression}))`;

const QUERY_FUNCTION = `selector => {
	if (!selector.startsWith("text=")) return [...document.querySelectorAll(selector)];
	const normalize = value => value.replace(/\\s+/g, " ").trim();
	const wanted = normalize(selector.slice(5));
	return [...document.body.querySelectorAll("*")].filter(element =>
		normalize(element.textContent) === wanted
		&& ![...element.children].some(child => normalize(child.textContent) === wanted));
}`;

const VISIBLE_FUNCTION = `element => {
	if (element.getClientRects().length === 0) return false;
	if (getComputedStyle(element).visibility === "hidden") return false;
	for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
		if (getComputedStyle(node).opacity === "0") return false;
	}
	return true;
}`;

const waitForExpression = (selector, isGone) => `(() => {
	const query = ${QUERY_FUNCTION};
	const isVisible = ${VISIBLE_FUNCTION};
	const visible = query(${JSON.stringify(selector)}).filter(isVisible);
	if (${isGone ? "true" : "false"}) return visible.length === 0;
	if (visible.length === 0) return false;
	const key = "__webviewPreviewWaitFor:" + ${JSON.stringify(selector)};
	const rects = JSON.stringify(visible.map(element => {
		const rect = element.getBoundingClientRect();
		let opacity = 1;
		for (let node = element; node && node.nodeType === 1; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
		return [rect.left, rect.top, rect.width, rect.height, Math.round(opacity * 1000)];
	}));
	const isStill = window[key] === rects;
	window[key] = rects;
	return isStill;
})()`;

const MEASURE_FUNCTION = `(selector, query, isVisible) => {
	const all = query(selector);
	if (all.length === 0) return "measure " + selector + ": no match";
	const element = all.find(isVisible) ?? all[0];
	const rect = element.getBoundingClientRect();
	const style = getComputedStyle(element);
	const round = value => Math.round(value * 100) / 100;
	const box = name => {
		const sides = ["top", "right", "bottom", "left"].map(side => parseFloat(style.getPropertyValue(name + "-" + side + (name === "border" ? "-width" : ""))) || 0);
		return sides.every(side => side === sides[0]) ? String(sides[0]) : sides.join(" ");
	};
	const text = (element.innerText || element.value || "").replace(/\\s+/g, " ").trim().slice(0, 40);
	return [
		"measure " + selector + ": " + all.length + " match" + (all.length === 1 ? "" : "es") + (all.length > 1 ? ", showing " + (all.indexOf(element) + 1) : ""),
		"x " + round(rect.left) + " y " + round(rect.top) + " w " + round(rect.width) + " h " + round(rect.height),
		"margin " + box("margin") + " padding " + box("padding") + " border " + box("border"),
		(isVisible(element) ? "visible" : "hidden") + " display " + style.display + " opacity " + style.opacity,
		"font " + style.fontSize + "/" + style.fontWeight + " color " + style.color + " bg " + style.backgroundColor,
		...(text ? ['text "' + text + '"'] : [])
	].join(" · ");
}`;

const assertExpression = expression => `(() => {
	const show = value => {
		if (typeof value === "string") return JSON.stringify(value);
		if (typeof Node !== "undefined" && value instanceof Node) return value.nodeType === 1 ? value.outerHTML.slice(0, 120) : String(value.nodeName);
		try {
			return JSON.stringify(value) ?? String(value);
		} catch {
			return String(value);
		}
	}
	const report = problem => ${JSON.stringify(ASSERT_MARKER)} + JSON.stringify([${JSON.stringify(expression)}, problem]);
	try {
		const value = (${expression});
		return report(value ? null : "got " + show(value));
	} catch (error) {
		return report("threw " + (error && error.message || error));
	}
})()`;

const FOCUS_DESCRIBE = `(() => {
	const element = document.activeElement;
	if (!element || element === document.body || element === document.documentElement) return ${JSON.stringify(FOCUS_MARKER)} + JSON.stringify(["item", null]);
	const tag = element.tagName.toLowerCase();
	const role = element.getAttribute("role");
	const name = element.getAttribute("name");
	const type = tag === "input" ? element.getAttribute("type") : null;
	const label = (element.getAttribute("aria-label") || (element.labels && element.labels[0] ? element.labels[0].innerText : "") || element.getAttribute("placeholder") || element.innerText || element.value || element.getAttribute("title") || "").replace(/\\s+/g, " ").trim().slice(0, 40);
	const parts = [tag + (role ? "[role=" + role + "]" : "") + (name ? "[name=" + name + "]" : "") + (type ? "[type=" + type + "]" : "")];
	if (element.id && !/^(:|_r_|«)/.test(element.id)) parts[0] += "#" + element.id;
	if (label) parts.push(JSON.stringify(label));
	const dialog = element.closest("[role=dialog], dialog");
	if (dialog) parts.push("in dialog");
	const path = [];
	for (let node = element; node && node.nodeType === 1; node = node.parentElement) path.unshift(node.tagName + ":" + [...(node.parentElement ? node.parentElement.children : [])].indexOf(node));
	return ${JSON.stringify(FOCUS_MARKER)} + JSON.stringify(["item", parts.join(" "), path.join("/")]);
})()`;

const focusOrderSteps = (value, step) => {
	const count = value === "" ? FOCUS_ORDER_DEFAULT : Number(value);
	if (!Number.isInteger(count) || count < 1 || count > FOCUS_ORDER_MAX) throw new Error(`focusorder takes how many Tab presses, 1-${FOCUS_ORDER_MAX}, got "${step}"`);
	return [
		{ kind: "print", value: `${JSON.stringify(FOCUS_MARKER)} + JSON.stringify(["start", ${count}])` },
		...Array.from({ length: count }, () => [{ kind: "key", value: "Tab", key: "Tab", modifiers: [] }, { kind: "print", value: FOCUS_DESCRIBE }]).flat(),
		{ kind: "print", value: `${JSON.stringify(FOCUS_MARKER)} + JSON.stringify(["end"])` }
	];
}

const measureExpression = selector => `(${MEASURE_FUNCTION})(${JSON.stringify(selector)}, ${QUERY_FUNCTION}, ${VISIBLE_FUNCTION})`;

const rectExpression = (selector, isScrolled) => `(() => {
	const query = ${QUERY_FUNCTION};
	const isVisible = ${VISIBLE_FUNCTION};
	const all = query(${JSON.stringify(selector)});
	const visible = all.filter(isVisible);
	const isOnTop = element => {
		const rect = element.getBoundingClientRect();
		const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
		return !!hit && (element === hit || element.contains(hit));
	};
	const element = visible.find(isOnTop) ?? visible[0] ?? all[0];
	if (!element) return "null";
	${isScrolled ? "element.scrollIntoView({ block: \"nearest\", inline: \"nearest\" });" : ""}
	const rect = element.getBoundingClientRect();
	return JSON.stringify({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
})()`;

const parseKey = combo => {
	const parts = combo.split("+");
	const key = parts.pop();
	const modifiers = parts.map(part => {
		if (!(part in MODIFIERS)) throw new Error(`Unknown modifier "${part}" in key:${combo}. Modifiers: Shift, Control, Alt, Meta`);
		return MODIFIERS[part];
	});
	if (!key || (key.length > 1 && !KEY_NAMES.includes(key))) throw new Error(`Unknown key "${key}" in key:${combo}. Keys: a single character or ${KEY_NAMES.join(", ")}`);
	return { key, modifiers }
}

export const expandMacros = (steps, macros = {}, trail = []) => steps.flatMap(step => {
	if (!step.startsWith("macro:")) return [step];
	const name = step.slice(6);
	if (!Object.hasOwn(macros, name)) {
		const known = Object.keys(macros);
		throw new Error(`Unknown macro "${name}". Macros: ${known.length ? known.join(", ") : "none — add them to macros in the config"}`);
	}
	if (trail.includes(name)) throw new Error(`macro:${name} uses itself: ${[...trail, name].join(" → ")}`);
	const body = macros[name];
	if (!Array.isArray(body) || !body.every(item => typeof item === "string")) throw new Error(`macro "${name}" must be a list of steps`);
	return expandMacros(body, macros, [...trail, name]);
})

export const parseSize = value => {
	const match = /^(\d+)x(\d+)$/.exec(String(value));
	if (!match) throw new Error(`Size must look like 1200x650, got "${value}"`);
	return { width: Number(match[1]), height: Number(match[2]) }
}

export const parseSteps = steps => steps.flatMap(step => {
	const separator = step.indexOf(":");
	const kind = separator === -1 ? step : step.slice(0, separator);
	const value = separator === -1 ? "" : step.slice(separator + 1);
	if (!STEP_KINDS.has(kind)) throw new Error(`Unknown step "${step}". Steps: ${[...STEP_KINDS, "macro"].join(", ")}`);
	if (kind === "wait" && !/^\d+$/.test(value)) throw new Error(`wait needs milliseconds, got "${step}"`);
	if (kind === "resize") parseSize(value);
	if (kind === "snap") {
		const at = value.indexOf("@");
		const name = at === -1 ? value : value.slice(0, at);
		if (!name) throw new Error(`snap needs a name, got "${step}"`);
		if (at === -1) return { kind, value: name }
		const selector = value.slice(at + 1);
		if (!selector) throw new Error(`snap:name@selector needs a selector, got "${step}"`);
		return { kind, value: name, selector, rect: rectExpression(selector, false) }
	}
	if (kind === "hover" || kind === "click") {
		if (!value) throw new Error(`${kind} needs a selector, got "${step}"`);
		return { kind, value, rect: rectExpression(value, true) }
	}
	if (kind === "key") return { kind, value, ...parseKey(value) }
	if (kind === "waitfor") {
		const isGone = value.startsWith("!");
		const selector = isGone ? value.slice(1) : value;
		if (!selector) throw new Error(`waitfor needs a selector, got "${step}"`);
		return { kind, value, check: waitForExpression(selector, isGone) }
	}
	if (kind === "focusorder") return focusOrderSteps(value, step);
	if (NETWORK_STEPS.has(kind)) return networkStep(kind, value, step);
	if (kind === "assert") {
		if (!value) throw new Error(`assert needs an expression, got "${step}"`);
		return { kind: "print", value: assertExpression(value), assert: value }
	}
	if (kind === "measure") {
		if (!value) throw new Error(`measure needs a selector, got "${step}"`);
		return { kind: "print", value: printExpression(measureExpression(value)) }
	}
	if (kind === "type" && !value) throw new Error(`type needs text, got "${step}"`);
	return { kind, value: kind === "print" ? printExpression(value) : value }
});
export const parseRect = (json, selector) => {
	const rect = json && json !== "null" ? JSON.parse(json) : null;
	if (!rect) throw new Error(`no element matches ${selector}`);
	if (rect.width <= 0 || rect.height <= 0) throw new Error(`${selector} has no size (hidden?)`);
	return rect;
}

export const clipRect = (rect, margin, viewport) => {
	const left = Math.max(0, Math.floor(rect.x - margin));
	const top = Math.max(0, Math.floor(rect.y - margin));
	const right = Math.min(viewport.width, Math.ceil(rect.x + rect.width + margin));
	const bottom = Math.min(viewport.height, Math.ceil(rect.y + rect.height + margin));
	if (right <= left || bottom <= top) throw new Error("element is outside the window");
	return { x: left, y: top, width: right - left, height: bottom - top }
}