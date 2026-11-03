// Moon & Sun: tonight's moon, drawn as it really looks (and the right way up for where you
// live), with sunrise, sunset and the length of the day.
import { Draw, PAPER } from '../draw';
import { dayIdx, dayShort, monthShort, tmOf, type LayoutCtx } from '../context';
import { batteryIcon } from '../batteryIcon';
import { moonInfo, nextPhase, sunTimes } from '../astro';
import { moonBits } from '../moonImage';

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
	const SZ = 216;
	d.bitmapBytes(8, 56, SZ, SZ, moonBits({ size: SZ, elong: info.elong, flip: !!ctx.loc && ctx.loc.lat < 0, dark: ctx.dark }));

	// phase name, how much is lit, and the next new and full moon
	const words = info.name.split(' ');
	d.text(240, 56, 'mb', words[0]);
	d.text(240, 78, 'mb', words.slice(1).join(' '));
	d.text(240, 100, 's', `${Math.round(info.illum * 100)}% lit`);

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
		d.text(240, 124 + i * 18, 's', label);
		d.text(392, 124 + i * 18, 's', dateOf(ms), { align: 'right' });
	});
	d.hline(240, 148, 152);

	// the sun
	if (!ctx.loc) {
		d.text(240, 178, 's', 'Add a weather location in');
		d.text(240, 196, 's', 'setup to see sunrise and');
		d.text(240, 214, 's', 'sunset times.');
		return d.toString();
	}
	const sun = sunTimes(now.year, now.mon, now.mday, ctx.loc.lat, ctx.loc.lon);
	if (sun.rise === null || sun.set === null) {
		d.text(240, 186, 'mb', sun.polar === 'day' ? 'The sun stays up' : 'The sun stays down');
		d.text(240, 206, 's', 'all day today.');
		return d.toString();
	}

	// an arc from sunrise to sunset, with the sun at its highest, over a horizon line
	const cx = 316;
	const rx = 66;
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
	d.hline(244, hy, 144);
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
	d.text(cx, hy + 66, 's', `${Math.floor(mins / 60)}h ${pad2(mins % 60)}m of daylight`, { align: 'center' });
	return d.toString();
}
