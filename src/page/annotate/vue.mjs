export function pageVue() {
	const fileOf = type => (type && typeof type === "object" ? type.__file ?? null : null);
	const nameOf = type => {
		if (!type || typeof type !== "object") return null;
		const file = fileOf(type);
		return type.name || type.__name || (file ? file.split(/[\\/]/).pop().replace(/\.vue$/, "") : null);
	}

	const vue3 = element => {
		for (let node = element; node; node = node.parentElement) {
			if (node.__vueParentComponent) return node.__vueParentComponent;
		}
		return null;
	}

	const vue2 = element => {
		for (let node = element; node; node = node.parentElement) {
			if (node.__vue__) return node.__vue__;
		}
		return null;
	}

	const chainOf = (instance, next, typeOf) => {
		const chain = [];
		for (let node = instance; node; node = next(node)) {
			const type = typeOf(node);
			const name = nameOf(type);
			if (!name) continue;
			const parentFile = fileOf(typeOf(next(node)));
			chain.unshift({ name, usedAt: parentFile ? { file: parentFile, line: null, column: null, how: "vue-file" } : null });
		}
		return chain;
	}

	const componentOf = element => {
		const modern = vue3(element);
		const legacy = modern ? null : vue2(element);
		if (!modern && !legacy) return null;
		const typeOf = modern ? node => node?.type : node => node?.$options;
		const next = modern ? node => node.parent : node => node.$parent;
		const instance = modern ?? legacy;
		const chain = chainOf(instance, next, typeOf);
		const ownFile = fileOf(typeOf(instance));
		return {
			name: nameOf(typeOf(instance)),
			framework: "vue",
			chain: chain.slice(-8),
			source: ownFile ? { file: ownFile, line: null, column: null, how: "vue-file", confidence: "file" } : null
		}
	}

	return { componentOf }
}