// Big date: a huge date on the left, the upcoming list on the right.
import { Draw } from '../draw';
import { firstThatFits, measure } from '../measure';
import { dayName, dayShort, evTimeStr, monthName, monthShort, round0, tmOf, upcoming, type LayoutCtx } from '../context';
import { batteryIcon } from '../batteryIcon';
import { monthYear, dateShort, dayMonth } from '../context';

export function bigdate(ctx: LayoutCtx): string {
	const d = new Draw(ctx.family, ctx.dark);
	const now = tmOf(ctx.nowLocal);

	// the date at triple size if it fits the left column (some fonts have wide digits), else double
	const big = measure(ctx.family, 'bb', String(now.mday), 3).w <= 150 ? 3 : 2;
	d.text(78, 118, 'bb', String(now.mday), { align: 'center', scale: big });
	d.text(78, 152, 'mb', dayName(now), { align: 'center' });
	d.text(78, 174, 's', firstThatFits(ctx.family, 's', [monthYear(now), monthYear(now, true)], 146), { align: 'center' });

	if (ctx.weather) {
		d.text(14, 240, 's', `High ${round0(ctx.weather.high)}C`);
		d.text(14, 258, 's', `Low  ${round0(ctx.weather.low)}C`);
	} else {
		d.text(14, 240, 's', '---');
	}
	batteryIcon(d, ctx, 14, 270, 'left');

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
		const when = dateShort(t);
		const timeText = evTimeStr(e);
		const timeW = measure(ctx.family, 'sb', timeText).w;
		d.text(174, y0 + 17, 's', firstThatFits(ctx.family, 's', [when, dayMonth(t)], 216 - timeW - 10));
		d.text(390, y0 + 17, 'sb', timeText, { align: 'right' });
		if (i < 5 && upcoming(ctx, i + 1)) d.dots(174, y0 + 27, 216, 4);
	}
	if (shown === 0) d.text(174, 60, 's', 'No upcoming events');
	return d.toString();
}
