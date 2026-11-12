export function pageKeys(saved) {
	const DEFAULT_KEYS = { pick: "p", notes: "n", freeze: "f", toggle: "t", parent: "ArrowUp", child: "ArrowDown", done: "Control+Enter" }
	const KEY_ACTIONS = [
		["pick", "Pick elements"],
		["notes", "Show / hide notes"],
		["freeze", "Freeze"],
		["toggle", "Show / hide tools"],
		["parent", "Outline the parent"],
		["child", "Back to the child"],
		["done", "Done"]
	];
	const bindings = { ...DEFAULT_KEYS, ...(saved ?? {}) }

	const KEY_NAMES = { Control: "Ctrl", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", " ": "Space" }
	const showKey = combo => combo.split("+").map(part => KEY_NAMES[part] ?? (part.length === 1 ? part.toUpperCase() : part)).join("+");
	const comboOf = event => {
		if (["Control", "Alt", "Shift", "Meta"].includes(event.key)) return null;
		const parts = [];
		if (event.ctrlKey) parts.push("Control");
		if (event.altKey) parts.push("Alt");
		const code = event.code ?? "";
		const key = /^Key[A-Z]$/.test(code) ? code.slice(3).toLowerCase()
			: /^Digit\d$/.test(code) ? code.slice(5)
				: event.key.length === 1 ? event.key.toLowerCase() : event.key;
		if (event.shiftKey && key.length > 1) parts.push("Shift");
		if (event.metaKey) parts.push("Meta");
		parts.push(key);
		return parts.join("+");
	}

	const actionFor = combo => Object.keys(bindings).find(action => bindings[action] === combo) ?? null;
	return { DEFAULT_KEYS, KEY_ACTIONS, bindings, showKey, comboOf, actionFor }
}