// Next up: the very next event in huge type, then the four after it.
import { Draw, PAPER } from '../draw';
import { batteryText, dayIdx, dayShort, evTimeStr, hiLoText, monthShort, relDayText, tmOf, upcoming, type LayoutCtx } from '../context';

export function nextup(ctx: LayoutCtx): string {
	const d = new Draw(ctx.family, ctx.dark);
	const now = tmOf(ctx.nowLocal);

	// header bar
	d.fill(0, 0, 400, 30);
	d.text(10, 21, 'sb', 'NEXT UP', { color: PAPER });
	d.text(392, 21, 's', `${dayShort(now)} ${now.mday} ${monthShort(now)}`, { align: 'right', color: PAPER });

	const today = dayIdx(ctx.nowLocal);
	const first = upcoming(ctx, 0);
	if (first) {
		const t = tmOf(first.startLocal);
		d.text(10, 108, 'bb', evTimeStr(first), { scale: 2 });
		d.text(10, 138, 'mb', first.title, { maxW: 380 });
		d.text(10, 160, 's', `${relDayText(dayIdx(first.startLocal), today)}  -  ${dayShort(t)} ${t.mday} ${monthShort(t)}`);
		d.hline(0, 172, 400);

		for (let i = 0; i < 4; i++) {
			const e = upcoming(ctx, i + 1);
			if (!e) break;
			const b = 194 + i * 22;
			const et = tmOf(e.startLocal);
			d.text(10, b + 1, 'mb', String(et.mday));
			d.vline(44, b - 13, 19);
			d.text(52, b, 's', e.title, { maxW: 230 });
			d.text(392, b, 'sb', evTimeStr(e), { align: 'right' });
		}
	} else {
		d.text(10, 108, 'mb', 'Nothing coming up');
	}

	// footer
	d.hline(0, 270, 400);
	d.text(10, 290, 's', hiLoText(ctx, '   '));
	const bat = batteryText(ctx.vbat);
	if (bat) d.text(392, 290, 's', bat, { align: 'right' });
	return d.toString();
}
