// Timetable: the school week, Monday to Friday, like the printed one on the fridge. One column a
// day, classes as blocks placed by time, today's column in black. On a weekend it shows next week.
import { Draw, INK, PAPER } from '../draw';
import { fontId, type Family, type Role } from '../fonts';
import { VMETRICS } from '../vmetrics';
import { batteryIcon } from '../batteryIcon';
import { dayAbbr, dayIdx, dayMonth, timeTextOf, tmFromDayIdx, type LayoutCtx } from '../context';
import { eventsOn } from '../school';

function vm(fam: Family, role: Role) {
	const v = VMETRICS[fontId(fam, role)] ?? VMETRICS[fontId('sans', role)];
	return { asc: v[0], desc: v[3], lh: v[4] };
}

export function timetable(ctx: LayoutCtx): string {
	const d = new Draw(ctx.family, ctx.dark);
	const fam = ctx.family;
	const today = dayIdx(ctx.nowLocal);
	const wd = tmFromDayIdx(today).wday; // 0 = Sunday
	const monday = wd === 6 ? today + 2 : wd === 0 ? today + 1 : today - (wd - 1);
	const days = [0, 1, 2, 3, 4].map((i) => monday + i);
	const cols = days.map((day) => eventsOn(ctx.events, day));

	d.fill(0, 0, 400, 30);
	d.text(10, 21, 'sb', monday > today ? 'NEXT WEEK' : 'THIS WEEK', { color: PAPER });
	d.text(392, 21, 's', `${dayMonth(tmFromDayIdx(monday))} - ${dayMonth(tmFromDayIdx(monday + 4))}`, { align: 'right', color: PAPER });
	batteryIcon(d, ctx, 200, 4, 'center', PAPER);

	// the hours the classes fill (8:30 to 3:30 or so), rounded out to the half hour
	let lo = Infinity, hi = -Infinity;
	for (const c of cols)
		for (const e of c.timed) {
			const s = ((e.startLocal % 86400) + 86400) % 86400;
			const en = e.endLocal ? s + (e.endLocal - e.startLocal) : s + 3000;
			lo = Math.min(lo, s);
			hi = Math.max(hi, Math.min(en, 86400));
		}
	if (!isFinite(lo)) {
		lo = 8.5 * 3600;
		hi = 15.5 * 3600;
	}
	lo = Math.floor(lo / 1800) * 1800;
	hi = Math.max(lo + 3600, Math.ceil(hi / 1800) * 1800);

	const GX = 34, GW = 400 - GX - 4; // grid
	const colW = GW / 5;
	const headY = 34, headH = 20;
	const anyAllDay = cols.some((c) => c.allDay.length);
	const adH = anyAllDay ? 15 : 0;
	const top = headY + headH + adH + 3, bottom = 296;
	const yOf = (s: number) => top + ((s - lo) / (hi - lo)) * (bottom - top);
	const sv = vm(fam, 's');

	// hour marks
	for (let s = Math.ceil(lo / 3600) * 3600; s <= hi; s += 3600) {
		const y = Math.round(yOf(s));
		d.text(GX - 4, y + sv.asc / 2 - 1, 's', String(Math.floor(s / 3600) % 24), { align: 'right' });
		d.dots(GX, y, GW, 4);
	}

	cols.forEach((c, i) => {
		const day = days[i];
		const x = Math.round(GX + i * colW + 2);
		const w = Math.round(colW - 4);
		const isToday = day === today;
		// day head
		if (isToday) d.fillRound(x, headY, w, headH, 4);
		else d.round(x, headY, w, headH, 4);
		d.text(x + w / 2, headY + 15, 'sb', `${dayAbbr(tmFromDayIdx(day).wday)} ${tmFromDayIdx(day).mday}`, { align: 'center', color: isToday ? PAPER : INK, maxW: w - 4 });
		// all-day line (exams, excursions)
		if (c.allDay.length) d.text(x + 2, headY + headH + sv.asc + 1, 's', c.allDay.map((e) => e.name ?? e.title).join(', '), { maxW: w - 4 });
		// classes; two at once (a class and a test, say) share the column side by side
		const span = (e: (typeof c.timed)[number]) => {
			const s = ((e.startLocal % 86400) + 86400) % 86400;
			return [s, e.endLocal ? s + (e.endLocal - e.startLocal) : s + 3000] as const;
		};
		const laneEnd = [-1, -1];
		const lanes = c.timed.map((e) => {
			const [s, en] = span(e);
			const l = s >= laneEnd[0] ? 0 : 1;
			laneEnd[l] = Math.max(laneEnd[l], en);
			return l;
		});
		const shared = c.timed.map((e, k) => {
			const [s, en] = span(e);
			return c.timed.some((o, j) => j !== k && span(o)[0] < en && span(o)[1] > s);
		});
		for (const [k, e] of c.timed.entries()) {
			const [s, en] = span(e);
			const bx = shared[k] ? x + (lanes[k] ? Math.ceil(w / 2) + 1 : 0) : x;
			const bw = shared[k] ? Math.floor(w / 2) - 1 : w;
			const y0 = Math.round(yOf(Math.max(lo, s))) + 1;
			const y1 = Math.round(yOf(Math.min(hi, en))) - 1;
			const h = y1 - y0;
			if (h < 6) continue;
			const fg = isToday ? PAPER : INK;
			if (isToday) d.fillRound(bx, y0, bw, h, 3);
			else d.fillRound(bx, y0, bw, h, 3, PAPER).round(bx, y0, bw, h, 3);
			const name = e.name ?? e.title;
			if (h >= sv.asc + sv.desc + 2) d.text(bx + 3, y0 + Math.min(h - sv.desc - 1, sv.asc + 2), 's', name, { color: fg, maxW: bw - 6 });
			if (e.room && h >= 2 * sv.lh + 2) {
				const ry = y0 + sv.asc + 2 + sv.lh;
				if (e.moved) {
					d.fill(bx + 2, ry - sv.asc - 1, bw - 4, sv.lh, fg);
					d.text(bx + 4, ry, 's', e.room, { color: isToday ? INK : PAPER, maxW: bw - 8 });
				} else d.text(bx + 3, ry, 's', e.room, { color: fg, maxW: bw - 6 });
			}
		}
	});
	// now line on today
	const nowS = ((ctx.nowLocal % 86400) + 86400) % 86400;
	const ti = days.indexOf(today);
	if (ti >= 0 && nowS > lo && nowS < hi) {
		const y = Math.round(yOf(nowS));
		const x = Math.round(GX + ti * colW);
		d.fill(x - 2, y - 1, colW + 2, 3, INK);
		d.fill(x - 2, y, colW + 2, 1, PAPER);
	}
	return d.toString();
}
