// Away mode (src/lib/eink/dayCfg.ts): shown instead of everything else until the date you're back.
import { Draw, PAPER } from '../draw';
import { batteryIcon } from '../batteryIcon';
import { dateLong, dateShort, tmFromDayIdx, type LayoutCtx } from '../context';

export function away(ctx: LayoutCtx): string {
	const d = new Draw(ctx.family, ctx.dark);
	const a = ctx.away;
	const back = a ? Math.floor(Date.parse(a.until + 'T00:00:00Z') / 86400000) : null;
	d.fill(0, 0, 400, 30);
	d.text(10, 21, 'sb', 'AWAY', { color: PAPER });
	batteryIcon(d, ctx, 392, 4, 'right', PAPER);
	d.text(200, 118, 'bb', 'Away', { align: 'center', scale: 2 });
	if (back !== null) d.text(200, 168, 'mb', `until ${dateShort(tmFromDayIdx(back))}`, { align: 'center' });
	if (a?.note) d.text(200, 206, 'm', a.note, { align: 'center', maxW: 360 });
	d.hline(150, 236, 100);
	if (back !== null) d.text(200, 266, 's', `Back to normal on ${dateLong(tmFromDayIdx(back))}`, { align: 'center', maxW: 380 });
	return d.toString();
}
