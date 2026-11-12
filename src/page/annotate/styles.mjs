export const STYLES = `
	:host { all: initial }
	* { box-sizing: border-box }
	.layer, .dock, .tip { font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: #ffffff; user-select: none; -webkit-user-select: none }
	.layer { position: fixed; inset: 0; pointer-events: none }
	.outline { position: fixed; border: 2px solid #0a77ff; border-radius: 4px; background: rgba(10, 119, 255, 0.08); display: none }
	.outline-label { position: absolute; left: -2px; bottom: calc(100% + 4px); white-space: nowrap; padding: 2px 8px; border-radius: 6px; background: #0a77ff; color: #fff; font-size: 12px; font-weight: 600 }
	.outline-label.below { bottom: auto; top: calc(100% + 4px) }
	.mask { position: fixed; background: repeating-linear-gradient(45deg, #1b1b1b 0 6px, #262626 6px 12px); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 4px }
	.privacy { margin: 0; color: #939393; font-size: 12px }
	.picked { position: fixed; border: 1px dashed rgba(10, 119, 255, 0.9); border-radius: 4px }
	.marker { position: fixed; min-width: 22px; height: 22px; padding: 0 6px; border-radius: 11px; background: #0a77ff; color: #fff; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; pointer-events: auto; cursor: pointer; box-shadow: 0 0 0 2px #0a0a0a, 0 6px 16px rgba(0, 0, 0, 0.4) }
	.marker.active { background: #e0a43a; color: #0a0a0a }
	.card { background: #111111; border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 12px; box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4) }
	.dock { position: fixed; left: 12px; top: 12px; pointer-events: none }
	.dock > .card { pointer-events: auto }
	.dock .sheet { position: absolute; left: calc(100% + 6px); top: 0 }
	.dock.flip .sheet { left: auto; right: calc(100% + 6px) }
	.dock.raise .sheet { top: auto; bottom: 0 }
	.toolbar { display: flex; flex-direction: column; padding: 4px }
	.grip { height: 14px; display: flex; align-items: center; justify-content: center; color: #4a4a4a; cursor: grab; touch-action: none }
	.grip svg { width: 16px; height: 16px }
	.grip:active { cursor: grabbing }
	.collapse { display: grid; grid-template-rows: 1fr; opacity: 1; transition: grid-template-rows 0.2s ease-out, opacity 0.2s ease-out }
	.collapse > * { overflow: hidden; min-height: 0 }
	.collapsed .collapse { grid-template-rows: 0fr; opacity: 0 }
	.tools { display: flex; flex-direction: column }
	.divider { height: 1px; margin: 4px 6px; background: rgba(255, 255, 255, 0.08) }
	button { font: inherit; color: inherit }
	.tool { position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; color: #939393; background: none; border: none; border-radius: 8px; cursor: pointer; transition: color 0.2s ease-out, background-color 0.2s ease-out }
	.tool:hover { color: #ffffff }
	.tool[hidden] { display: none }
	.tool[aria-pressed="true"] { color: #ffffff; background: rgba(255, 255, 255, 0.08) }
	.tool.accent { color: #0a77ff }
	.tool.accent:hover { color: #3d95ff }
	.tool[aria-disabled="true"] { opacity: 0.4; cursor: not-allowed }
	.tool[aria-disabled="true"]:hover { color: #939393 }
	.tool:focus-visible { outline: none; box-shadow: inset 0 0 0 2px #0a77ff }
	.button:focus-visible, .kbd:focus-visible, textarea:focus-visible { outline: none; box-shadow: 0 0 0 2px #0a0a0a, 0 0 0 4px #0a77ff }
	.tip { position: fixed; z-index: 2; padding: 4px 8px; border-radius: 8px; background: #111111; border: 1px solid rgba(255, 255, 255, 0.05); box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4); white-space: nowrap; font-size: 12px; pointer-events: none; display: none }
	.tip kbd { margin-left: 8px; color: #939393; font: 11px ui-monospace, monospace }
	.sheet { width: 300px; max-width: calc(100vw - 72px); max-height: calc(100vh - 16px); overflow: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; transition: opacity 0.2s ease-out, transform 0.2s ease-out }
	.collapsed .sheet { opacity: 0; transform: translateX(-6px); pointer-events: none }
	.flip.collapsed .sheet { transform: translateX(6px) }
	.flip .toggle svg { transform: scaleX(-1) }
	.sheet[hidden] { display: none }
	.sheet-head { display: flex; align-items: baseline; gap: 6px }
	.sheet-head b { font-size: 14px }
	.sheet-head span { color: #939393; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
	.badge { position: absolute; top: 3px; right: 3px; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px; background: #0a77ff; color: #fff; font-size: 10px; font-weight: 700; line-height: 16px; text-align: center }
	.badge:empty { display: none }
	.notes { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; max-height: 320px; overflow: auto }
	.note-body { display: flex; flex-direction: column; gap: 8px; padding: 4px 4px 8px 38px }
	.notes:empty::before { content: "No notes yet — click an element on the page."; color: #939393 }
	.note { display: flex; gap: 8px; align-items: center; padding: 6px 8px; border-radius: 8px; cursor: pointer; transition: background-color 0.2s ease-out }
	.note:hover, .note.active { background: rgba(255, 255, 255, 0.06) }
	.note b { min-width: 22px; height: 22px; border-radius: 11px; background: #0a77ff; color: #fff; font-size: 12px; display: flex; align-items: center; justify-content: center }
	.note.active b { background: #e0a43a; color: #0a0a0a }
	.note span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
	.note span.empty { color: #939393 }
	label { display: flex; flex-direction: column; gap: 6px; color: #939393 }
	textarea { font: inherit; color: #ffffff; background: #0a0a0a; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 8px 10px; resize: vertical; min-height: 44px; user-select: text; -webkit-user-select: text; transition: border-color 0.2s ease-out }
	textarea:hover { border-color: rgba(255, 255, 255, 0.16) }
	.hint { margin: 0; color: #939393; font-size: 12px }
	.hint kbd, .rows kbd { font: 11px ui-monospace, monospace; color: #ffffff }
	.rows { display: flex; flex-direction: column; gap: 2px }
	.row { display: flex; align-items: center; gap: 8px; padding: 4px 0 }
	.row span { flex: 1 }
	.kbd { min-width: 64px; padding: 4px 8px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.08); background: #0a0a0a; color: #ffffff; font: 12px ui-monospace, monospace; cursor: pointer }
	.kbd:hover { border-color: rgba(255, 255, 255, 0.16) }
	.kbd.listening { border-color: #0a77ff; color: #0a77ff }
	.actions { display: flex; gap: 6px; justify-content: flex-end }
	.button { padding: 6px 12px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.08); background: rgba(255, 255, 255, 0.04); cursor: pointer; transition: border-color 0.2s ease-out, color 0.2s ease-out }
	.button:hover { border-color: rgba(255, 255, 255, 0.16) }
	.button.danger:hover { border-color: #d9534f; color: #ff8a86 }
	.elements { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; color: #939393 }
	.elements li { display: flex; gap: 6px; align-items: center }
	.elements li span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
	.elements .tool { width: 24px; height: 24px }
	@media (prefers-reduced-motion: reduce) { .collapse, .sheet, .tool, .note, textarea, .button { transition: none } }
`;