// Countdown: a name, and how many days are left until the date you picked.
import { Draw, PAPER } from '../draw';
import { measure } from '../measure';
import { dayIdx, dayShort, DAY_NAMES, MONTH_NAMES, monthShort, tmOf, type LayoutCtx } from '../context';
import { batteryIcon } from '../batteryIcon';

export function parseDay(s: string): number | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
	if (!m) return null;
	const ms = Date.UTC(+m[1], +m[2] - 1, +m[3]);
	return Number.isFinite(ms) ? Math.floor(ms / 86400000) : null;
}

export function countdown(ctx: LayoutCtx): string {
	const d = new Draw(ctx.family, ctx.dark);
	const fam = ctx.family;
	const now = tmOf(ctx.nowLocal);

	d.fill(0, 0, 400, 30);
	d.text(10, 21, 'sb', 'COUNTDOWN', { color: PAPER });
	d.text(392, 21, 's', `${dayShort(now)} ${now.mday} ${monthShort(now)}`, { align: 'right', color: PAPER });
	batteryIcon(d, ctx, 200, 4, 'center', PAPER);

	const c = ctx.countdown;
	const target = c ? parseDay(c.date) : null;
	if (!c || !c.title.trim() || target === null) {
		d.text(200, 130, 'mb', 'Set up your countdown', { align: 'center' });
		d.text(200, 158, 's', 'Open your dashboard, choose Customize,', { align: 'center' });
		d.text(200, 176, 's', 'then give it a name and a date.', { align: 'center' });
		return d.toString();
	}

	const days = target - dayIdx(ctx.nowLocal);
	const title = c.title.trim();
	const big = measure(fam, 'mb', title, 2).w <= 360;
	d.text(200, big ? 76 : 68, 'mb', title, { align: 'center', scale: big ? 2 : 1, maxW: 372 });
	d.hline(150, 90, 100);

	if (days > 0) {
		const n = String(days);
		const w = measure(fam, 'bb', n, 4).w;
		const sc = w <= 330 ? 4 : 3;
		d.text(200, 228, 'bb', n, { align: 'center', scale: sc });
		d.text(200, 256, 'mb', days === 1 ? 'day to go' : 'days to go', { align: 'center' });
	} else if (days === 0) {
		d.text(200, 200, 'bb', 'Today!', { align: 'center', scale: 3 });
	} else {
		const n = String(-days);
		d.text(200, 200, 'bb', n, { align: 'center', scale: 3 });
		d.text(200, 238, 'mb', days === -1 ? 'day ago' : 'days ago', { align: 'center' });
	}

	const t = tmOf(target * 86400 + 43200);
	d.text(200, 282, 's', `${DAY_NAMES[t.wday]} ${t.mday} ${MONTH_NAMES[t.mon]} ${t.year}`, { align: 'center' });
	return d.toString();
}
