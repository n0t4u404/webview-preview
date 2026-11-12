import { ICONS } from "#src/page/annotate/icons.mjs";

export const MARKUP = `
	<div class="layer">
		<div class="masks"></div>
		<div class="picks"></div>
		<div class="outline"><div class="outline-label"></div></div>
	</div>
	<div class="dock" role="toolbar" aria-label="webview-preview annotate">
		<div class="card toolbar">
			<div class="grip" aria-hidden="true">${ICONS.grip}</div>
			<button type="button" class="tool toggle" data-action="toggle"></button>
			<div class="collapse"><div><div class="tools">
				<button type="button" class="tool pick" data-action="pick" data-tip="Pick elements">${ICONS.pick}</button>
				<button type="button" class="tool notes-button" data-action="notes" data-tip="Notes">${ICONS.notes}<span class="badge"></span></button>
				<button type="button" class="tool freeze" data-action="freeze" data-tip="Freeze">${ICONS.freeze}<span class="badge freeze-badge"></span></button>
				<button type="button" class="tool keys" data-tip="Key bindings">${ICONS.keys}</button>
				<div class="divider"></div>
				<button type="button" class="tool accent done" data-action="done" data-tip="Done">${ICONS.done}</button>
				<button type="button" class="tool cancel" data-tip="Cancel">${ICONS.cancel}</button>
			</div></div></div>
		</div>
		<div class="card sheet notes-sheet" hidden>
			<div class="sheet-head"><b>Notes</b><span class="run-name"></span></div>
			<p class="privacy"></p>
			<ol class="notes"></ol>
			<label>General note<textarea class="general" rows="2" placeholder="About the whole screen"></textarea></label>
			<p class="hint"></p>
		</div>
		<div class="card sheet keys-sheet" hidden>
			<div class="sheet-head"><b>Key bindings</b><span>click, then press a key</span></div>
			<div class="rows"></div>
			<div class="actions"><button type="button" class="button reset-keys">Reset</button></div>
		</div>
	</div>
	<div class="tip"></div>
`;