// Week: Monday to Sunday as rows, with today's label inverted and the events
// after this week listed along the bottom.
import { Draw, PAPER } from '../draw';
import { batteryText, dayIdx, dayShort, evTimeStr, hiLoText, monthName, tmFromDayIdx, tmOf, type LayoutCtx } from '../context';

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
	d.text(8, 22, 'mb', `${st.mday} - ${en.mday} ${monthName(en)} ${en.year}`, { color: PAPER });
	d.text(392, 20, 's', hiLoText(ctx, '  '), { align: 'right', color: PAPER });

	const rowh = 33;
	const top = 31;
	for (let i = 0; i < 7; i++) {
		const dIdx = weekStart + i;
		const dt = tmFromDayIdx(dIdx);
		const y = top + i * rowh;
		let ink: 0 | 1 = 0;
		if (dIdx === today) {
			d.fill(0, y, 68, rowh);
			ink = PAPER;
		}
		d.text(5, y + 22, 's', dayShort(dt), { color: ink });
		d.text(63, y + 23, 'mb', String(dt.mday), { align: 'right', color: ink });
		d.hline(0, y + rowh - 1, 400);
		d.vline(68, y, rowh);

		let k = 0;
		for (const e of ctx.events) {
			if (k >= 2) break;
			if (dayIdx(e.startLocal) !== dIdx) continue;
			const by = y + 13 + k * 15;
			d.text(78, by, 's', e.title, { maxW: 225 });
			d.text(392, by, 'sb', evTimeStr(e), { align: 'right' });
			k++;
		}
	}

	// footer: later events + battery
	const fy = top + 7 * rowh + 1;
	let shown = 0;
	for (const e of ctx.events) {
		if (shown >= 3) break;
		if (dayIdx(e.startLocal) <= weekEnd) continue;
		const t = tmOf(e.startLocal);
		const label = `${t.mday} ${e.title}`;
		if (shown === 0) {
			d.text(8, fy + 15, 'sb', 'Later');
			d.text(60, fy + 15, 's', label, { maxW: 125 });
		} else if (shown === 1) {
			d.text(190, fy + 15, 's', label, { maxW: 200 });
		} else {
			d.text(60, fy + 30, 's', label, { maxW: 280 });
		}
		shown++;
	}
	const bat = batteryText(ctx.vbat);
	if (bat) d.text(392, fy + 30, 's', bat, { align: 'right' });
	return d.toString();
}
