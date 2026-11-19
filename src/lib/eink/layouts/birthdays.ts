// The Birthdays widget: the next few birthdays, soonest first ("Tomorrow  Mum").
import { Draw, INK, PAPER, type Color } from '../draw';
import { fontId, type Family, type Role } from '../fonts';
import { measure } from '../measure';
import { VMETRICS } from '../vmetrics';
import { dateShort, dayIdx, tmFromDayIdx, type LayoutCtx } from '../context';
import { tr } from '../i18n';

type Box = { x: number; y: number; w: number; h: number };
function vm(fam: Family, role: Role) {
	const v = VMETRICS[fontId(fam, role)] ?? VMETRICS[fontId('sans', role)];
	return { asc: v[0], desc: v[3], lh: v[4] };
}
const whenText = (day: number, today: number) => (day === today ? 'Today' : day === today + 1 ? 'Tomorrow' : dateShort(tmFromDayIdx(day)));

export function birthdayList(d: Draw, ctx: LayoutCtx, box: Box, o: { count?: number; days?: number; label?: boolean; color?: Color } = {}) {
	const fam = ctx.family;
	const color = o.color ?? INK;
	const today = dayIdx(ctx.nowLocal);
	const days = o.days ?? 31;
	const list = (ctx.birthdays ?? []).filter((b) => {
		const day = dayIdx(b.dayLocal);
		return day >= today && day < today + days;
	});
	const sv = vm(fam, 's');
	let y = box.y;
	if (o.label) {
		d.text(box.x, y + sv.asc, 'sb', 'Birthdays', { color, maxW: box.w });
		y += sv.lh + 4;
	}
	if (!list.length) {
		d.text(box.x + box.w / 2, y + (box.y + box.h - y) / 2 + sv.asc / 2, 's', days > 31 ? 'No birthdays coming up' : 'No birthdays this month', { align: 'center', color, maxW: box.w });
		return;
	}
	const rows = list.slice(0, o.count ?? 4);
	const labelW = Math.max(...rows.map((b) => measure(fam, 'sb', tr(whenText(dayIdx(b.dayLocal), today))).w)) + 12;
	for (const b of rows) {
		const day = dayIdx(b.dayLocal);
		if (y + sv.asc + sv.desc > box.y + box.h) break;
		// today's is in a dark band
		if (day === today) {
			d.fillRound(box.x - 4, y - 2, box.w + 8, sv.lh + 4, 5, color);
			const inv: Color = color === INK ? PAPER : INK;
			d.text(box.x, y + sv.asc, 'sb', whenText(day, today), { color: inv, maxW: labelW - 6 });
			d.text(box.x + labelW, y + sv.asc, 'sb', b.name, { color: inv, maxW: box.w - labelW });
		} else {
			d.text(box.x, y + sv.asc, 'sb', whenText(day, today), { color, maxW: labelW - 6 });
			d.text(box.x + labelW, y + sv.asc, 's', b.name, { color, maxW: box.w - labelW });
		}
		y += sv.lh + 6;
	}
}
