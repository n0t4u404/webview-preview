export function annotatePanel({ key, name, markup, styles, icons: ICONS }, { keys, selectors, react, vue, dom }) {
	const { DEFAULT_KEYS, KEY_ACTIONS, bindings, showKey, comboOf, actionFor } = keys;
	const { textOf, describe, shortName, buildSelector, lookOf, isPrivate, privateElements } = selectors;
	const componentOf = element => react.componentOf(element) ?? vue.componentOf(element);
	if (window[key]?.status === "open") return "open";
	const draft = window[`${key}Draft`] ?? null;
	delete window[`${key}Draft`];
	const state = { status: "open", result: null, keys: null, version: 0, captures: [] }
	window[key] = state;
	if (draft?.keys) {
		Object.assign(bindings, draft.keys);
		state.keys = { ...bindings }
	}

	const host = document.createElement("webview-preview-annotate");
	host.style.cssText = "all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none";
	const root = host.attachShadow({ mode: "closed" });
	dom.adoptStyles(root, styles);
	root.append(dom.fragment(markup));
	document.documentElement.append(host);
	const noSelect = document.createElement("style");
	noSelect.textContent = "* { user-select: none !important; -webkit-user-select: none !important }";

	const $ = selector => root.querySelector(selector);
	const dock = $(".dock");
	const toolbar = $(".toolbar");
	const outline = $(".outline");
	const outlineLabel = $(".outline-label");
	const picks = $(".picks");
	const masksLayer = $(".masks");
	const privacy = $(".privacy");
	const notesList = $(".notes");
	const general = $(".general");
	const pickButton = $(".pick");
	const notesButton = $(".notes-button");
	const notesBadge = $(".notes-button .badge");
	const freezeButton = $(".freeze");
	const freezeBadge = $(".freeze-badge");
	const toggleButton = $(".toggle");
	const keysButton = $(".keys");
	const notesSheet = $(".notes-sheet");
	const keysSheet = $(".keys-sheet");
	const keyRows = $(".rows");
	const tip = $(".tip");
	const hint = $(".hint");
	$(".run-name").textContent = name;

	let listeningFor = null;
	let isCollapsed = false;
	const notes = [];
	const records = new Map();
	const markers = new Map();
	let nextElement = 1;
	let masked = [];
	const pending = new Set();
	let nextNote = 1;
	let isPicking = true;
	let isFrozen = false;
	let freezeTimer = 0;
	let pausedAnimations = [];
	const FREEZE_SECONDS = 3;
	const HELD_EVENTS = ["mouseleave", "mouseout", "pointerleave", "pointerout", "mousemove", "pointermove", "blur", "focusout"];
	let hovered = null;
	let hoverTrail = [];
	let activeNote = null;
	let frame = 0;

	const noteNumber = note => notes.indexOf(note) + 1;
	const noteMark = note => String(noteNumber(note));
	let openSheet = null;
	const isOurs = event => event.composedPath().includes(host);
	const changed = () => {
		state.version += 1;
	}

	const infoOf = element => {
		const rect = element.getBoundingClientRect();
		return {
			...buildSelector(element),
			tag: element.tagName.toLowerCase(),
			role: element.getAttribute("role"),
			name: isPrivate(element) ? null : element.getAttribute("aria-label"),
			text: textOf(element).slice(0, 120) || null,
			label: describe(element),
			component: componentOf(element),
			...lookOf(element),
			rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
			url: location.href,
			isPrivate: isPrivate(element)
		}
	}

	const syncMasks = () => {
		const elements = privateElements();
		const isSame = elements.length === masked.length && elements.every((element, index) => masked[index].element === element);
		if (!isSame) {
			masksLayer.replaceChildren();
			masked = elements.map(element => {
				const group = document.createElement("div");
				masksLayer.append(group);
				return { element, group }
			});
		}
		privacy.textContent = `Notes, page text and pictures go to whoever started this run. Hidden: ${masked.length} private element(s).`;
	}

	const drawMasks = () => {
		for (const { element, group } of masked) {
			const rects = element.isConnected ? [...element.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0) : [];
			while (group.children.length < rects.length) {
				const box = document.createElement("div");
				box.className = "mask";
				group.append(box);
			}
			while (group.children.length > rects.length) group.lastElementChild.remove();
			rects.forEach((rect, index) => {
				Object.assign(group.children[index].style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
			});
		}
	}

	const liveElement = id => {
		const record = records.get(id);
		return record?.element?.isConnected && record.info.url === location.href ? record.element : null;
	}

	const findAgain = info => {
		if (info.url !== location.href) return null;
		try {
			return document.querySelector(info.selector);
		} catch {
			return null;
		}
	}

	const elementId = element => {
		for (const [id, record] of records) {
			if (record.element === element && record.info.url === location.href) return id;
		}
		const id = `e${nextElement++}`;
		const info = infoOf(element);
		records.set(id, { element, info });
		pending.add(id);
		state.captures.push({ id, rect: info.rect });
		changed();
		return id;
	}

	const labelOf = id => records.get(id)?.info.label ?? id;

	const pickAt = (x, y) => document.elementsFromPoint(x, y).find(element => element !== host && element !== document.documentElement) ?? null;

	const showOutline = element => {
		if (!element || !isPicking) {
			outline.style.display = "none";
			return;
		}
		const rect = element.getBoundingClientRect();
		Object.assign(outline.style, { display: "block", left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
		const parent = element.parentElement && element.parentElement !== document.body && element.parentElement !== document.documentElement ? `${shortName(element.parentElement)} › ` : "";
		outlineLabel.textContent = `${parent}${describe(element)} · ${Math.round(rect.width)} × ${Math.round(rect.height)}`;
		outlineLabel.classList.toggle("below", rect.top < 28);
	}

	const noteSummary = note => note.text.trim() || `${note.ids.length === 1 ? labelOf(note.ids[0]) : `${note.ids.length} elements`} — no text yet`;

	const noteEditor = note => {
		const body = document.createElement("div");
		body.className = "note-body";
		const elements = document.createElement("ul");
		elements.className = "elements";
		elements.append(...note.ids.map((id, index) => {
			const item = document.createElement("li");
			const label = document.createElement("span");
			const isElsewhere = !liveElement(id) && records.get(id)?.info.url !== location.href;
			label.textContent = `${note.ids.length > 1 ? String.fromCharCode(97 + index) + " · " : ""}${labelOf(id)}${isElsewhere ? " · another page" : ""}`;
			item.append(label);
			if (note.ids.length > 1) {
				const remove = document.createElement("button");
				remove.type = "button";
				remove.className = "tool";
				remove.setAttribute("aria-label", "Remove from the note");
				remove.replaceChildren(dom.fragment(ICONS.cancel));
				remove.addEventListener("click", () => {
					note.ids.splice(index, 1);
					changed();
					update();
				});
				item.append(remove);
			}
			return item;
		}));
		const text = document.createElement("textarea");
		text.className = "text";
		text.rows = 3;
		text.placeholder = "What to change";
		text.value = note.text;
		text.addEventListener("input", () => {
			note.text = text.value;
			changed();
			const summary = body.previousElementSibling?.querySelector("span");
			if (summary) {
				summary.textContent = noteSummary(note);
				summary.classList.toggle("empty", !note.text.trim());
			}
		});
		const actions = document.createElement("div");
		actions.className = "actions";
		const remove = document.createElement("button");
		remove.type = "button";
		remove.className = "button danger";
		remove.textContent = "Delete note";
		remove.addEventListener("click", () => {
			notes.splice(notes.indexOf(note), 1);
			activeNote = null;
			changed();
			update();
		});
		actions.append(remove);
		body.append(elements, text, actions);
		return body;
	}

	const renderNotes = () => {
		notesBadge.textContent = notes.length ? String(notes.length) : "";
		notesList.replaceChildren(...notes.map(note => {
			const item = document.createElement("li");
			const row = document.createElement("div");
			row.className = `note${note === activeNote ? " active" : ""}`;
			const mark = document.createElement("b");
			mark.textContent = noteMark(note);
			const summary = document.createElement("span");
			summary.textContent = noteSummary(note);
			if (!note.text.trim()) summary.className = "empty";
			row.append(mark, summary);
			row.addEventListener("click", () => openNote(note === activeNote ? null : note, true));
			item.append(row);
			if (note === activeNote) item.append(noteEditor(note));
			return item;
		}));
	}

	const update = () => {
		renderNotes();
		drawPicks();
	}

	const openNote = (note, shouldScroll = false) => {
		activeNote = note;
		if (note) showSheet("notes");
		if (shouldScroll && note) liveElement(note.ids[0])?.scrollIntoView({ block: "nearest", inline: "nearest" });
		update();
		if (note) notesList.querySelector(".text")?.focus();
	}

	const drawPicks = () => {
		const seen = new Set();
		for (const note of notes) {
			note.ids.forEach((id, index) => {
				const element = liveElement(id);
				if (!element || pending.has(id)) return;
				const key = `${note.uid}:${id}`;
				seen.add(key);
				let entry = markers.get(key);
				if (!entry) {
					const box = document.createElement("div");
					box.className = "picked";
					const marker = document.createElement("div");
					marker.addEventListener("click", event => {
						event.stopPropagation();
						openNote(note);
					});
					picks.append(box, marker);
					entry = { box, marker }
					markers.set(key, entry);
				}
				const rect = element.getBoundingClientRect();
				Object.assign(entry.box.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
				entry.marker.className = `marker${note === activeNote ? " active" : ""}`;
				entry.marker.textContent = `${noteMark(note)}${note.ids.length > 1 ? String.fromCharCode(97 + index) : ""}`;
				Object.assign(entry.marker.style, {
					left: `${Math.min(Math.max(2, rect.left - 10), innerWidth - 30)}px`,
					top: `${Math.min(Math.max(2, rect.top - 10), innerHeight - 22)}px`
				});
			});
		}
		for (const [key, entry] of markers) {
			if (seen.has(key)) continue;
			entry.box.remove();
			entry.marker.remove();
			markers.delete(key);
		}
	}

	const relink = () => {
		for (const record of records.values()) {
			if (record.element?.isConnected) continue;
			record.element = findAgain(record.info);
		}
	}

	const pick = (element, isAdding) => {
		hovered = null;
		showOutline(null);
		const id = elementId(element);
		if (isAdding && activeNote) {
			if (!activeNote.ids.includes(id)) {
				activeNote.ids.push(id);
				changed();
			}
			openNote(activeNote);
			return;
		}
		const existing = notes.find(note => note.ids.includes(id));
		if (existing) {
			openNote(existing);
			return;
		}
		const note = { uid: nextNote++, text: "", ids: [id], url: location.href, isFrozen }
		notes.push(note);
		changed();
		openNote(note);
	}

	const setPicking = value => {
		isPicking = value;
		if (value) {
			document.head.append(noSelect);
			getSelection()?.removeAllRanges();
		} else noSelect.remove();
		pickButton.setAttribute("aria-pressed", String(value));
		if (!value) showOutline(null);
	}

	const tipText = button => {
		const action = button.dataset.action;
		if (action === "toggle") return isCollapsed ? "Show tools" : "Hide tools";
		if (action === "pick") return isPicking ? "Pick elements — on" : "Pick elements — off";
		if (action === "freeze") return isFrozen ? "Unfreeze" : freezeTimer ? "Freezing… press again to stop" : `Freeze in ${FREEZE_SECONDS} s — hover what has to stay open`;
		return button.dataset.tip;
	}

	const showTip = button => {
		const action = button.dataset.action;
		tip.replaceChildren();
		tip.append(tipText(button));
		if (action && bindings[action]) {
			const shortcut = document.createElement("kbd");
			shortcut.textContent = showKey(bindings[action]);
			tip.append(shortcut);
		}
		const rect = button.getBoundingClientRect();
		tip.style.display = "block";
		const width = tip.offsetWidth;
		const height = tip.offsetHeight;
		const hasRoomRight = rect.right + 8 + width <= innerWidth - 8;
		const left = hasRoomRight ? rect.right + 8 : Math.max(8, rect.left - 8 - width);
		const top = Math.min(Math.max(8, rect.top + rect.height / 2 - height / 2), innerHeight - height - 8);
		Object.assign(tip.style, { left: `${left}px`, top: `${top}px` });
	}

	const placeDock = () => {
		const rect = dock.getBoundingClientRect();
		const left = Math.min(Math.max(0, rect.left), innerWidth - rect.width);
		const top = Math.min(Math.max(0, rect.top), innerHeight - rect.height);
		if (left !== rect.left || top !== rect.top) Object.assign(dock.style, { left: `${left}px`, top: `${top}px` });
		const sheet = openSheet === "notes" ? notesSheet : openSheet === "keys" ? keysSheet : null;
		const sheetWidth = sheet ? sheet.offsetWidth : Math.min(300, innerWidth - 72);
		const sheetHeight = sheet ? sheet.offsetHeight : 0;
		const hasRoomRight = left + rect.width + 6 + sheetWidth <= innerWidth - 8;
		const hasRoomLeft = left - 6 - sheetWidth >= 8;
		dock.classList.toggle("flip", !hasRoomRight && hasRoomLeft);
		dock.classList.toggle("raise", top + sheetHeight > innerHeight - 8 && top + rect.height - sheetHeight >= 8);
	}

	const renderHint = () => {
		hint.replaceChildren();
		const parts = [
			["Click", "new note"],
			["Shift+click", "add to the open note"],
			[`Alt+wheel, ${showKey(bindings.parent)} ${showKey(bindings.child)}`, "parent / child"],
			[showKey(bindings.pick), "pick on / off"],
			[showKey(bindings.done), "done"]
		];
		parts.forEach(([keys, text], index) => {
			const shortcut = document.createElement("kbd");
			shortcut.textContent = keys;
			hint.append(shortcut, ` ${text}${index < parts.length - 1 ? " · " : ""}`);
		});
	}

	const renderKeys = () => {
		keyRows.replaceChildren(...KEY_ACTIONS.map(([action, label]) => {
			const row = document.createElement("div");
			row.className = "row";
			const text = document.createElement("span");
			text.textContent = label;
			const button = document.createElement("button");
			button.type = "button";
			button.className = `kbd${listeningFor === action ? " listening" : ""}`;
			button.textContent = listeningFor === action ? "Press a key…" : showKey(bindings[action]);
			button.addEventListener("click", () => {
				listeningFor = listeningFor === action ? null : action;
				renderKeys();
			});
			row.append(text, button);
			return row;
		}));
		renderHint();
	}

	const setBinding = (action, combo) => {
		const taken = actionFor(combo);
		if (taken && taken !== action) bindings[taken] = bindings[action];
		bindings[action] = combo;
		state.keys = { ...bindings }
		changed();
		listeningFor = null;
		renderKeys();
	}

	const showSheet = sheet => {
		openSheet = sheet;
		notesSheet.hidden = sheet !== "notes";
		keysSheet.hidden = sheet !== "keys";
		notesButton.setAttribute("aria-pressed", String(sheet === "notes"));
		keysButton.setAttribute("aria-pressed", String(sheet === "keys"));
		listeningFor = null;
		renderKeys();
	}

	const setCollapsed = value => {
		isCollapsed = value;
		dock.classList.toggle("collapsed", value);
		toggleButton.replaceChildren(dom.fragment(value ? ICONS.open : ICONS.close));
		toggleButton.setAttribute("aria-label", value ? "Show tools" : "Hide tools");
		toggleButton.setAttribute("aria-expanded", String(!value));
		if (value) listeningFor = null;
	}

	const collect = () => {
		const elements = {}
		for (const id of new Set(notes.flatMap(note => note.ids))) {
			const element = liveElement(id);
			const record = records.get(id);
			if (element) {
				try {
					record.info = infoOf(element);
				} catch {}
			}
			elements[id] = { ...record.info, isLive: !!element }
		}
		return {
			notes: notes.map(note => ({ id: noteNumber(note), text: note.text.trim(), elements: [...note.ids], url: note.url, isFrozen: !!note.isFrozen })),
			generalNote: general.value.trim() || null,
			url: location.href,
			viewport: { width: innerWidth, height: innerHeight },
			maskedCount: masked.length,
			elements
		}
	}

	state.draft = () => ({
		notes: notes.map(note => ({ uid: note.uid, text: note.text, ids: [...note.ids], url: note.url, isFrozen: !!note.isFrozen })),
		generalNote: general.value,
		elements: Object.fromEntries([...records].map(([id, record]) => [id, record.info])),
		nextElement,
		nextNote,
		keys: state.keys
	});

	const hidden = new Set();
	state.setHidden = value => {
		if (!value) {
			for (const part of hidden) part.style.visibility = "";
			hidden.clear();
			pending.clear();
			state.capturing = [];
			return;
		}
		const rects = (state.capturing ?? []).map(capture => capture.rect);
		const covers = part => {
			const rect = part.getBoundingClientRect();
			return rect.width > 0 && rects.some(target => rect.left < target.x + target.width + 12 && rect.right > target.x - 12
				&& rect.top < target.y + target.height + 12 && rect.bottom > target.y - 12);
		}
		const parts = [outline, tip, toolbar, notesSheet, keysSheet, ...[...markers.values()].flatMap(entry => [entry.box, entry.marker])];
		for (const part of parts) {
			if (!covers(part)) continue;
			part.style.visibility = "hidden";
			hidden.add(part);
		}
	}

	const blocked = ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "dblclick", "contextmenu"];
	const onBlocked = event => {
		if (!isPicking || isOurs(event) || event.button > 0) return;
		if (event.type === "click" && event.detail === 0) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		if (event.type !== "click") return;
		const element = pickAt(event.clientX, event.clientY);
		if (element) pick(element, event.shiftKey);
	}

	const onMove = event => {
		if (!isPicking) return;
		if (isOurs(event)) {
			showOutline(null);
			return;
		}
		hovered = pickAt(event.clientX, event.clientY);
		hoverTrail = [];
		showOutline(hovered);
	}

	const isEditable = target => target instanceof Element && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName));

	const holdEvent = event => {
		if (!isOurs(event)) event.stopImmediatePropagation();
	}

	const stopCountdown = () => {
		clearInterval(freezeTimer);
		freezeTimer = 0;
		freezeBadge.textContent = "";
	}

	const setFrozen = value => {
		stopCountdown();
		if (value === isFrozen) return;
		isFrozen = value;
		if (value) {
			pausedAnimations = document.getAnimations().filter(animation => animation.playState === "running");
			for (const animation of pausedAnimations) animation.pause();
			for (const type of HELD_EVENTS) window.addEventListener(type, holdEvent, true);
		} else {
			for (const animation of pausedAnimations) {
				try {
					animation.play();
				} catch {}
			}
			pausedAnimations = [];
			for (const type of HELD_EVENTS) window.removeEventListener(type, holdEvent, true);
		}
		freezeButton.setAttribute("aria-pressed", String(value));
	}

	const toggleFreeze = () => {
		if (isFrozen) return setFrozen(false);
		if (freezeTimer) return stopCountdown();
		let left = FREEZE_SECONDS;
		freezeBadge.textContent = String(left);
		freezeTimer = setInterval(() => {
			left -= 1;
			if (left <= 0) setFrozen(true);
			else freezeBadge.textContent = String(left);
		}, 1000);
	}

	const run = action => {
		if (action === "done") finish("done");
		else if (action === "freeze") toggleFreeze();
		else if (action === "pick") setPicking(!isPicking);
		else if (action === "toggle") setCollapsed(!isCollapsed);
		else if (action === "notes") showSheet(openSheet === "notes" ? null : "notes");
		else if (action === "parent" && hovered?.parentElement && hovered.parentElement !== document.documentElement) {
			hoverTrail.push(hovered);
			hovered = hovered.parentElement;
			showOutline(hovered);
		} else if (action === "child" && hoverTrail.length) {
			hovered = hoverTrail.pop();
			showOutline(hovered);
		} else return false;
		return true;
	}

	const onKey = event => {
		const fromUs = isOurs(event);
		const combo = comboOf(event);
		if (listeningFor) {
			if (!combo) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			if (combo === "Escape") {
				listeningFor = null;
				renderKeys();
			} else setBinding(listeningFor, combo);
			return;
		}
		const action = combo && actionFor(combo);
		const isTyping = isEditable(fromUs ? root.activeElement : event.target);
		if (action === "done") {
			event.preventDefault();
			event.stopImmediatePropagation();
			run("done");
			return;
		}
		if (combo === "Escape" && openSheet) {
			event.preventDefault();
			event.stopImmediatePropagation();
			activeNote = null;
			showSheet(null);
			update();
			return;
		}
		if (fromUs && isTyping) {
			event.stopImmediatePropagation();
			return;
		}
		if (!fromUs && isTyping) return;
		if (action && (action !== "parent" && action !== "child" || (isPicking && hovered)) && run(action)) {
			event.preventDefault();
			event.stopImmediatePropagation();
		} else if (fromUs) event.stopImmediatePropagation();
	}

	const onWheel = event => {
		if (!isPicking || !event.altKey || isOurs(event) || !hovered) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		if (event.deltaY < 0) run("parent");
		else if (event.deltaY > 0) run("child");
	}

	const onSelectStart = event => {
		if (isPicking && !isOurs(event)) event.preventDefault();
	}

	const stopInside = event => event.stopPropagation();
	for (const type of ["keydown", "keyup", "keypress", "input", "beforeinput", "wheel", "focusin", "focusout"]) host.addEventListener(type, stopInside);

	let relinkCountdown = 0;
	const tick = () => {
		relinkCountdown -= 1;
		if (relinkCountdown <= 0) {
			relinkCountdown = 30;
			relink();
			syncMasks();
		}
		drawPicks();
		drawMasks();
		placeDock();
		if (hovered && isPicking) showOutline(hovered);
		frame = requestAnimationFrame(tick);
	}

	const finish = status => {
		if (state.status !== "open") return;
		setFrozen(false);
		try {
			state.result = status === "done" ? collect() : null;
		} catch (error) {
			state.result = { notes: [], generalNote: general.value.trim() || null, url: location.href, viewport: { width: innerWidth, height: innerHeight }, elements: {}, error: String(error) }
		}
		state.status = status;
		cancelAnimationFrame(frame);
		for (const type of blocked) window.removeEventListener(type, onBlocked, true);
		window.removeEventListener("mousemove", onMove, true);
		window.removeEventListener("keydown", onKey, true);
		window.removeEventListener("wheel", onWheel, { capture: true });
		window.removeEventListener("selectstart", onSelectStart, true);
		noSelect.remove();
		state.cleanup = () => {
			picks.style.display = "none";
		}
		state.dispose = () => host.remove();
		if (status !== "done") {
			host.remove();
			return;
		}
		activeNote = null;
		syncMasks();
		drawMasks();
		drawPicks();
		for (const part of [dock, tip, outline]) part.style.display = "none";
	}

	pickButton.addEventListener("click", () => run("pick"));
	notesButton.addEventListener("click", () => run("notes"));
	freezeButton.addEventListener("click", () => run("freeze"));
	toggleButton.addEventListener("click", () => run("toggle"));
	keysButton.addEventListener("click", () => showSheet(openSheet === "keys" ? null : "keys"));
	$(".done").addEventListener("click", () => run("done"));
	$(".cancel").addEventListener("click", () => finish("cancelled"));
	$(".reset-keys").addEventListener("click", () => {
		Object.assign(bindings, DEFAULT_KEYS);
		state.keys = { ...bindings }
		listeningFor = null;
		renderKeys();
	});
	for (const button of root.querySelectorAll(".tool[data-tip], .toggle")) {
		button.addEventListener("pointerenter", () => showTip(button));
		button.addEventListener("pointerleave", () => {
			tip.style.display = "none";
		});
		button.addEventListener("click", () => {
			if (tip.style.display === "block") showTip(button);
		});
	}

	const grip = $(".grip");
	grip.addEventListener("pointerdown", event => {
		const rect = dock.getBoundingClientRect();
		const offsetX = event.clientX - rect.left;
		const offsetY = event.clientY - rect.top;
		grip.setPointerCapture(event.pointerId);
		const move = moveEvent => {
			dock.style.left = `${Math.min(Math.max(0, moveEvent.clientX - offsetX), innerWidth - rect.width)}px`;
			dock.style.top = `${Math.min(Math.max(0, moveEvent.clientY - offsetY), innerHeight - rect.height)}px`;
			placeDock();
		}
		const up = () => {
			grip.removeEventListener("pointermove", move);
			grip.removeEventListener("pointerup", up);
		}
		grip.addEventListener("pointermove", move);
		grip.addEventListener("pointerup", up);
	});

	for (const type of blocked) window.addEventListener(type, onBlocked, true);
	window.addEventListener("mousemove", onMove, true);
	window.addEventListener("keydown", onKey, true);
	window.addEventListener("wheel", onWheel, { capture: true, passive: false });
	window.addEventListener("selectstart", onSelectStart, true);
	if (draft) {
		for (const [id, info] of Object.entries(draft.elements ?? {})) records.set(id, { element: findAgain(info), info });
		for (const note of draft.notes ?? []) notes.push({ ...note });
		general.value = draft.generalNote ?? "";
		nextElement = draft.nextElement ?? records.size + 1;
		nextNote = draft.nextNote ?? notes.length + 1;
	}
	general.addEventListener("input", changed);
	syncMasks();
	drawMasks();
	setPicking(true);
	setCollapsed(false);
	showSheet(null);
	update();
	state.finish = finish;
	frame = requestAnimationFrame(tick);
	return "open";
}