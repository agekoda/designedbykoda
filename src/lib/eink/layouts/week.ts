// Week: Monday to Sunday as rows, with today's label inverted and the events
// after this week listed along the bottom.
import { Draw, PAPER } from '../draw';
import { measure } from '../measure';
import { batteryText, dayIdx, dayName, dayShort, evTimeStr, monthName, monthShort, round0, tmFromDayIdx, tmOf, type LayoutCtx } from '../context';

export function week(ctx: LayoutCtx): string {
	const d = new Draw(ctx.family, ctx.dark);
	const now = tmOf(ctx.nowLocal);

	const today = dayIdx(ctx.nowLocal);
	const sinceMon = (now.wday + 6) % 7;
	const weekStart = today - sinceMon;
	const weekEnd = weekStart + 6;
	const st = tmFromDayIdx(weekStart);
	const en = tmFromDayIdx(weekEnd);

	// header bar
	d.fill(0, 0, 400, 30);
	// Title on the left, weather on the right. Try the roomy wording first and
	// shorten whichever side is needed until they no longer touch.
	const range = st.mon === en.mon ? `${st.mday} - ${en.mday}` : `${st.mday} ${monthShort(st)} - ${en.mday}`;
	const titles = [`${range} ${monthName(en)} ${en.year}`, `${range} ${monthShort(en)} ${en.year}`, `${range} ${monthShort(en)}`];
	const hi = ctx.weather ? round0(ctx.weather.high) : '';
	const lo = ctx.weather ? round0(ctx.weather.low) : '';
	const wx = ctx.weather ? [`High ${hi}C  Low ${lo}C`, `${hi}C / ${lo}C`, `${hi}C`] : ['---'];
	let title = titles[titles.length - 1];
	let wxText = wx[wx.length - 1];
	let best = Infinity;
	for (let ti = 0; ti < titles.length; ti++) {
		for (let wi = 0; wi < wx.length; wi++) {
			const cost = ti + wi * 1.5; // shortening the weather loses more than shortening the month
			if (cost >= best) continue;
			if (8 + measure(ctx.family, 'mb', titles[ti]).right + 14 <= 392 - measure(ctx.family, 's', wx[wi]).w) {
				best = cost;
				title = titles[ti];
				wxText = wx[wi];
			}
		}
	}
	d.text(8, 22, 'mb', title, { color: PAPER });
	d.text(392, 20, 's', wxText, { align: 'right', color: PAPER });

	const COL = 72; // width of the day column
	// Day labels (Mon / Mo / M) share the column with the date number. Every row of a
	// week uses the same style: the longest one that fits next to the widest number.
	const days = [0, 1, 2, 3, 4, 5, 6].map((i) => tmFromDayIdx(weekStart + i));
	const styleLabel = [(t: ReturnType<typeof tmOf>) => dayShort(t), (t: ReturnType<typeof tmOf>) => dayName(t).slice(0, 2), (t: ReturnType<typeof tmOf>) => dayName(t).slice(0, 1)];
	let labelOf = styleLabel[styleLabel.length - 1];
	for (const f of styleLabel) {
		if (days.every((t) => 4 + measure(ctx.family, 's', f(t)).right + 3 <= COL - 5 - measure(ctx.family, 'mb', String(t.mday)).w)) {
			labelOf = f;
			break;
		}
	}
	const rowh = 33;
	const top = 31;
	for (let i = 0; i < 7; i++) {
		const dIdx = weekStart + i;
		const dt = tmFromDayIdx(dIdx);
		const y = top + i * rowh;
		let ink: 0 | 1 = 0;
		if (dIdx === today) {
			d.fill(0, y, COL, rowh);
			ink = PAPER;
		}
		d.text(4, y + 22, 's', labelOf(dt), { color: ink });
		d.text(COL - 5, y + 23, 'mb', String(dt.mday), { align: 'right', color: ink });
		d.hline(0, y + rowh - 1, 400);
		d.vline(COL, y, rowh);

		let k = 0;
		for (const e of ctx.events) {
			if (k >= 2) break;
			if (dayIdx(e.startLocal) !== dIdx) continue;
			const by = y + 13 + k * 15;
			const timeText = evTimeStr(e);
			d.text(COL + 10, by, 's', e.title, { maxW: Math.min(225, 392 - measure(ctx.family, 'sb', timeText).w - 10 - (COL + 10)) });
			d.text(392, by, 'sb', timeText, { align: 'right' });
			k++;
		}
	}

	// footer: later events + battery. Room is shared out by measured width, so
	// the label, the three items and the battery never run into each other.
	const fy = top + 7 * rowh + 1;
	const laterW = measure(ctx.family, 'sb', 'Later').right;
	const x1 = 8 + laterW + 8; // where the first item starts
	const bat = batteryText(ctx.vbat);
	const batW = bat ? measure(ctx.family, 's', bat).w : 0;
	const mid = 190; // the second item starts here
	let shown = 0;
	for (const e of ctx.events) {
		if (shown >= 3) break;
		if (dayIdx(e.startLocal) <= weekEnd) continue;
		const t = tmOf(e.startLocal);
		const label = `${t.mday} ${e.title}`;
		if (shown === 0) {
			d.text(8, fy + 15, 'sb', 'Later');
			d.text(x1, fy + 15, 's', label, { maxW: Math.min(125, mid - 8 - x1) });
		} else if (shown === 1) {
			d.text(mid, fy + 15, 's', label, { maxW: Math.min(200, 392 - mid) });
		} else {
			d.text(x1, fy + 30, 's', label, { maxW: Math.min(280, 392 - batW - 12 - x1) });
		}
		shown++;
	}
	if (bat) d.text(392, fy + 30, 's', bat, { align: 'right' });
	return d.toString();
}
