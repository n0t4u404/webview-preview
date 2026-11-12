import path from "node:path";
import { INIT_ERRORS_EXPRESSION, reportInitErrors } from "#src/page/init.mjs";
import { clipRect, JS_SETTLE_MS, LOAD_SETTLE_MS, parseRect, parseSize, TIMEOUT_MS, WAIT_FOR_POLL_MS, WAIT_FOR_TIMEOUT_MS } from "#src/core/steps.mjs";

const CHANNELS = {
	msedge: "msedge",
	chrome: "chrome",
	chromium: undefined
}

const loadPlaywright = async () => {
	try {
		return await import("playwright-core");
	} catch {
		throw new Error("This engine needs playwright-core: npm i -D playwright-core");
	}
}

export const runPlaywright = async ({
	engine, url, steps, init = [], size, locale,
	colorScheme, isMotionReduced = false, out, prefix, scale,
	snapMargin = 8, isHeaded = false, waitForTimeoutMs = WAIT_FOR_TIMEOUT_MS, timeoutMs = TIMEOUT_MS, onAnnotation, log
}) => {
	const deadline = timeoutMs > 0 ? Date.now() + timeoutMs : Infinity;
	const playwright = await loadPlaywright();
	const browserType = engine === "webkit" ? playwright.webkit : playwright.chromium;
	const browser = await browserType.launch({ channel: CHANNELS[engine], headless: !isHeaded });
	const saved = [];
	const films = [];
	const annotations = [];
	let failed = false;

	try {
		const page = await browser.newPage({
			viewport: parseSize(size),
			deviceScaleFactor: scale ?? 1,
			locale,
			colorScheme,
			reducedMotion: isMotionReduced ? "reduce" : undefined
		});
		page.setDefaultTimeout(TIMEOUT_MS);
		for (const content of init) await page.addInitScript({ content });
		await page.goto(url, { waitUntil: "load" });
		await page.waitForTimeout(LOAD_SETTLE_MS);
		if (init.length) reportInitErrors(await page.evaluate(INIT_ERRORS_EXPRESSION), log);

		const evaluate = async code => {
			try {
				return { value: await page.evaluate(code) }
			} catch (error) {
				return { error: error.message.split("\n")[0] }
			}
		}

		const elementRect = async step => {
			const result = await evaluate(step.rect);
			if (result.error) throw new Error(`${step.kind}:${step.value} failed: ${result.error}`);
			return parseRect(result.value, step.selector ?? step.value);
		}

		const film = async step => {
			const frames = [];
			const started = Date.now();
			for (let index = 0; index < step.frames; index += 1) {
				const due = started + index * step.durationMs / (step.frames - 1);
				if (Date.now() < due) await page.waitForTimeout(due - Date.now());
				const time = Date.now() - started;
				const file = path.join(out, `${prefix}${step.value}.frame-${index}.png`);
				const [, rect] = await Promise.all([page.screenshot({ path: file }), step.rect ? evaluate(step.rect) : {}]);
				frames.push({ file, time, rect: rect.value && rect.value !== "null" ? JSON.parse(rect.value) : null });
			}
			films.push({ name: step.value, file: path.join(out, `${prefix}${step.value}.png`), scale: scale ?? 1, viewport: page.viewportSize(), frames });
		}

		const cutOut = async (rect, file) => {
			try {
				await page.screenshot({ path: file, clip: clipRect(rect, snapMargin, page.viewportSize()) });
				return path.basename(file);
			} catch {
				return null;
			}
		}

		const report = annotation => {
			annotations.push(annotation);
			onAnnotation?.(annotation);
		}

		const annotate = async step => {
			let round = 1;
			const base = () => `${prefix}annotate-${step.value}${round > 1 ? `-${round}` : ""}`;
			let images = {}
			let draft = null;
			let lastUrl = null;
			await page.evaluate(step.start);
			for (;;) {
				if (page.isClosed()) {
					report({ name: step.value, status: "cancelled", result: null, round });
					return;
				}
				if (Date.now() > deadline) {
					report({ name: step.value, status: "cancelled", result: null, round });
					throw new Error(`timed out after ${timeoutMs} ms`);
				}
				const text = await page.evaluate(step.check).catch(() => null);
				const answer = text && text !== "missing" ? JSON.parse(text) : null;
				if (text === "missing") {
					for (const earlier of step.replay ?? []) {
						try {
							await runStep(earlier);
						} catch (error) {
							log.error(`replay: ${error.message.split("\n")[0]}`);
						}
					}
					if (lastUrl && page.url() !== lastUrl) {
						await page.evaluate(`location.href = ${JSON.stringify(lastUrl)}`).catch(() => undefined);
						await page.waitForTimeout(JS_SETTLE_MS);
					}
					await page.evaluate(`${draft ? `window.${step.restoreKey} = ${JSON.stringify(draft)};` : ""}${step.start}`).catch(() => undefined);
				} else if (answer?.status === "open") {
					if (answer.url) lastUrl = answer.url;
					if (answer.draft) draft = answer.draft;
					if (answer.captures?.length) {
						await page.evaluate(step.hide).catch(() => undefined);
						await page.waitForTimeout(80);
						for (const capture of answer.captures) {
							const image = await cutOut(capture.rect, path.join(out, `${base()}-${capture.id}.png`));
							if (image) images[capture.id] = image;
						}
						await page.evaluate(step.show).catch(() => undefined);
					}
				} else if (answer) {
					const annotation = { ...answer, name: step.value, round, scale: scale ?? 1 }
					const isSent = annotation.status === "sent";
					if ((annotation.status === "done" || isSent) && annotation.result) {
						await page.screenshot({ path: path.join(out, `${base()}.png`) });
						annotation.image = `${base()}.png`;
						await page.evaluate(step.cleanup).catch(() => undefined);
						await page.waitForTimeout(160);
						for (const [id, element] of Object.entries(annotation.result.elements)) {
							element.image = element.isLive
								? await cutOut(element.rect, path.join(out, `${base()}-${id}.png`)) ?? images[id] ?? null
								: images[id] ?? null;
						}
						if (!isSent) await page.evaluate(step.dispose).catch(() => undefined);
					}
					report(annotation);
					if (!isSent) return;
					round += 1;
					images = {}
					draft = null;
					await page.evaluate(step.resume).catch(() => undefined);
				}
				await new Promise(resolve => setTimeout(resolve, step.pollMs));
			}
		}

		const runStep = async step => {
			const { kind, value } = step;
			if (kind === "annotate") return annotate(step);
			if (kind === "snap") {
				const file = path.join(out, `${prefix}${value}.png`);
				const clip = step.selector ? clipRect(await elementRect(step), snapMargin, page.viewportSize()) : undefined;
				await page.screenshot({ path: file, clip });
				saved.push(file);
			} else if (kind === "film") {
				await film(step);
			} else if (kind === "hover" || kind === "click") {
				const rect = await elementRect(step);
				const x = rect.x + rect.width / 2;
				const y = rect.y + rect.height / 2;
				if (kind === "hover") await page.mouse.move(x, y);
				else await page.mouse.click(x, y);
			} else if (kind === "key") {
				await page.keyboard.press([...step.modifiers, step.key === " " ? "Space" : step.key].join("+"));
			} else if (kind === "type") {
				await page.keyboard.type(value);
			} else if (kind === "js" || kind === "jsnow") {
				const result = await evaluate(value);
				if (result.error) log.error(`js failed: ${result.error}`);
				if (kind === "js") await page.waitForTimeout(JS_SETTLE_MS);
			} else if (kind === "waitfor") {
				try {
					await page.waitForFunction(step.check, undefined, { timeout: waitForTimeoutMs, polling: WAIT_FOR_POLL_MS });
				} catch (error) {
					throw new Error(/Timeout/i.test(error.message)
						? `waitfor:${value} timed out after ${waitForTimeoutMs} ms`
						: `waitfor:${value} failed: ${error.message.split("\n")[0]}`);
				}
			} else if (kind === "wait") {
				await page.waitForTimeout(Number(value));
			} else if (kind === "resize") {
				await page.setViewportSize(parseSize(value));
			} else if (kind === "print") {
				const result = await evaluate(value);
				if (result.error) log.error(`print failed: ${result.error}`);
				else log.info(String(result.value));
			}
		}

		for (const step of steps) {
			if (Date.now() > deadline) {
				failed = true;
				log.error(`timed out after ${timeoutMs} ms`);
				break;
			}
			try {
				await runStep(step);
			} catch (error) {
				failed = true;
				log.error(error.message.split("\n")[0]);
			}
		}
	} catch (error) {
		failed = true;
		log.error(error.message);
	} finally {
		await browser.close();
	}

	return { saved, failed, films, annotations }
}