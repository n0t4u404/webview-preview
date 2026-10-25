import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { readPng, writePng } from "#src/snapshots/png.mjs";

export const diffImages = (actual, expected, tolerance) => {
	if (actual.width !== expected.width || actual.height !== expected.height) {
		return { differentPixels: Math.max(actual.width * actual.height, expected.width * expected.height), sizeMismatch: true }
	}

	const total = actual.width * actual.height;
	const diff = Buffer.alloc(total * 4);
	let differentPixels = 0;
	for (let index = 0; index < total; index += 1) {
		const offset = index * 4;
		let isDifferent = false;
		for (let channel = 0; channel < 4; channel += 1) {
			if (Math.abs(actual.rgba[offset + channel] - expected.rgba[offset + channel]) > tolerance) {
				isDifferent = true;
				break;
			}
		}

		if (isDifferent) {
			differentPixels += 1;
			diff[offset] = 255;
			diff[offset + 1] = 0;
			diff[offset + 2] = 0;
		} else {
			const grey = Math.round((actual.rgba[offset] + actual.rgba[offset + 1] + actual.rgba[offset + 2]) / 3);
			diff[offset] = diff[offset + 1] = diff[offset + 2] = 128 + (grey >> 2);
		}
		diff[offset + 3] = 255;
	}
	return { differentPixels, total, diff: { width: actual.width, height: actual.height, rgba: diff } }
}

export const compareSnapshots = ({ saved, baselineDir, updateBaseline, tolerance, maxDiffPixels, log }) => {
	mkdirSync(baselineDir, { recursive: true });
	let failed = false;
	const results = [];
	for (const file of saved) {
		const name = path.basename(file);
		const baseline = path.join(baselineDir, name);
		const diffFile = file.replace(/\.png$/, ".diff.png");
		rmSync(diffFile, { force: true });
		if (updateBaseline || !existsSync(baseline)) {
			copyFileSync(file, baseline);
			log.info(`compare ${name}: ${updateBaseline ? "baseline updated" : "new baseline"} → ${baseline}`);
			results.push({ file, baseline, status: updateBaseline ? "baseline updated" : "new baseline" });
			continue;
		}
		
		const result = diffImages(readPng(file), readPng(baseline), tolerance);
		if (result.sizeMismatch) {
			failed = true;
			log.error(`compare ${name}: size changed, baseline ${baseline}`);
			results.push({ file, baseline, status: "size changed", isFailed: true });
			continue;
		}
		if (result.differentPixels === 0) {
			log.info(`compare ${name}: same`);
			results.push({ file, baseline, status: "same" });
			continue;
		}

		writePng(diffFile, result.diff);
		const share = ((result.differentPixels / result.total) * 100).toFixed(2);
		const message = `compare ${name}: ${result.differentPixels} px differ (${share}%) → ${diffFile}`;
		const isFailed = result.differentPixels > maxDiffPixels;
		
		if (isFailed) {
			failed = true;
			log.error(message);
		} else {
			log.info(`${message} (within maxDiffPixels ${maxDiffPixels})`);
		}

		results.push({ file, baseline, diffFile, status: `${result.differentPixels} px differ (${share}%)`, isFailed });
	}
	return { failed, results }
}