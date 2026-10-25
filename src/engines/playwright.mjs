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
	snapMargin = 8, waitForTimeoutMs = WAIT_FOR_TIMEOUT_MS, log
}) => {
	const playwright = await loadPlaywright();
	const browserType = engine === "webkit" ? playwright.webkit : playwright.chromium;
	const browser = await browserType.launch({ channel: CHANNELS[engine], headless: true });
	const saved = [];
	const films = [];
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

		const runStep = async step => {
			const { kind, value } = step;
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

	return { saved, failed, films }
}