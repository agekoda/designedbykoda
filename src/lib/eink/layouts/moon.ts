// Moon & Sun: tonight's moon, drawn as it really looks (and the right way up for where you
// live), with sunrise, sunset and the length of the day.
import { Draw, PAPER } from '../draw';
import { dayIdx, dayShort, monthShort, tmOf, type LayoutCtx } from '../context';
import { batteryIcon } from '../batteryIcon';
import { moonInfo, nextPhase, sunTimes } from '../astro';
import { moonBits } from '../moonImage';
import { measure, wrapText, firstThatFits } from '../measure';

const pad2 = (n: number) => String(n).padStart(2, '0');

function hhmm(ms: number, off: number): string {
	const t = Math.round((ms / 1000 + off) / 60); // minutes since local epoch midnight
	const m = ((t % 1440) + 1440) % 1440;
	return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

export function moon(ctx: LayoutCtx): string {
	const d = new Draw(ctx.family, ctx.dark);
	const now = tmOf(ctx.nowLocal);
	const off = ctx.utcOffsetSec ?? 0;

	d.fill(0, 0, 400, 30);
	d.text(10, 21, 'sb', 'MOON & SUN', { color: PAPER });
	d.text(392, 21, 's', `${dayShort(now)} ${now.mday} ${monthShort(now)}`, { align: 'right', color: PAPER });
	batteryIcon(d, ctx, 200, 4, 'center', PAPER);

	// The moon as it is at midday on this date.
	const noonMs = (dayIdx(ctx.nowLocal) * 86400 + 43200 - off) * 1000;
	const info = moonInfo(noonMs);
	// Wide fonts (the monospace ones) need more room for the words, so the moon gets a bit
	// smaller and the text column wider. Other fonts keep the original layout.
	const wide = measure(ctx.family, 's', 'Full moon  28 Aug').w > 150;
	const SZ = wide ? 176 : 216;
	const PX = wide ? 196 : 240; // left edge of the text column
	const PW = 392 - PX;
	d.bitmapBytes(8, wide ? 76 : 56, SZ, SZ, moonBits({ size: SZ, elong: info.elong, flip: !!ctx.loc && ctx.loc.lat < 0, dark: ctx.dark }));

	// phase name, how much is lit, and the next new and full moon
	const words = info.name.split(' ');
	d.text(PX, 56, 'mb', words[0]);
	d.text(PX, 78, 'mb', words.slice(1).join(' '));
	d.text(PX, 100, 's', `${Math.round(info.illum * 100)}% lit`);

	const dateOf = (ms: number) => {
		const t = tmOf(Math.floor(ms / 1000) + off);
		return `${t.mday} ${monthShort(t)}`;
	};
	const nn = nextPhase(noonMs, 0);
	const nf = nextPhase(noonMs, 180);
	const rows: [string, number][] = [
		['New moon', nn],
		['Full moon', nf],
	];
	rows.sort((a, b) => a[1] - b[1]);
	rows.forEach(([label, ms], i) => {
		d.text(PX, 124 + i * 18, 's', label);
		d.text(392, 124 + i * 18, 's', dateOf(ms), { align: 'right' });
	});
	d.hline(PX, 148, PW);

	// the sun
	if (!ctx.loc) {
		wrapText(ctx.family, 's', 'Add a weather location in setup to see sunrise and sunset times.', PW).forEach((ln, i) => d.text(PX, 178 + i * 18, 's', ln));
		return d.toString();
	}
	const sun = sunTimes(now.year, now.mon, now.mday, ctx.loc.lat, ctx.loc.lon);
	if (sun.rise === null || sun.set === null) {
		wrapText(ctx.family, 'mb', sun.polar === 'day' ? 'The sun stays up all day today.' : 'The sun stays down all day today.', PW).forEach((ln, i) => d.text(PX, 186 + i * 24, 'mb', ln));
		return d.toString();
	}

	// an arc from sunrise to sunset, with the sun at its highest, over a horizon line
	const cx = PX + PW / 2;
	const rx = Math.min(66 + (wide ? 22 : 0), Math.floor(PW / 2) - 6);
	const ry = 44;
	const hy = 208;
	const N = 36;
	const pt = (i: number): [number, number] => {
		const a = Math.PI * (1 - i / N);
		return [cx + rx * Math.cos(a), hy - ry * Math.sin(a)];
	};
	for (let i = 0; i < N; i += 2) {
		const [x0, y0] = pt(i);
		const [x1, y1] = pt(i + 1);
		d.line(x0, y0, x1, y1);
	}
	d.hline(cx - rx - 4, hy, rx * 2 + 8);
	d.vline(cx - rx, hy - 4, 8);
	d.vline(cx + rx, hy - 4, 8);
	const sy = hy - ry;
	d.disc(cx, sy, 12, PAPER);
	d.disc(cx, sy, 5);
	for (let k = 0; k < 8; k++) {
		const a = (k * Math.PI) / 4;
		d.line(cx + 8 * Math.cos(a), sy + 8 * Math.sin(a), cx + 11 * Math.cos(a), sy + 11 * Math.sin(a));
	}

	d.text(cx - rx, hy + 20, 's', 'Sunrise', { align: 'left' });
	d.text(cx + rx, hy + 20, 's', 'Sunset', { align: 'right' });
	d.text(cx - rx, hy + 42, 'mb', hhmm(sun.rise, off));
	d.text(cx + rx, hy + 42, 'mb', hhmm(sun.set, off), { align: 'right' });
	const mins = Math.round((sun.set - sun.rise) / 60000);
	const hm = `${Math.floor(mins / 60)}h ${pad2(mins % 60)}m`;
	d.text(cx, hy + 66, 's', firstThatFits(ctx.family, 's', [`${hm} of daylight`, `${hm} daylight`, hm], PW), { align: 'center' });
	return d.toString();
}
