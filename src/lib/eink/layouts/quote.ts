// Quote of the day: one quote, set as large as it comfortably can be, with who said it.
import { Draw, PAPER } from '../draw';
import { measure, wrapText } from '../measure';
import { dayIdx, dayShort, monthShort, tmOf, type LayoutCtx } from '../context';
import { batteryIcon } from '../batteryIcon';
import { quoteForDay } from '../../../data/quotes';

export function quote(ctx: LayoutCtx): string {
	const d = new Draw(ctx.family, ctx.dark);
	const fam = ctx.family;
	const now = tmOf(ctx.nowLocal);

	d.fill(0, 0, 400, 30);
	d.text(10, 21, 'sb', 'QUOTE OF THE DAY', { color: PAPER });
	d.text(392, 21, 's', `${dayShort(now)} ${now.mday} ${monthShort(now)}`, { align: 'right', color: PAPER });

	const [text, who] = quoteForDay(dayIdx(ctx.nowLocal));
	const boxW = 340;
	const boxH = 196; // from y=48 to y=244
	// the biggest size where the whole quote fits
	const sizes: { role: 'bb' | 'mb' | 'm'; scale: number; lh: number }[] = [
		{ role: 'bb', scale: 1, lh: 38 },
		{ role: 'mb', scale: 1, lh: 25 },
		{ role: 'm', scale: 1, lh: 23 },
	];
	let pick = sizes[sizes.length - 1];
	let lines = wrapText(fam, pick.role, text, boxW, pick.scale);
	for (const s of sizes) {
		const l = wrapText(fam, s.role, text, boxW, s.scale);
		if (l.length * s.lh <= boxH && (s.role !== 'bb' || l.length <= 4)) {
			pick = s;
			lines = l;
			break;
		}
	}
	const blockH = lines.length * pick.lh;
	const top = 48 + Math.floor((boxH - blockH) / 2);
	d.fill(18, top + 2, 4, blockH - 6);
	lines.forEach((ln, i) => d.text(40, top + i * pick.lh + pick.lh - 8, pick.role, ln, { maxW: boxW + 10 }));

	d.text(392, 270, 's', '- ' + who, { align: 'right', maxW: 300 });
	batteryIcon(d, ctx, 10, 258, 'left');
	return d.toString();
}
