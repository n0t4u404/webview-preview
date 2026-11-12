export function pageSelectors(extraPrivate = []) {
	const PRIVATE = [
		"input[type=password]", "[autocomplete^=cc-]", "[autocomplete=one-time-code]", "[autocomplete=current-password]",
		"[autocomplete=new-password]", "[data-private]", "[data-webview-preview-private]", ...extraPrivate
	].join(", ");
	const HIDDEN = "•••";
	const normalize = value => (value ?? "").replace(/\s+/g, " ").trim();
	const isPrivate = element => {
		try {
			return !!element.closest(PRIVATE);
		} catch {
			return false;
		}
	}
	const privateElements = () => {
		try {
			return [...document.querySelectorAll(PRIVATE)];
		} catch {
			return [];
		}
	}
	const textOf = element => {
		if (isPrivate(element)) return HIDDEN;
		let inside = [];
		try {
			inside = element.querySelectorAll(PRIVATE);
		} catch {}
		if (inside.length === 0) return normalize(element.innerText ?? element.textContent);
		const copy = element.cloneNode(true);
		for (const node of copy.querySelectorAll(PRIVATE)) node.replaceWith(` ${HIDDEN} `);
		return normalize(copy.textContent);
	}

	const stableClass = className => {
		const module = /^_?([a-zA-Z][\w-]*?)_[a-zA-Z0-9]{5,}(?:_\d+)?$/.exec(className);
		if (module) return module[1];
		return /[0-9a-f]{6,}/i.test(className) ? null : className;
	}

	const describe = element => {
		const tag = element.tagName.toLowerCase();
		const label = ((isPrivate(element) ? null : element.getAttribute("aria-label")) || textOf(element)).slice(0, 32);
		const className = [...element.classList].map(stableClass).find(Boolean);
		return `${tag}${className ? "." + className : ""}${label ? ` "${label}"` : ""}`;
	}

	const quote = value => `"${String(value).replace(/["\\]/g, "\\$&")}"`;
	const isUnique = selector => {
		try {
			return document.querySelectorAll(selector).length === 1;
		} catch {
			return false;
		}
	}

	const ownSelector = element => {
		const tag = element.tagName.toLowerCase();
		for (const attribute of ["data-test", "data-testid"]) {
			if (!element.hasAttribute(attribute)) continue;
			const selector = `[${attribute}=${quote(element.getAttribute(attribute))}]`;
			if (isUnique(selector)) return selector;
		}
		if (element.id && !/\d{3,}|^[:_-]|^r[0-9a-z]{1,4}$/i.test(element.id)) {
			const selector = `#${CSS.escape(element.id)}`;
			if (isUnique(selector)) return selector;
		}
		const label = isPrivate(element) ? null : element.getAttribute("aria-label");
		if (label && label.length <= 60) {
			const selector = `${tag}[aria-label=${quote(label)}]`;
			if (isUnique(selector)) return selector;
		}
		for (const className of element.classList) {
			const stable = stableClass(className);
			if (!stable) continue;
			const selector = stable === className ? `.${CSS.escape(className)}` : `[class*=${quote(stable)}]`;
			if (isUnique(selector)) return selector;
		}
		return null;
	}

	const buildSelector = element => {
		const own = ownSelector(element);
		if (own) return { selector: own, selectorQuality: "stable" }
		const parts = [];
		for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
			const anchor = node === element ? null : ownSelector(node);
			if (anchor) {
				parts.unshift(anchor);
				break;
			}
			if (node === document.body || node === document.documentElement) {
				parts.unshift(node.tagName.toLowerCase());
				break;
			}
			if (!node.parentElement) {
				parts.unshift(node.tagName.toLowerCase());
				break;
			}
			const index = [...node.parentElement.children].indexOf(node) + 1;
			parts.unshift(`${node.tagName.toLowerCase()}:nth-child(${index})`);
		}
		return { selector: parts.join(" > "), selectorQuality: "positional" }
	}

	const shortName = element => {
		const className = [...element.classList].map(stableClass).find(Boolean);
		return `${element.tagName.toLowerCase()}${className ? "." + className : ""}`;
	}

	const lookOf = element => {
		const style = getComputedStyle(element);
		const sides = name => {
			const values = ["top", "right", "bottom", "left"].map(side => style.getPropertyValue(`${name}-${side}${name === "border" ? "-width" : ""}`));
			return values.every(value => value === values[0]) ? values[0] : values.join(" ");
		}
		return {
			box: { margin: sides("margin"), padding: sides("padding"), border: sides("border"), borderRadius: style.borderRadius },
			style: {
				display: style.display,
				font: `${style.fontSize}/${style.lineHeight} ${style.fontWeight} ${style.fontFamily.split(",")[0].replace(/["']/g, "").trim()}`,
				color: style.color,
				background: style.backgroundColor,
				opacity: style.opacity,
				gap: style.gap
			}
		}
	}

	return { normalize, textOf, describe, shortName, buildSelector, lookOf, isPrivate, privateElements }
}