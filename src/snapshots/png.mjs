import { readFileSync, writeFileSync } from "node:fs";
import zlib from "node:zlib";

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 }

const paeth = (left, up, upLeft) => {
	const estimate = left + up - upLeft;
	const toLeft = Math.abs(estimate - left);
	const toUp = Math.abs(estimate - up);
	const toUpLeft = Math.abs(estimate - upLeft);
	if (toLeft <= toUp && toLeft <= toUpLeft) return left;
	return toUp <= toUpLeft ? up : upLeft;
}

export const readPng = file => {
	const data = readFileSync(file);
	if (!data.subarray(0, 8).equals(SIGNATURE)) throw new Error(`${file} is not a PNG`);
	let offset = 8;
	let header = null;
	const chunks = [];
	while (offset < data.length) {
		const length = data.readUInt32BE(offset);
		const type = data.toString("ascii", offset + 4, offset + 8);
		const body = data.subarray(offset + 8, offset + 8 + length);
		if (type === "IHDR") {
			header = {
				width: body.readUInt32BE(0),
				height: body.readUInt32BE(4),
				bitDepth: body[8],
				colorType: body[9],
				interlace: body[12]
			}
		} else if (type === "IDAT") {
			chunks.push(body);
		} else if (type === "IEND") {
			break;
		}
		offset += length + 12;
	}

	if (!header) throw new Error(`${file}: no IHDR`);
	const channels = CHANNELS[header.colorType];
	if (header.bitDepth !== 8 || !channels || header.interlace !== 0) {
		throw new Error(`${file}: only 8-bit, non-interlaced grey/RGB/RGBA PNGs are supported`);
	}

	const raw = zlib.inflateSync(Buffer.concat(chunks));
	const { width, height } = header;
	const stride = width * channels;
	const pixels = Buffer.alloc(stride * height);
	for (let y = 0; y < height; y += 1) {
		const filter = raw[y * (stride + 1)];
		const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
		const row = y * stride;
		for (let x = 0; x < stride; x += 1) {
			const left = x >= channels ? pixels[row + x - channels] : 0;
			const up = y > 0 ? pixels[row - stride + x] : 0;
			const upLeft = y > 0 && x >= channels ? pixels[row - stride + x - channels] : 0;
			const predictor = filter === 1 ? left : filter === 2 ? up : filter === 3 ? (left + up) >> 1 : filter === 4 ? paeth(left, up, upLeft) : 0;
			pixels[row + x] = (line[x] + predictor) & 255;
		}
	}

	const rgba = Buffer.alloc(width * height * 4);
	for (let index = 0; index < width * height; index += 1) {
		const source = index * channels;
		const target = index * 4;
		if (channels >= 3) {
			rgba[target] = pixels[source];
			rgba[target + 1] = pixels[source + 1];
			rgba[target + 2] = pixels[source + 2];
		} else {
			rgba[target] = rgba[target + 1] = rgba[target + 2] = pixels[source];
		}
		rgba[target + 3] = channels === 4 ? pixels[source + 3] : channels === 2 ? pixels[source + 1] : 255;
	}
	return { width, height, rgba }
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
	let value = index;
	for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
	return value >>> 0;
});

const crc32 = buffer => {
	let value = 0xffffffff;
	for (const byte of buffer) value = CRC_TABLE[(value ^ byte) & 255] ^ (value >>> 8);
	return (value ^ 0xffffffff) >>> 0;
}

const chunk = (type, body) => {
	const length = Buffer.alloc(4);
	length.writeUInt32BE(body.length);
	const typed = Buffer.concat([Buffer.from(type, "ascii"), body]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(typed));
	return Buffer.concat([length, typed, crc]);
}

export const writePng = (file, { width, height, rgba }) => {
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header[8] = 8;
	header[9] = 6;
	const raw = Buffer.alloc((width * 4 + 1) * height);
	for (let y = 0; y < height; y += 1) {
		rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
	}
	
	writeFileSync(file, Buffer.concat([
		SIGNATURE,
		chunk("IHDR", header),
		chunk("IDAT", zlib.deflateSync(raw)),
		chunk("IEND", Buffer.alloc(0))
	]));
}