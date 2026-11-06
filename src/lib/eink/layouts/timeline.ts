// Timeline: today as a vertical ruler with events drawn as blocks at the right time and the
// right length. The visible hours adapt to the day (a day that runs 9-5 fills the screen, a
// day with something at 5 past midnight shows the whole day).
//
// Once a day (the default) the screen is static: no "now" bar, no countdown, because nothing
// would keep them up to date. If the calendar is set to wake more often, it shows a bar for
// "now" and a countdown, and the server (timelineSleep below) only wakes it while the bar
// is actually moving across the timeline: from the first visible hour to the last, then
// it sleeps until midnight.
import { Draw, PAPER } from '../draw';
import { firstThatFits, measure } from '../measure';
import { dayIdx, dayShort, monthShort, round0, tmOf, type CalEvent, type LayoutCtx } from '../context';
import { batteryIcon } from '../batteryIcon';
import { dateShort } from '../context';

const DAY = 86400;
const TOLERANCE_H = 10 / 60; // a wake this much early still counts as on time

interface TEv {
	title: string;
	s: number; // hours since local midnight
	e: number;
}

// Today's events, split into timed (hours since midnight, clipped to the day) and all-day.
export function dayEvents(events: CalEvent[], nowLocal: number): { timed: TEv[]; allDay: CalEvent[] } {
	const today = dayIdx(nowLocal);
	const day0 = today * DAY;
	const timed: TEv[] = [];
	const allDay: CalEvent[] = [];
	for (const ev of events) {
		if (ev.allDay) {
			const first = dayIdx(ev.startLocal);
			const lastEx = ev.endLocal && ev.endLocal > ev.startLocal ? dayIdx(ev.endLocal) : first + 1;
			if (first <= today && today < lastEx) allDay.push(ev);
			continue;
		}
		const endL = ev.endLocal && ev.endLocal > ev.startLocal ? ev.endLocal : ev.startLocal + 1800;
		if (endL <= day0 || ev.startLocal >= day0 + DAY) continue;
		timed.push({ title: ev.title, s: Math.max(0, (ev.startLocal - day0) / 3600), e: Math.min(24, (endL - day0) / 3600) });
	}
	timed.sort((a, b) => a.s - b.s || a.e - b.e);
	return { timed, allDay };
}

// The hours shown, whole numbers. Starts about an hour before the first event, but no later than
// 8am (so a day that begins at 10 still opens at 8), ends on the hour the last event finishes,
// and is never shorter than 8 hours.
export function windowOf(timed: TEv[]): { start: number; end: number } | null {
	if (!timed.length) return null;
	const first = timed[0].s;
	const last = Math.max(...timed.map((t) => t.e));
	let start = first < 11 ? Math.min(Math.floor(first) - 1, 8) : Math.floor(first) - 2;
	start = Math.max(0, start);
	let end = Math.min(24, Math.ceil(last));
	if (end - start < 8) {
		end = Math.min(24, start + 8);
		if (end - start < 8) start = end - 8;
	}
	return { start, end };
}

// Seconds the calendar should sleep after this refresh.
//   once a day: until local midnight
//   more often: wake at the first visible hour, then every `interval` hours until the last
//   visible hour (the final one draws the timeline without the bar), then until midnight.
// A wake up to 10 minutes early counts as on time, so a slightly fast timer doesn't cause an
// extra wake-up.
export function timelineSleep(nowLocal: number, events: CalEvent[], intervalSec: number): number {
	const s = ((nowLocal % DAY) + DAY) % DAY;
	const toMidnight = DAY - s;
	if (intervalSec >= DAY) return Math.max(30, toMidnight);
	const n = Math.max(1, Math.round(intervalSec / 3600));
	const w = windowOf(dayEvents(events, nowLocal).timed);
	if (!w) return Math.max(30, toMidnight);
	const times: number[] = [];
	for (let h = w.start; h < w.end; h += n) times.push(h * 3600);
	times.push(w.end * 3600);
	for (const t of times) if (t > s + TOLERANCE_H * 3600) return Math.max(30, Math.min(t - s, toMidnight));
	return Math.max(30, toMidnight);
}

// Up to `maxLines` lines of a title that fit `maxW`; the last line is left long so the
// firmware cuts it with "..".
function wrapLines(fam: LayoutCtx['family'], role: 's' | 'sb', text: string, maxW: number, maxLines = 2): string[] {
	const words = text.split(' ').filter(Boolean);
	const lines: string[] = [];
	let cur = '';
	for (const w of words) {
		const t = cur ? cur + ' ' + w : w;
		if (!cur || measure(fam, role, t).w <= maxW) cur = t;
		else {
			lines.push(cur);
			cur = w;
		}
	}
	if (cur) lines.push(cur);
	if (lines.length > maxLines) lines.splice(maxLines - 1, lines.length, lines.slice(maxLines - 1).join(' '));
	return lines;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
function hhmm(h: number): string {
	const m = Math.round(h * 60);
	return `${pad2(Math.floor(m / 60) % 24)}:${pad2(m % 60)}`;
}
function untilText(mins: number): string {
	if (mins < 1) return 'now';
	if (mins < 60) return `in ${mins} min`;
	const h = Math.floor(mins / 60);
	const m = mins % 60;
	return m ? `in ${h}h ${m}m` : `in ${h} h`;
}

export function timeline(ctx: LayoutCtx): string {
	const d = new Draw(ctx.family, ctx.dark);
	const fam = ctx.family;
	const now = tmOf(ctx.nowLocal);
	const nowH = (((ctx.nowLocal % DAY) + DAY) % DAY) / 3600;
	const live = (ctx.refreshSec ?? DAY) < DAY; // wakes more than once a day: bar + countdown

	d.fill(0, 0, 400, 30);
	d.text(10, 21, 'sb', 'TODAY', { color: PAPER });
	d.text(392, 21, 's', dateShort(now), { align: 'right', color: PAPER });
	batteryIcon(d, ctx, 200, 4, 'center', PAPER);

	const { timed, allDay } = dayEvents(ctx.events, ctx.nowLocal);
	const w = windowOf(timed) ?? { start: 8, end: 17 };
	let yTop = 42;
	if (allDay.length) {
		d.text(8, 47, 's', 'All day: ' + allDay.map((e) => e.title).join(', '), { maxW: 384 });
		yTop = 66;
	}
	const yBot = 284;
	const hourPx = (yBot - yTop) / (w.end - w.start);
	const yOf = (h: number) => yTop + (h - w.start) * hourPx;

	// hour ruler
	const step = hourPx >= 15 ? 1 : hourPx * 2 >= 15 ? 2 : hourPx * 3 >= 15 ? 3 : 4;
	const labelW = measure(fam, 's', '00:00').right;
	const lineX = 8 + labelW + 6;
	const blockX = lineX + 4;
	const blockR = 262;
	for (let h = w.start; h <= w.end; h++) {
		const y = Math.round(yOf(h));
		d.dots(lineX, y, blockR - lineX, 4);
		if ((h - w.start) % step === 0) d.text(8, y + 4, 's', `${pad2(h % 24)}:00`);
	}

	// the bar for "now" (only while it moves across the timeline)
	const barOn = live && timed.length > 0 && nowH >= w.start - TOLERANCE_H && nowH < w.end - TOLERANCE_H;
	const barY = barOn ? Math.round(yOf(Math.max(nowH, w.start))) : -99;

	// events: overlapping ones share the width side by side (up to 3 lanes)
	const MIN_H = 18;
	const items = timed.map((t) => {
		const top = yOf(t.s);
		let bottom = Math.max(top + MIN_H, yOf(t.e) - 1);
		let topY = top;
		if (bottom > 292) {
			bottom = 292; // an event at the very end of the day stays on the screen
			topY = Math.min(top, bottom - MIN_H);
		}
		return { t, top: topY, bottom, lane: 0, lanes: 1 };
	});
	let cluster: typeof items = [];
	let clusterBottom = -1;
	const flush = () => {
		if (!cluster.length) return;
		const laneBottoms: number[] = [];
		for (const it of cluster) {
			let l = laneBottoms.findIndex((b) => b <= it.top);
			if (l < 0) l = laneBottoms.length < 3 ? laneBottoms.length : laneBottoms.indexOf(Math.min(...laneBottoms));
			laneBottoms[l] = it.bottom;
			it.lane = l;
		}
		for (const it of cluster) it.lanes = laneBottoms.length;
		cluster = [];
	};
	for (const it of items) {
		if (cluster.length && it.top >= clusterBottom) flush();
		cluster.push(it);
		clusterBottom = Math.max(clusterBottom, it.bottom);
	}
	flush();
	const total = blockR - blockX;
	const blocked: [number, number][] = []; // blocks too short to fit a title and the bar: the bar skips them
	for (const it of items) {
		const gap = 3;
		const bw = Math.floor((total - gap * (it.lanes - 1)) / it.lanes);
		const x = blockX + it.lane * (bw + gap);
		const y = Math.round(it.top) + 1;
		const h = Math.round(it.bottom - it.top) - 1;
		d.fillRound(x, y, bw, h, 4);
		// keep the title clear of the "now" bar when it crosses this block
		let base = y + 14;
		if (barOn && barY >= y && barY <= y + h && barY + 3 >= base - 13 && barY - 3 <= base + 4) {
			if (barY + 3 + 15 + 3 <= y + h) base = barY + 3 + 15; // below the bar
			else if (barY - 4 - 3 - 13 >= y) base = barY - 4 - 3; // above it
			else blocked.push([x, x + bw]);
		}
		d.text(x + 6, base, 'sb', it.t.title, { color: PAPER, maxW: bw - 10 });
	}

	// the bar sits on top of the blocks, with a paper edge so it also shows on black
	if (barOn) {
		const x0 = lineX;
		const x1 = blockR + 10;
		let cur = x0;
		const seg = (a: number, b: number) => {
			if (b <= a) return;
			d.fill(a, barY - 2, b - a, 1, PAPER);
			d.fill(a, barY + 2, b - a, 1, PAPER);
			d.fill(a, barY - 1, b - a, 3);
		};
		for (const [bx0, bx1] of blocked.sort((p, q) => p[0] - q[0])) {
			seg(cur, bx0 - 1);
			cur = Math.max(cur, bx1 + 1);
		}
		seg(cur, x1);
		d.disc(x0 + 1, barY, 4);
	}

	// right column
	d.vline(268, yTop - 6, 290 - (yTop - 6));
	const px = 276;
	const colW = 392 - px;
	if (!timed.length) {
		d.text(px, 62, 's', 'TODAY');
		d.text(px, 94, 'mb', 'Free day', { maxW: colW });
	} else if (!live) {
		d.text(px, 62, 's', 'TODAY');
		d.text(px, 94, 'mb', `${timed.length} ${timed.length === 1 ? 'event' : 'events'}`, { maxW: colW });
		d.text(px, 116, 's', `${hhmm(timed[0].s)} - ${hhmm(Math.max(...timed.map((t) => t.e)))}`, { maxW: colW });
	} else {
		const cur = timed.find((t) => t.s <= nowH && nowH < t.e);
		const nxt = timed.find((t) => t.s > nowH);
		if (cur) {
			d.text(px, 62, 's', 'NOW');
			let y = 88;
			for (const ln of wrapLines(fam, 'sb', cur.title, colW)) {
				d.text(px, y, 'sb', ln, { maxW: colW });
				y += 18;
			}
			d.text(px, y + 4, 's', firstThatFits(fam, 's', [`until ${hhmm(cur.e)}`, `to ${hhmm(cur.e)}`], colW));
			if (nxt) d.text(px, y + 40, 's', firstThatFits(fam, 's', [`Next ${hhmm(nxt.s)}`, hhmm(nxt.s)], colW));
		} else if (nxt) {
			d.text(px, 62, 's', 'NEXT');
			d.text(px, 94, 'mb', hhmm(nxt.s), { maxW: colW });
			let y = 118;
			for (const ln of wrapLines(fam, 's', nxt.title, colW)) {
				d.text(px, y, 's', ln, { maxW: colW });
				y += 18;
			}
			d.text(px, y + 4, 's', barOn ? untilText(Math.round((nxt.s - nowH) * 60)) : `at ${hhmm(nxt.s)}`, { maxW: colW });
		} else {
			d.text(px, 62, 's', 'TODAY');
			d.text(px, 94, 'mb', 'All done', { maxW: colW });
		}
	}

	d.hline(276, 236, 116);
	const hi = ctx.weather ? round0(ctx.weather.high) : '';
	const lo = ctx.weather ? round0(ctx.weather.low) : '';
	if (ctx.weather) {
		d.text(px, 256, 's', firstThatFits(fam, 's', [`High ${hi}C`, `H ${hi}C`], colW));
		d.text(px, 276, 's', firstThatFits(fam, 's', [`Low ${lo}C`, `L ${lo}C`], colW));
	}
	return d.toString();
}
