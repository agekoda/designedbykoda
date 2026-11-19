// Habits (src/lib/eink/habits.ts):
//   - habits(): the ready-made layout, one row per habit with its streak and the last three weeks
//   - habitGrid(): the same rows in any box (the layout builder's Habits widget)
import { Draw, INK, PAPER, type Color } from '../draw';
import { fontId, type Family, type Role } from '../fonts';
import { VMETRICS } from '../vmetrics';
import { tr } from '../i18n';
import { wrapText } from '../measure';
import { batteryIcon } from '../batteryIcon';
import { dateShort, dayIdx, dayLetter, tmFromDayIdx, tmOf, type LayoutCtx } from '../context';
import { doneSet, streak } from '../habits';
import { centred } from './centred';

function vm(fam: Family, role: Role) {
	const v = VMETRICS[fontId(fam, role)] ?? VMETRICS[fontId('sans', role)];
	return { asc: v[0], desc: v[3], lh: v[4] };
}


type Box = { x: number; y: number; w: number; h: number };
const GAP = 3;

// One row per habit: its name and streak on top, a square for each of the last few days under it
// (filled = done, outline = not done, today underlined). `days` 0 = as many as fit.
export function habitGrid(d: Draw, ctx: LayoutCtx, box: Box, o: { days?: number; streak?: boolean; letters?: boolean; color?: Color } = {}) {
	const fam = ctx.family;
	const color = o.color ?? INK;
	const list = (ctx.habits ?? []).filter((h) => h.name);
	const sv = vm(fam, 's');
	if (!list.length) {
		d.text(box.x + box.w / 2, box.y + box.h / 2, 's', 'No habits yet', { align: 'center', color, maxW: box.w - 4 });
		return;
	}
	const today = dayIdx(ctx.nowLocal);
	const textH = sv.asc + sv.desc;
	let letterH = o.letters ? sv.lh + 4 : 0;
	let rowH = Math.min(84, (box.h - letterH) / list.length);
	const headH = textH + 4;
	// short rows put the name and the squares on one line
	const inline = rowH < headH + 14;
	if (inline && o.letters) {
		letterH = 0; // no room for them
		rowH = Math.min(84, box.h / list.length);
	}
	const want = o.days && o.days > 0 ? o.days : 0;
	const streakW = o.streak === false ? 0 : Math.min(box.w / 3, 70);
	const room = inline ? Math.max(40, box.w * 0.62 - streakW) : box.w; // width for the squares
	let cell = inline ? Math.min(rowH - 6, 14) : Math.min(rowH - headH - 8, 18);
	if (want) cell = Math.min(cell, Math.floor((room + GAP) / want - GAP));
	cell = Math.max(4, Math.floor(cell));
	const n = want || Math.max(1, Math.min(42, Math.floor((room + GAP) / (cell + GAP))));
	const stripW = n * (cell + GAP) - GAP;
	const x0 = box.x + box.w - stripW; // right-aligned, so today sits at the right edge
	let y = box.y;
	let lastBottom = box.y;
	for (const h of list) {
		const need = inline ? Math.max(textH, cell + 3) : headH + cell + 3;
		if (y + need > box.y + box.h - letterH + 1) break;
		const done = doneSet(h);
		const s = streak(h, today);
		const right = o.streak === false ? '' : s === 0 ? 'Start today' : s === 1 ? '1 day' : `${s} days`;
		let top: number;
		if (inline) {
			const mid = y + Math.max(textH, cell) / 2;
			top = Math.round(mid - cell / 2);
			const ty = mid - textH / 2 + sv.asc;
			if (right) d.text(x0 - 8, ty, s > 0 ? 'sb' : 's', right, { align: 'right', color, maxW: streakW });
			d.text(box.x, ty, 'sb', h.name, { color, maxW: Math.max(20, x0 - box.x - (right ? streakW : 0) - 14) });
		} else {
			const rightW = right ? Math.min(box.w / 2, 90) : 0;
			d.text(box.x, y + sv.asc, 'sb', h.name, { color, maxW: box.w - rightW - 6 });
			if (right) d.text(box.x + box.w, y + sv.asc, s > 0 ? 'sb' : 's', right, { align: 'right', color, maxW: rightW });
			top = y + headH;
		}
		for (let i = 0; i < n; i++) {
			const day = today - (n - 1 - i);
			const cx = x0 + i * (cell + GAP);
			if (done.has(day)) d.fillRound(cx, top, cell, cell, cell >= 10 ? 2 : 1, color);
			else d.rect(cx, top, cell, cell, color);
			if (day === today) d.hline(cx, top + cell + 2, cell, color);
		}
		lastBottom = top + cell + 3;
		y += rowH;
	}
	// weekday letters under the last row
	if (letterH && cell >= 9) {
		const ly = lastBottom + 3 + sv.asc;
		for (let i = 0; i < n; i++) {
			const day = today - (n - 1 - i);
			d.text(x0 + i * (cell + GAP) + cell / 2, ly, 's', dayLetter(tmFromDayIdx(day).wday), { align: 'center', color });
		}
	}
}

// The "Habits" layout.
export function habits(ctx: LayoutCtx): string {
	const d = new Draw(ctx.family, ctx.dark);
	d.fill(0, 0, 400, 30);
	d.text(10, 21, 'sb', 'HABITS', { color: PAPER });
	d.text(392, 21, 's', dateShort(tmOf(ctx.nowLocal)), { align: 'right', color: PAPER });
	batteryIcon(d, ctx, 200, 4, 'center', PAPER);
	if (!ctx.habits?.some((h) => h.name)) {
		let y = centred(d, ctx.family, 132, 'mb', 'Add your habits', 360, 26);
		y = centred(d, ctx.family, y + 6, 's', 'Reading, the gym, water: things to do every day.');
		centred(d, ctx.family, y, 's', 'Add them in Settings on your dashboard.');
		return d.toString();
	}
	habitGrid(d, ctx, { x: 12, y: 44, w: 376, h: 248 }, { days: 21, letters: true });
	return d.toString();
}
