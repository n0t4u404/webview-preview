import { existsSync, statSync, watch } from "node:fs";
import path from "node:path";

const IGNORED = /(^|[\\/])(node_modules|\.git)([\\/]|$)/;
const DEBOUNCE_MS = 300;

export const watchFiles = ({ targets, ignore, onChange }) => {
	let timer;
	let changed = null;
	const watchers = targets.map(target => {
		if (!existsSync(target)) throw new Error(`watch: ${target} does not exist`);
		const isFile = statSync(target).isFile();
		try {
			return watch(target, { recursive: true }, (_, file) => {
				const full = file && !isFile ? path.join(target, String(file)) : target;
				if (IGNORED.test(full) || ignore.some(dir => full.startsWith(dir + path.sep))) return;
				changed = full;
				clearTimeout(timer);
				timer = setTimeout(() => onChange(changed), DEBOUNCE_MS);
			});
		} catch (error) {
			if (error.code === "ERR_FEATURE_UNAVAILABLE_ON_PLATFORM") throw new Error("--watch needs Node 20 or newer");
			throw error;
		}
	});
	
	return () => {
		clearTimeout(timer);
		for (const watcher of watchers) watcher.close();
	}
}