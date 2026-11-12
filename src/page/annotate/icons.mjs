const icon = paths => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
export const ICONS = {
	grip: icon("<circle cx='5' cy='9' r='1'/><circle cx='12' cy='9' r='1'/><circle cx='19' cy='9' r='1'/><circle cx='5' cy='15' r='1'/><circle cx='12' cy='15' r='1'/><circle cx='19' cy='15' r='1'/>"),
	open: icon("<rect width='18' height='18' x='3' y='3' rx='2'/><path d='M9 3v18'/><path d='m14 9 3 3-3 3'/>"),
	close: icon("<rect width='18' height='18' x='3' y='3' rx='2'/><path d='M9 3v18'/><path d='m16 15-3-3 3-3'/>"),
	pick: icon("<path d='m12 9-8.414 8.414A2 2 0 0 0 3 18.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 3.828 21h1.344a2 2 0 0 0 1.414-.586L15 12'/><path d='m18 9 .4.4a1 1 0 1 1-3 3l-3.8-3.8a1 1 0 1 1 3-3l.4.4 3.4-3.4a1 1 0 1 1 3 3z'/><path d='m2 22 .414-.414'/>"),
	freeze: icon("<path d='m10 20-1.25-2.5L6 18'/><path d='M10 4 8.75 6.5 6 6'/><path d='m14 20 1.25-2.5L18 18'/><path d='m14 4 1.25 2.5L18 6'/><path d='m17 21-3-6h-4'/><path d='m17 3-3 6 1.5 3'/><path d='M2 12h6.5L10 9'/><path d='m20 10-1.5 2 1.5 2'/><path d='M22 12h-6.5L14 15'/><path d='m4 10 1.5 2L4 14'/><path d='m7 21 3-6-1.5-3'/><path d='m7 3 3 6h4'/>"),
	notes: icon("<path d='M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z'/><path d='M7 11h10'/><path d='M7 15h6'/><path d='M7 7h8'/>"),
	keys: icon("<path d='M10 8h.01'/><path d='M12 12h.01'/><path d='M14 8h.01'/><path d='M16 12h.01'/><path d='M18 8h.01'/><path d='M6 8h.01'/><path d='M7 16h10'/><path d='M8 12h.01'/><rect width='20' height='16' x='2' y='4' rx='2'/>"),
	done: icon("<path d='M20 6 9 17l-5-5'/>"),
	cancel: icon("<path d='M18 6 6 18'/><path d='m6 6 12 12'/>")
}