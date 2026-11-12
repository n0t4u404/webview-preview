export const formatAnnotation = annotation => {
	const lines = [];
	const { name, status, result } = annotation;
	if (status !== "done" || !result) return [`annotate ${name}: cancelled`];
	const elementCount = Object.keys(result.elements).length;
	lines.push(`annotate ${name}: done · ${result.notes.length} note(s) · ${elementCount} element(s)${result.generalNote ? " · 1 general note" : ""}${result.maskedCount ? ` · ${result.maskedCount} private element(s) hidden` : ""}`);
	for (const note of result.notes) {
		const targets = note.elements.map(id => {
			const element = result.elements[id];
			if (!element) return id;
			const source = element.component?.source;
			const where = source ? ` (${source.file}${source.line ? `:${source.line}` : ""})` : "";
			return element.component?.name ? `${element.component.name} ${element.label}${where}` : `${element.label}${where}`;
		});
		const where = targets.length === 1 ? targets[0] : `${targets.length} elements: ${targets.join(", ")}`;
		lines.push(`  ${note.id}. ${where} — ${note.text || "(no text)"}`);
		for (const id of note.elements) lines.push(`     ${id}: ${result.elements[id]?.selector}`);
	}
	if (result.generalNote) lines.push(`  general: ${result.generalNote}`);
	return lines;
}