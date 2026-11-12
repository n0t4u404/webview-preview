export function pageReact() {
	const COMPONENT_TAGS = new Set([0, 1, 11, 14, 15]);
	const LIBRARY_URL = /\/node_modules\/|\/@vite\/|\/@react-refresh|\/@id\//;
	const FRAME = /^\s*(?:at\s+)?(?:(.*?)@|(.*?)\s+\()?((?:https?|file):\/\/.+?):(\d+):(\d+)\)?\s*$/;

	const fiberOf = element => {
		const key = Object.keys(element).find(name => name.startsWith("__reactFiber$"));
		return key ? element[key] : null;
	}

	const typeName = type => {
		if (!type || typeof type === "string") return null;
		return type.displayName || type.name || typeName(type.render) || typeName(type.type) || null;
	}

	const appFrame = fiber => {
		if (fiber?._debugSource?.fileName) {
			const { fileName, lineNumber, columnNumber } = fiber._debugSource;
			return { file: fileName, line: lineNumber, column: columnNumber ?? 1 }
		}
		for (const line of String(fiber?._debugStack?.stack ?? "").split("\n")) {
			const match = FRAME.exec(line);
			if (!match) continue;
			const url = match[3];
			const isProject = url.startsWith("file:") || url.startsWith(location.origin);
			if (!isProject || LIBRARY_URL.test(url)) continue;
			return { url, line: Number(match[4]), column: Number(match[5]), owner: match[1] || match[2] || null }
		}
		return null;
	}

	const componentOf = element => {
		const fiber = fiberOf(element);
		if (!fiber) return null;
		const chain = [];
		for (let node = fiber.return; node; node = node.return) {
			if (!COMPONENT_TAGS.has(node.tag)) continue;
			const name = typeName(node.type);
			const usedAt = appFrame(node);
			if (!name || !usedAt) continue;
			if (chain[0]?.name === name) continue;
			chain.unshift({ name, usedAt });
		}
		const own = appFrame(fiber);
		const nearest = chain.at(-1);
		return {
			name: nearest?.name ?? null,
			framework: "react",
			chain: chain.slice(-8),
			source: own ? { ...own, confidence: "exact" } : nearest ? { ...nearest.usedAt, confidence: "nearest" } : null
		}
	}

	return { componentOf }
}