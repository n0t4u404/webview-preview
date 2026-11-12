export function pageDom() {
	const SVG = "http://www.w3.org/2000/svg";
	const TOKEN = /<\/([\w-]+)\s*>|<([\w-]+)((?:\s+[\w:-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>|([^<]+)/g;
	const ATTRIBUTE = /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;
	const VOID = new Set(["br", "hr", "img", "input", "link", "meta"]);
	const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: "\"", "#39": "'" }
	const decode = text => text.replace(/&(amp|lt|gt|quot|#39);/g, (_, name) => ENTITIES[name]);

	const fragment = markup => {
		const root = document.createDocumentFragment();
		const stack = [root];
		for (const [, closing, tag, attributes, selfClosing, text] of markup.matchAll(TOKEN)) {
			const parent = stack.at(-1);
			if (closing) {
				if (stack.length > 1) stack.pop();
				continue;
			}
			if (text !== undefined) {
				if (text.trim()) parent.append(decode(text));
				continue;
			}
			const isSvg = tag === "svg" || parent.namespaceURI === SVG;
			const element = isSvg ? document.createElementNS(SVG, tag) : document.createElement(tag);
			for (const [, name, double, single] of attributes.matchAll(ATTRIBUTE)) element.setAttribute(name, decode(double ?? single ?? ""));
			parent.append(element);
			if (!selfClosing && !VOID.has(tag)) stack.push(element);
		}
		return root;
	}

	const adoptStyles = (root, styles) => {
		try {
			const sheet = new CSSStyleSheet();
			sheet.replaceSync(styles);
			root.adoptedStyleSheets = [sheet];
		} catch {
			const style = document.createElement("style");
			style.textContent = styles;
			root.append(style);
		}
	}

	return { fragment, adoptStyles }
}