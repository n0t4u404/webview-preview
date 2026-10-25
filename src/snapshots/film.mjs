import { rmSync } from "node:fs";
import { clipRect } from "#src/core/steps.mjs";
import { readPng, writePng } from "#src/snapshots/png.mjs";

const COLUMNS = 5;
const GAP = 4;
const GAP_COLOR = [128, 128, 128, 255];

const unionRect = rects => {
	const left = Math.min(...rects.map(rect => rect.x));
	const top = Math.min(...rects.map(rect => rect.y));
	const right = Math.max(...rects.map(rect => rect.x + rect.width));
	const bottom = Math.max(...rects.map(rect => rect.y + rect.height));
	return { x: left, y: top, width: right - left, height: bottom - top }
}

const cropArea = ({ frames, viewport }, margin) => {
	const rects = frames.map(frame => frame.rect).filter(rect => rect && rect.width > 0 && rect.height > 0);
	if (!rects.length) return { x: 0, y: 0, ...viewport }
	return clipRect(unionRect(rects), margin, viewport);
}

export const stitchFilm = (film, margin) => {
	const images = film.frames.map(frame => readPng(frame.file));
	const area = cropArea(film, margin);
	const left = Math.round(area.x * film.scale);
	const top = Math.round(area.y * film.scale);
	const width = Math.min(Math.round(area.width * film.scale), ...images.map(image => image.width - left));
	const height = Math.min(Math.round(area.height * film.scale), ...images.map(image => image.height - top));
	const columns = Math.min(COLUMNS, images.length);
	const rows = Math.ceil(images.length / columns);
	const sheet = {
		width: columns * width + (columns - 1) * GAP,
		height: rows * height + (rows - 1) * GAP
	}
	const rgba = Buffer.alloc(sheet.width * sheet.height * 4);
	for (let offset = 0; offset < rgba.length; offset += 4) rgba.set(GAP_COLOR, offset);

	images.forEach((image, index) => {
		const x = (index % columns) * (width + GAP);
		const y = Math.floor(index / columns) * (height + GAP);
		for (let row = 0; row < height; row += 1) {
			const from = ((top + row) * image.width + left) * 4;
			image.rgba.copy(rgba, ((y + row) * sheet.width + x) * 4, from, from + width * 4);
		}
	});

	writePng(film.file, { ...sheet, rgba });
	for (const frame of film.frames) rmSync(frame.file, { force: true });
	return `film ${film.name}: ${images.length} frames at ${film.frames.map(frame => frame.time).join(" ")} ms, ${columns} per row`;
}
