// Reminders: bin day and other things that repeat (src/lib/eink/reminders.ts).
//   - reminders(): the ready-made layout, today's big, the next two weeks listed under it
//   - reminderList(): the same list in any box (the layout builder's Reminders widget)
import { Draw, INK, PAPER, type Color } from '../draw';
import { fontId, type Family, type Role } from '../fonts';
import { measure, wrapText } from '../measure';
import { VMETRICS } from '../vmetrics';
import { batteryIcon } from '../batteryIcon';
import { dateShort, dayIdx, tmFromDayIdx, tmOf, type LayoutCtx } from '../context';
import { upcoming } from '../reminders';
import { tr } from '../i18n';

function vm(fam: Family, role: Role, scale = 1) {
	const v = VMETRICS[fontId(fam, role)] ?? VMETRICS[fontId('sans', role)];
	return { asc: v[0] * scale, desc: v[3] * scale, lh: v[4] * scale };
}

// "Today", "Tomorrow", "Wed 18 Nov"
function whenText(day: number, today: number): string {
	if (day === today) return 'Today';
	if (day === today + 1) return 'Tomorrow';
	return dateShort(tmFromDayIdx(day));
}

type Box = { x: number; y: number; w: number; h: number };

// The list: one row per day ("Tomorrow  Bins out, Recycling"), as many days as fit.
export function reminderList(d: Draw, ctx: LayoutCtx, box: Box, o: { days?: number; color?: Color; bigToday?: boolean } = {}) {
	const fam = ctx.family;
	const color = o.color ?? INK;
	const today = dayIdx(ctx.nowLocal);
	const items = upcoming(ctx.reminders, today, o.days ?? 14);
	const sv = vm(fam, 's');
	let y = box.y;
	const bottom = box.y + box.h;
	if (!ctx.reminders?.some((r) => r.text)) {
		d.text(box.x + box.w / 2, box.y + box.h / 2, 's', 'No reminders', { align: 'center', color, maxW: box.w });
		return;
	}
	if (!items.length) {
		d.text(box.x + box.w / 2, box.y + box.h / 2, 's', 'Nothing coming up', { align: 'center', color, maxW: box.w });
		return;
	}
	// group by day
	const byDay: { day: number; texts: string[] }[] = [];
	for (const it of items) {
		const last = byDay[byDay.length - 1];
		if (last && last.day === it.day) last.texts.push(it.text);
		else byDay.push({ day: it.day, texts: [it.text] });
	}
	let rows = byDay;
	if (o.bigToday && rows[0].day === today) {
		// today's reminders as big as they fit, in a dark box
		const texts = rows[0].texts.join(', ');
		const faces: [Role, number][] = [['mb', 2], ['mb', 1], ['m', 1], ['sb', 1]];
		const restRoom = rows.length > 1 ? Math.min(box.h * 0.5, (rows.length - 1) * (sv.lh + 6)) : 0;
		const room = box.h - restRoom - sv.lh - 14;
		let pick = { role: 'sb' as Role, scale: 1, lines: [texts], v: vm(fam, 'sb') };
		for (const [role, scale] of faces) {
			const lines = wrapText(fam, role, texts, box.w - 30, scale); // a little slack: the screen measures big text slightly wider
			const v = vm(fam, role, scale);
			if (lines.length <= 3 && (lines.length - 1) * v.lh + v.asc + v.desc <= room) {
				pick = { role, scale, lines, v };
				break;
			}
		}
		const h = sv.lh + 4 + (pick.lines.length - 1) * pick.v.lh + pick.v.asc + pick.v.desc + 16;
		d.fillRound(box.x, y, box.w, h, 8, color);
		const inv: Color = color === INK ? PAPER : INK;
		d.text(box.x + 10, y + 6 + sv.asc, 'sb', 'Today', { color: inv });
		pick.lines.forEach((ln, i) => d.text(box.x + 10, y + sv.lh + 10 + pick.v.asc + i * pick.v.lh, pick.role, ln, { scale: pick.scale, color: inv, maxW: box.w - 20 }));
		y += h + 10;
		rows = rows.slice(1);
	}
	const labelW = Math.max(...rows.map((r) => measure(fam, 'sb', tr(whenText(r.day, today))).w), 0) + 12;
	for (const r of rows) {
		const lines = wrapText(fam, 's', r.texts.join(', '), Math.max(40, box.w - labelW)).slice(0, 2);
		const need = (lines.length - 1) * sv.lh + sv.asc + sv.desc;
		if (y + need > bottom) break;
		d.text(box.x, y + sv.asc, 'sb', whenText(r.day, today), { color, maxW: labelW - 6 });
		lines.forEach((ln, i) => d.text(box.x + labelW, y + sv.asc + i * sv.lh, 's', ln, { color, maxW: box.w - labelW }));
		y += need + 6;
		if (y + 4 < bottom) d.dots(box.x, y - 3, box.w, 4, color);
	}
}

// The "Reminders" layout.
export function reminders(ctx: LayoutCtx): string {
	const d = new Draw(ctx.family, ctx.dark);
	d.fill(0, 0, 400, 30);
	d.text(10, 21, 'sb', 'REMINDERS', { color: PAPER });
	d.text(392, 21, 's', dateShort(tmOf(ctx.nowLocal)), { align: 'right', color: PAPER });
	batteryIcon(d, ctx, 200, 4, 'center', PAPER);
	if (!ctx.reminders?.some((r) => r.text)) {
		d.text(200, 140, 'mb', 'Add your reminders', { align: 'center' });
		d.text(200, 168, 's', 'Bin day, recycling, rent: things that repeat.', { align: 'center' });
		d.text(200, 186, 's', 'Open Customize display on your dashboard.', { align: 'center' });
		return d.toString();
	}
	reminderList(d, ctx, { x: 12, y: 42, w: 376, h: 250 }, { bigToday: true });
	return d.toString();
}
