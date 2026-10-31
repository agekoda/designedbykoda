// Month: the whole month as a grid, a small square under each day that has
// events (up to three), and the next event along the bottom.
import { Draw, PAPER } from '../draw';
import { firstThatFits, measure } from '../measure';
import { daysInMonth, dayShort, evTimeStr, monthName, monthShort, round0, tmOf, upcoming, type LayoutCtx } from '../context';

export function month(ctx: LayoutCtx): string {
	const d = new Draw(ctx.family, ctx.dark);
	const now = tmOf(ctx.nowLocal);

	// header bar
	d.fill(0, 0, 400, 32);
	const titles = [`${monthName(now)} ${now.year}`, `${monthShort(now)} ${now.year}`];
	const hi = ctx.weather ? round0(ctx.weather.high) : '';
	const lo = ctx.weather ? round0(ctx.weather.low) : '';
	const wx = ctx.weather ? [`High ${hi}C  Low ${lo}C`, `${hi}C / ${lo}C`, `${hi}C`] : ['---'];
	let title = titles[titles.length - 1];
	let wxText = wx[wx.length - 1];
	let best = Infinity;
	for (let ti = 0; ti < titles.length; ti++) {
		for (let wi = 0; wi < wx.length; wi++) {
			const cost = ti + wi * 1.5;
			if (cost >= best) continue;
			if (8 + measure(ctx.family, 'mb', titles[ti]).right + 14 <= 392 - measure(ctx.family, 's', wx[wi]).w) {
				best = cost;
				title = titles[ti];
				wxText = wx[wi];
			}
		}
	}
	d.text(8, 23, 'mb', title, { color: PAPER });
	d.text(392, 21, 's', wxText, { align: 'right', color: PAPER });

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
		const nextX = Math.max(52, 8 + measure(ctx.family, 'sb', 'Next').right + (ctx.family === 'sans' ? 4 : 9));
		// the day + time on the right; drop the weekday if the font is too wide to leave room for the title
		const when = firstThatFits(ctx.family, 'sb', [`${dayShort(t)} ${t.mday}  ${evTimeStr(next)}`, `${t.mday}  ${evTimeStr(next)}`, evTimeStr(next)], 392 - nextX - 90);
		const whenW = measure(ctx.family, 'sb', when).w;
		d.text(8, 288, 'sb', 'Next');
		d.text(nextX, 288, 's', next.title, { maxW: Math.min(220, 392 - whenW - 10 - nextX) });
		d.text(392, 290, 'sb', when, { align: 'right' });
	} else {
		d.text(8, 288, 's', 'No upcoming events');
	}
	return d.toString();
}
