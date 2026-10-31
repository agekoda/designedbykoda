// Month: the whole month as a grid, a small square under each day that has
// events (up to three), and the next event along the bottom.
import { Draw, PAPER } from '../draw';
import { daysInMonth, dayShort, evTimeStr, hiLoText, monthName, tmOf, upcoming, type LayoutCtx } from '../context';

export function month(ctx: LayoutCtx): string {
	const d = new Draw(ctx.family, ctx.dark);
	const now = tmOf(ctx.nowLocal);

	// header bar
	d.fill(0, 0, 400, 32);
	d.text(8, 23, 'mb', `${monthName(now)} ${now.year}`, { color: PAPER });
	d.text(392, 21, 's', hiLoText(ctx, '  '), { align: 'right', color: PAPER });

	const colw = 57;
	const top = 50;
	const cellh = 36;
	['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach((n, i) => d.text(i * colw + Math.floor(colw / 2), 46, 'sb', n, { align: 'center' }));

	const firstWday = (((now.wday - (now.mday - 1)) % 7) + 7) % 7;
	const offset = (firstWday + 6) % 7;
	const ndays = daysInMonth(now.year, now.mon);

	const counts = new Array(32).fill(0);
	for (const e of ctx.events) {
		const t = tmOf(e.startLocal);
		if (t.year === now.year && t.mon === now.mon) counts[t.mday]++;
	}

	const rows = Math.floor((offset + ndays + 6) / 7);
	for (let r = 0; r <= rows; r++) d.hline(0, top + r * cellh, 399);

	for (let day = 1; day <= ndays; day++) {
		const col = (day + offset - 1) % 7;
		const row = Math.floor((day + offset - 1) / 7);
		const x = col * colw;
		const y = top + row * cellh;
		const isToday = day === now.mday;
		if (isToday) d.fill(x + 1, y + 1, colw - 1, cellh - 1);
		const ink = isToday ? PAPER : 0;
		d.text(x + 6, y + 16, 's', String(day), { color: ink });
		const n = Math.min(3, counts[day]);
		for (let k = 0; k < n; k++) d.fill(x + 6 + k * 10, y + 24, 7, 7, ink);
	}

	// footer: next event
	d.hline(0, 266, 400);
	const next = upcoming(ctx, 0);
	if (next) {
		const t = tmOf(next.startLocal);
		d.text(8, 288, 'sb', 'Next');
		d.text(52, 288, 's', next.title, { maxW: 220 });
		d.text(392, 290, 'sb', `${dayShort(t)} ${t.mday}  ${evTimeStr(next)}`, { align: 'right' });
	} else {
		d.text(8, 288, 's', 'No upcoming events');
	}
	return d.toString();
}
