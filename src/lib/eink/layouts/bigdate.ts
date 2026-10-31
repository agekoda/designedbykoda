// Big date: a huge date on the left, the upcoming list on the right.
import { Draw } from '../draw';
import { batteryText, dayName, dayShort, evTimeStr, monthName, monthShort, round0, tmOf, upcoming, type LayoutCtx } from '../context';

export function bigdate(ctx: LayoutCtx): string {
	const d = new Draw(ctx.family, ctx.dark);
	const now = tmOf(ctx.nowLocal);

	d.text(78, 118, 'bb', String(now.mday), { align: 'center', scale: 3 });
	d.text(78, 152, 'mb', dayName(now), { align: 'center' });
	d.text(78, 174, 's', `${monthName(now)} ${now.year}`, { align: 'center' });

	if (ctx.weather) {
		d.text(14, 240, 's', `High ${round0(ctx.weather.high)}C`);
		d.text(14, 258, 's', `Low  ${round0(ctx.weather.low)}C`);
	} else {
		d.text(14, 240, 's', '---');
	}
	const bat = batteryText(ctx.vbat);
	if (bat) d.text(14, 286, 's', bat);

	d.vline(158, 12, 276);

	d.text(174, 24, 'sb', 'UPCOMING');
	d.hline(174, 32, 216);

	let shown = 0;
	for (let i = 0; i < 6; i++) {
		const e = upcoming(ctx, i);
		if (!e) break;
		shown++;
		const y0 = 54 + i * 41;
		const t = tmOf(e.startLocal);
		d.text(174, y0, 's', e.title, { maxW: 216 });
		d.text(174, y0 + 17, 's', `${dayShort(t)} ${t.mday} ${monthShort(t)}`);
		d.text(390, y0 + 17, 'sb', evTimeStr(e), { align: 'right' });
		if (i < 5 && upcoming(ctx, i + 1)) d.dots(174, y0 + 27, 216, 4);
	}
	if (shown === 0) d.text(174, 60, 's', 'No upcoming events');
	return d.toString();
}
