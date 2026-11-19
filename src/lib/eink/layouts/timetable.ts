// Timetable: the school week, Monday to Friday, like the printed one on the fridge. One column a
// day, classes as blocks placed by time, today's column in black. On a weekend it shows next week.
import { Draw, INK, PAPER } from '../draw';
import { fontId, type Family, type Role } from '../fonts';
import { VMETRICS } from '../vmetrics';
import { batteryIcon } from '../batteryIcon';
import { dayAbbr, dayIdx, dayMonth, timeTextOf, tmFromDayIdx, type LayoutCtx } from '../context';
import { eventsOn } from '../school';
import { measure, wrapText } from '../measure';

function vm(fam: Family, role: Role) {
	const v = VMETRICS[fontId(fam, role)] ?? VMETRICS[fontId('sans', role)];
	return { asc: v[0], desc: v[3], lh: v[4] };
}

// Short forms for the narrow columns: "Chemistry" -> "Chem", "Building & Construction" -> "B&C".
const SHORT: [RegExp, string][] = [
	[/^chemistry$/i, 'Chem'], [/^physics$/i, 'Phys'], [/^biology$/i, 'Bio'], [/^human biology$/i, 'Hum Bio'], [/^psychology$/i, 'Psych'],
	[/^geography$/i, 'Geog'], [/^modern history$/i, 'History'], [/^ancient history$/i, 'Anc Hist'], [/^economics$/i, 'Econ'],
	[/^(mathematics|maths) methods$/i, 'Methods'], [/^(mathematics|maths) applications$/i, 'Apps'], [/^(mathematics|maths) specialist$/i, 'Spec'],
	[/^(mathematics|maths) essential$/i, 'Ess Maths'], [/^mathematics$/i, 'Maths'], [/^english$/i, 'Eng'], [/^literature$/i, 'Lit'],
	[/^building (&|and) construction$/i, 'B&C'], [/^engineering studies$/i, 'Eng Stud'], [/^computer science$/i, 'Comp Sci'],
	[/^physical education( studies)?$/i, 'PE'], [/^health (and|&) pe$/i, 'HPE'], [/^accounting and finance$/i, 'Acc'],
	[/^business management and enterprise$/i, 'BME'], [/^politics and law$/i, 'Pol & Law'], [/^visual arts$/i, 'Art'],
	[/^media production and analysis$/i, 'Media'], [/^materials design and technology$/i, 'MDT'], [/^applied information technology$/i, 'AIT'],
	[/^food science and technology$/i, 'Food'], [/^outdoor education$/i, 'Outdoor Ed'], [/^japanese$/i, 'Jap'],
];
function shortName(name: string, fits: (t: string) => boolean): string {
	for (const [re, s] of SHORT) if (re.test(name.trim()) && fits(s)) return s;
	// initials for several words ("Children, Family and the Community" -> "CFC"), else the first word
	const words = name.split(/[\s,&]+/).filter((w) => w && !/^(and|the|of)$/i.test(w));
	if (words.length >= 3) {
		const ini = words.map((w) => w[0].toUpperCase()).join('');
		if (fits(ini)) return ini;
	}
	if (words.length > 1 && fits(words[0])) return words[0];
	return name;
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
	// Classes (events with a room) set the hours when there are any, so an evening event doesn't
	// squash the school day; anything outside the hours isn't drawn.
	const hasRooms = cols.some((c) => c.timed.some((e) => e.room));
	let lo = Infinity, hi = -Infinity;
	for (const c of cols)
		for (const e of c.timed) {
			if (hasRooms && !e.room) continue;
			const s0 = ((e.startLocal % 86400) + 86400) % 86400;
			if (!hasRooms && (s0 < 6 * 3600 || s0 > 20 * 3600)) continue;
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
	hi = Math.min(lo + 12 * 3600, Math.max(lo + 3600, Math.ceil(hi / 1800) * 1800));
	for (const c of cols) c.timed = c.timed.filter((e) => {
		const s = ((e.startLocal % 86400) + 86400) % 86400;
		return s >= lo - 600 && s < hi;
	});

	const GX = 34, GW = 400 - GX - 4; // grid
	const colW = GW / 5;
	const headY = 34, headH = 20;
	// all-day events: one that covers every day goes across the top once, the rest per day
	const keyOf = (e: { title: string; startLocal: number }) => e.title + '|' + e.startLocal;
	const wholeWeek = cols[0].allDay.filter((e) => cols.every((c) => c.allDay.some((o) => keyOf(o) === keyOf(e))));
	const wk = new Set(wholeWeek.map(keyOf));
	for (const c of cols) c.allDay = c.allDay.filter((e) => !wk.has(keyOf(e)));
	const anyAllDay = wholeWeek.length > 0 || cols.some((c) => c.allDay.length);
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
		if (i === 0 && wholeWeek.length) {
			const t = wholeWeek.map((e) => e.name ?? e.title).join(', ');
			d.text(GX + GW / 2, headY + headH + sv.asc + 1, 's', t, { align: 'center', maxW: GW - 8 });
		}
		if (!wholeWeek.length && c.allDay.length) d.text(x + 2, headY + headH + sv.asc + 1, 's', c.allDay.map((e) => e.name ?? e.title).join(', '), { maxW: w - 4 });
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
			let name = e.name ?? e.title;
			if (measure(fam, 's', name).w > bw - 6) name = shortName(name, (t) => measure(fam, 's', t).w <= bw - 6);
			// the name, on two lines when it doesn't fit on one and there's room (then no room number)
			const fits = measure(fam, 's', name).w <= bw - 6;
			const step = sv.asc + sv.desc + 1; // tight line spacing inside a block
			const twoLines = h >= 2 * step + 2;
			if (!fits && twoLines) {
				const lines = wrapText(fam, 's', name, bw - 6).slice(0, 2);
				lines.forEach((ln, li) => d.text(bx + 3, y0 + sv.asc + 2 + li * step, 's', ln, { color: fg, maxW: bw - 6 }));
			} else if (h >= sv.asc + sv.desc + 2) d.text(bx + 3, y0 + Math.min(h - sv.desc - 1, sv.asc + 2), 's', name, { color: fg, maxW: bw - 6 });
			if (fits && e.room && twoLines) {
				const ry = y0 + sv.asc + 2 + step;
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
	if (ti >= 0 && nowS > lo && nowS < hi && (ctx.refreshSec ?? 86400) < 86400) {
		const y = Math.round(yOf(nowS));
		const x = Math.round(GX + ti * colW);
		d.fill(x - 2, y - 1, colW + 2, 3, INK);
		d.fill(x - 2, y, colW + 2, 1, PAPER);
	}
	return d.toString();
}
