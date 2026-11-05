// Draws a custom layout: every widget of the person's design, in order, into one draw list.
// Text always fits its box (it shrinks or wraps rather than spilling out), so whatever size
// someone drags a widget to, the result is a valid, tidy screen. Used by the server for the
// real display and by the editor for the live preview, so they always match.
import { Draw, PAPER, INK, type Align, type Color } from '../draw';
import { fontId, type Family, type Role } from '../fonts';
import { measure, wrapText } from '../measure';
import { VMETRICS } from '../vmetrics';
import { CORNER, CORNER_BYTES } from '../image';
import { batteryIcon } from '../batteryIcon';
import { moonBits } from '../moonImage';
import { weatherBits, wxKind, wxLabel } from '../weatherIcon';
import { moonInfo, sunTimes } from '../astro';
import { quoteForDay } from '../../../data/quotes';
import {
	dayIdx, dayShort, daysInMonth, DAY_NAMES, evTimeStr, MONTH_NAMES, monthName, monthShort, round0, tmOf, type CalEvent, type LayoutCtx,
} from '../context';
import { withDefaults, type CustomLayout, type Widget } from './model';

interface Env {
	d: Draw;
	ctx: LayoutCtx;
	fam: Family;
}
interface Face {
	role: Role;
	scale: number;
}
interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}
type Opts = Record<string, string | boolean | number>;

// The sizes text can have, smallest to biggest.
const FACES: Record<string, Face> = {
	s: { role: 's', scale: 1 },
	m: { role: 'm', scale: 1 },
	l: { role: 'bb', scale: 1 },
	xl: { role: 'bb', scale: 2 },
	xxl: { role: 'bb', scale: 3 },
	xxxl: { role: 'bb', scale: 4 },
};
const ORDER = ['xxxl', 'xxl', 'xl', 'l', 'm', 's']; // biggest first
const facesFor = (size: unknown): string[] => {
	const i = ORDER.indexOf(String(size));
	return i < 0 ? ORDER : ORDER.slice(i);
};
const withBold = (f: Face, bold: boolean): Face => (!bold ? f : f.role === 's' ? { role: 'sb', scale: 1 } : f.role === 'm' ? { role: 'mb', scale: 1 } : f);

function vm(env: Env, f: Face) {
	const v = VMETRICS[fontId(env.fam, f.role)] ?? VMETRICS[fontId('sans', f.role)];
	return { asc: v[0] * f.scale, cap: v[1] * f.scale, desc: v[3] * f.scale, lh: v[4] * f.scale };
}
const blockH = (env: Env, f: Face, lines: number) => {
	const v = vm(env, f);
	return (lines - 1) * v.lh + v.asc + v.desc;
};

// The biggest allowed size at which the text fits the box (wrapping where it has to).
function fitText(env: Env, text: string, w: number, h: number, sizes: string[], bold: boolean) {
	let last: { face: Face; lines: string[] } | null = null;
	for (const key of sizes) {
		const face = withBold(FACES[key], bold);
		const lines = wrapText(env.fam, face.role, text, w, face.scale);
		last = { face, lines };
		if (lines.length && lines.every((l) => measure(env.fam, face.role, l, face.scale).w <= w) && blockH(env, face, lines.length) <= h) return last;
	}
	// nothing fit: use the smallest size and keep only the lines that fit the height
	const face = last!.face;
	const v = vm(env, face);
	const max = Math.max(1, Math.floor((h - v.asc - v.desc) / v.lh) + 1);
	return { face, lines: last!.lines.slice(0, max) };
}

function drawLines(env: Env, box: Box, lines: string[], face: Face, align: unknown, valign: unknown, color: Color) {
	const v = vm(env, face);
	const bh = blockH(env, face, lines.length);
	const top = valign === 'top' ? box.y : valign === 'bottom' ? box.y + box.h - bh : box.y + (box.h - bh) / 2;
	const a: Align = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left';
	const x = a === 'center' ? box.x + box.w / 2 : a === 'right' ? box.x + box.w : box.x;
	lines.forEach((ln, i) => env.d.text(x, top + v.asc + i * v.lh, face.role, ln, { align: a, scale: face.scale, color, maxW: box.w }));
}

// Draws the box's own black fill / outline (if chosen) and returns the area left for content.
function chrome(env: Env, w: Widget, o: Opts): { inner: Box; color: Color } {
	let color: Color = INK;
	if (o.invert === true) {
		env.d.fillRound(w.x, w.y, w.w, w.h, 3, INK);
		color = PAPER;
	}
	if (o.light === true) color = PAPER;
	if (o.border === true) {
		env.d.round(w.x, w.y, w.w, w.h, 3, INK);
		if (o.invert !== true) env.d.round(w.x + 1, w.y + 1, w.w - 2, w.h - 2, 2, INK);
	}
	const pad = o.invert === true || o.border === true ? 5 : 0;
	return { inner: { x: w.x + pad, y: w.y + pad, w: Math.max(1, w.w - 2 * pad), h: Math.max(1, w.h - 2 * pad) }, color };
}

function textWidget(env: Env, w: Widget, o: Opts, text: string) {
	const { inner, color } = chrome(env, w, o);
	const fit = fitText(env, text, inner.w, inner.h, facesFor(o.size), o.bold === true);
	drawLines(env, inner, fit.lines, fit.face, o.align, o.valign ?? 'middle', color);
}

// ---- events ----
function liveEvents(ctx: LayoutCtx, todayOnly = false): CalEvent[] {
	const today = dayIdx(ctx.nowLocal);
	return ctx.events.filter((e) => {
		const day = dayIdx(e.startLocal);
		if (todayOnly && day !== today) return false;
		if (day < today) return false;
		if (day > today) return true;
		const end = e.endLocal ?? e.startLocal + 1800;
		return e.allDay || end >= ctx.nowLocal;
	});
}

function whenText(ctx: LayoutCtx, e: CalEvent, mode: string): string {
	if (mode === 'none') return '';
	const today = dayIdx(ctx.nowLocal);
	const day = dayIdx(e.startLocal);
	if (mode === 'time' || day === today) return evTimeStr(e);
	const t = tmOf(e.startLocal);
	return e.allDay ? dayShort(t) : `${dayShort(t)} ${evTimeStr(e)}`;
}

function eventsWidget(env: Env, w: Widget, o: Opts) {
	const face = o.size === 'm' ? FACES.m : FACES.s;
	const v = vm(env, face);
	const pitch = v.lh + 2;
	const rows = Math.max(1, Math.floor((w.h - v.asc - v.desc) / pitch) + 1);
	const list = liveEvents(env.ctx, o.today === true).slice(0, rows);
	if (!list.length) {
		env.d.text(w.x, w.y + v.asc, face.role, o.today === true ? 'Nothing on today' : 'No upcoming events', { scale: face.scale, maxW: w.w });
		return;
	}
	const mode = String(o.when);
	const whens = list.map((e) => whenText(env.ctx, e, mode));
	const boldFace = withBold(face, true);
	const whenW = Math.max(0, ...whens.map((s) => measure(env.fam, boldFace.role, s).w));
	const gap = whenW ? 10 : 0;
	list.forEach((e, i) => {
		const base = w.y + v.asc + i * pitch;
		if (whens[i]) env.d.text(w.x, base, boldFace.role, whens[i], { maxW: w.w });
		env.d.text(w.x + whenW + gap, base, face.role, e.title, { maxW: Math.max(10, w.w - whenW - gap) });
		if (o.dots === true && i < list.length - 1) env.d.dots(w.x, base + v.desc + 2, w.w, 4);
	});
}

function nextEventWidget(env: Env, w: Widget, o: Opts) {
	const { inner, color } = chrome(env, w, o);
	const ev = liveEvents(env.ctx)[0];
	const small = withBold(FACES.s, true);
	const med = FACES.m;
	if (!ev) {
		drawLines(env, inner, ['No upcoming events'], FACES.s, o.align, 'middle', color);
		return;
	}
	const sv = vm(env, small);
	const mv = vm(env, med);
	let top = inner.y;
	let bottom = inner.y + inner.h;
	if (o.label === true) {
		env.d.text(o.align === 'center' ? inner.x + inner.w / 2 : o.align === 'right' ? inner.x + inner.w : inner.x, top + sv.asc, small.role, 'Next up', {
			align: o.align === 'center' ? 'center' : o.align === 'right' ? 'right' : 'left',
			color,
		});
		top += sv.lh;
	}
	const today = dayIdx(env.ctx.nowLocal);
	const day = dayIdx(ev.startLocal);
	const t = tmOf(ev.startLocal);
	const dayWord = day === today ? 'Today' : day === today + 1 ? 'Tomorrow' : `${dayShort(t)} ${t.mday} ${monthShort(t)}`;
	const whenLine = ev.allDay ? `${dayWord}, all day` : `${dayWord}, ${evTimeStr(ev)}`;
	if (bottom - top > mv.lh + 30) {
		const wv = mv.asc + mv.desc;
		drawLines(env, { x: inner.x, y: bottom - wv, w: inner.w, h: wv }, [whenLine], med, o.align, 'top', color);
		bottom -= mv.lh;
	}
	const fit = fitText(env, ev.title, inner.w, Math.max(10, bottom - top), facesFor(o.size), true);
	drawLines(env, { x: inner.x, y: top, w: inner.w, h: Math.max(10, bottom - top) }, fit.lines, fit.face, o.align, 'middle', color);
}

function countEvents(ctx: LayoutCtx): number {
	const today = dayIdx(ctx.nowLocal);
	return ctx.events.filter((e) => dayIdx(e.startLocal) === today).length;
}

// ---- calendar grids ----
function miniMonth(env: Env, w: Widget, o: Opts) {
	const { d, ctx } = env;
	const now = tmOf(ctx.nowLocal);
	const monFirst = o.start !== 'sun';
	const headH = 20;
	const firstWday = (((now.wday - (now.mday - 1)) % 7) + 7) % 7;
	const offset = monFirst ? (firstWday + 6) % 7 : firstWday;
	const dim = daysInMonth(now.year, now.mon);
	const rows = Math.ceil((offset + dim) / 7);
	// the month name only fits if the rows keep a readable height
	const titleH = o.title === true && (w.h - 26 - headH) / rows >= 18 ? 26 : 0;
	const cw = w.w / 7;
	const ch = (w.h - titleH - headH) / rows;
	const sb = withBold(FACES.s, true);
	const sv = vm(env, FACES.s);

	if (titleH) {
		const full = `${monthName(now)} ${now.year}`;
		const title = measure(env.fam, sb.role, full).w <= w.w ? full : `${monthShort(now)} ${now.year}`;
		d.text(w.x + w.w / 2, w.y + 17, sb.role, title, { align: 'center', maxW: w.w });
	}
	const letters = monFirst ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
	letters.forEach((l, i) => d.text(w.x + cw * i + cw / 2, w.y + titleH + 15, sb.role, l, { align: 'center' }));

	const counts = new Array(32).fill(0);
	for (const e of ctx.events) {
		const t = tmOf(e.startLocal);
		if (t.year === now.year && t.mon === now.mon) counts[t.mday]++;
	}
	const showDots = o.dots === true && ch >= 26;
	for (let day = 1; day <= dim; day++) {
		const col = (day + offset - 1) % 7;
		const row = Math.floor((day + offset - 1) / 7);
		const cx = w.x + cw * col + cw / 2;
		const top = w.y + titleH + headH + row * ch;
		const base = top + (ch + sv.cap) / 2 - (showDots ? 3 : 0);
		d.text(cx, base, 's', String(day), { align: 'center', ring: day === now.mday });
		if (showDots && counts[day]) {
			const n = Math.min(3, counts[day]);
			const x0 = cx - (n * 4 - 1) / 2;
			for (let k = 0; k < n; k++) d.fill(x0 + k * 4, base + 6, 3, 3, day === now.mday ? PAPER : INK);
		}
	}
}

function weekStrip(env: Env, w: Widget, o: Opts) {
	const { d, ctx } = env;
	const now = tmOf(ctx.nowLocal);
	const today = dayIdx(ctx.nowLocal);
	const startDay = o.start === 'today' ? today : o.start === 'sun' ? today - now.wday : today - ((now.wday + 6) % 7);
	const cw = w.w / 7;
	const wide = cw >= 38;
	const content = 46 + (w.h >= 54 ? 6 : 0);
	const top = w.y + Math.max(0, Math.floor((w.h - content) / 2));
	const counts = new Map<number, number>();
	for (const e of ctx.events) counts.set(dayIdx(e.startLocal), (counts.get(dayIdx(e.startLocal)) ?? 0) + 1);
	for (let i = 0; i < 7; i++) {
		const day = startDay + i;
		const t = tmOf(day * 86400 + 43200);
		const x = w.x + cw * i;
		const cx = x + cw / 2;
		const isToday = day === today;
		if (isToday) d.fillRound(x + 1, w.y, cw - 2, w.h, 4, INK);
		const ink: Color = isToday ? PAPER : INK;
		d.text(cx, top + 14, 's', wide ? DAY_NAMES[t.wday].slice(0, 3) : DAY_NAMES[t.wday][0], { align: 'center', color: ink });
		d.text(cx, top + 40, 'm', String(t.mday), { align: 'center', color: ink });
		const n = o.dots === true ? Math.min(3, counts.get(day) ?? 0) : 0;
		if (n && w.h >= 54) for (let k = 0; k < n; k++) d.fill(cx - (n * 6 - 2) / 2 + k * 6, top + 48, 4, 4, ink);
	}
}

// ---- weather & sky ----
const pad2 = (n: number) => String(n).padStart(2, '0');
function hhmm(ms: number, off: number): string {
	const t = Math.round((ms / 1000 + off) / 60);
	const m = ((t % 1440) + 1440) % 1440;
	return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

function weatherWidget(env: Env, w: Widget, o: Opts) {
	const wx = env.ctx.weather;
	if (!wx) return textWidget(env, w, o, '---');
	const hi = round0(wx.high);
	const lo = round0(wx.low);
	const text = o.show === 'high' ? `High ${hi}C` : o.show === 'low' ? `Low ${lo}C` : `High ${hi}C  Low ${lo}C`;
	const short = o.show === 'high' ? `${hi}C` : o.show === 'low' ? `${lo}C` : `${hi}C / ${lo}C`;
	// the long wording at the biggest size that fits; if even the smallest overflows, the short wording
	const { inner } = { inner: { w: w.w - (o.invert === true || o.border === true ? 10 : 0) } };
	const sized = facesFor(o.size);
	const fits = (s: string, key: string) => measure(env.fam, withBold(FACES[key], o.bold === true).role, s, FACES[key].scale).w <= inner.w;
	const key = sized.find((k) => fits(text, k));
	textWidget(env, w, o, key ? text : short);
}

function wxIcon(env: Env, x: number, y: number, size: number, code: number) {
	env.d.bitmapBytes(Math.round(x), Math.round(y), size, size, weatherBits(wxKind(code), size));
}

function weatherIconWidget(env: Env, w: Widget) {
	const code = env.ctx.weather?.code;
	if (code === undefined) return textWidget(env, w, { size: 's', align: 'center' }, env.ctx.weather ? '---' : 'No weather');
	const size = Math.max(16, Math.min(Math.floor(Math.min(w.w, w.h)), 128));
	wxIcon(env, w.x + (w.w - size) / 2, w.y + (w.h - size) / 2, size, code);
}

function weatherSummaryWidget(env: Env, w: Widget, o: Opts) {
	const wx = env.ctx.weather;
	if (!wx || wx.code === undefined) return textWidget(env, w, o, '---');
	const bits: string[] = [];
	if (o.rain === true && wx.rain !== null && wx.rain !== undefined) bits.push(`Rain ${wx.rain}%`);
	if (o.wind === true && wx.wind !== null && wx.wind !== undefined) bits.push(`Wind ${wx.wind} km/h`);
	const sub = bits.join('   ');
	const { inner, color } = chrome(env, w, o);
	const small = FACES.s;
	const sv = vm(env, small);
	const subH = sub ? sv.asc + sv.desc + 4 : 0;
	const fit = fitText(env, wxLabel(wx.code), inner.w, Math.max(10, inner.h - subH), facesFor(o.size), o.bold === true);
	if (!sub) return drawLines(env, inner, fit.lines, fit.face, o.align, o.valign ?? 'middle', color);
	const nv = blockH(env, fit.face, fit.lines.length);
	const total = nv + subH;
	const top = o.valign === 'top' ? inner.y : o.valign === 'bottom' ? inner.y + inner.h - total : inner.y + Math.max(0, (inner.h - total) / 2);
	drawLines(env, { x: inner.x, y: top, w: inner.w, h: nv }, fit.lines, fit.face, o.align, 'top', color);
	const sfit = fitText(env, sub, inner.w, sv.asc + sv.desc, ['s'], false);
	drawLines(env, { x: inner.x, y: top + nv + 4, w: inner.w, h: sv.asc + sv.desc }, sfit.lines.slice(0, 1), small, o.align, 'top', color);
}

function forecastWidget(env: Env, w: Widget, o: Opts) {
	const all = env.ctx.weather?.days;
	if (!all || !all.length) return textWidget(env, w, { size: 's', align: 'center' }, env.ctx.weather ? '---' : 'No weather');
	const { inner, color } = chrome(env, w, o);
	const start = o.from === 'tomorrow' ? 1 : 0;
	const n = Math.max(1, Math.min(Number(o.days) || 5, all.length - start));
	const days = all.slice(start, start + n);
	const small = FACES.s;
	const sv = vm(env, small);
	const hiOnly = o.temps === 'high';
	const name = (i: number) => (start + i === 0 ? 'Today' : DAY_NAMES[new Date(days[i].date + 'T00:00:00Z').getUTCDay()].slice(0, 3));
	const temp = (i: number) => (hiOnly ? `${round0(days[i].high)}` : `${round0(days[i].high)}/${round0(days[i].low)}`);
	if (inner.w >= inner.h * 1.15) {
		// columns: name on top, picture in the middle, temperatures underneath
		const cw = inner.w / n;
		const textH = sv.asc + sv.desc;
		const iconSize = Math.floor(Math.min(cw - 8, inner.h - 2 * textH - 8, 80));
		days.forEach((_, i) => {
			const cx = inner.x + cw * i + cw / 2;
			d_text(env, cx, inner.y + sv.asc, name(i), 'center', color, cw - 4);
			if (iconSize >= 16) wxIcon(env, cx - iconSize / 2, inner.y + textH + 4 + (inner.h - 2 * textH - 8 - iconSize) / 2, iconSize, days[i].code);
			d_text(env, cx, inner.y + inner.h - sv.desc, temp(i), 'center', color, cw - 4);
		});
	} else {
		// rows: name on the left, picture in the middle, temperatures on the right
		const rh = inner.h / n;
		const wide = (f: (i: number) => string) => Math.max(...days.map((_, i) => measure(env.fam, 's', f(i), 1).w)) + 4;
		const nameW = wide(name);
		const tempW = wide(temp);
		const free = inner.w - nameW - tempW;
		const iconSize = Math.floor(Math.min(rh - 4, 44, free - 6));
		days.forEach((_, i) => {
			const cy = inner.y + rh * i + rh / 2;
			const ty = cy + (sv.asc - sv.desc) / 2;
			d_text(env, inner.x + 2, ty, name(i), 'left', color, nameW);
			if (iconSize >= 16) wxIcon(env, inner.x + nameW + (free - iconSize) / 2, cy - iconSize / 2, iconSize, days[i].code);
			d_text(env, inner.x + inner.w - 2, ty, temp(i), 'right', color, tempW);
		});
	}
}
function d_text(env: Env, x: number, y: number, s: string, align: Align, color: Color, maxW: number) {
	env.d.text(x, y, 's', s, { align, color, maxW });
}

function moonWidget(env: Env, w: Widget) {
	const { ctx } = env;
	const off = ctx.utcOffsetSec ?? 0;
	const noonMs = (dayIdx(ctx.nowLocal) * 86400 + 43200 - off) * 1000;
	const info = moonInfo(noonMs);
	const size = Math.max(24, Math.floor(Math.min(w.w, w.h)));
	env.d.bitmapBytes(w.x + Math.floor((w.w - size) / 2), w.y + Math.floor((w.h - size) / 2), size, size, moonBits({ size, elong: info.elong, flip: !!ctx.loc && ctx.loc.lat < 0, dark: ctx.dark }));
}

function moonText(env: Env, w: Widget, o: Opts) {
	const { ctx } = env;
	const off = ctx.utcOffsetSec ?? 0;
	const info = moonInfo((dayIdx(ctx.nowLocal) * 86400 + 43200 - off) * 1000);
	const { inner, color } = chrome(env, w, o);
	const lit = o.lit === true ? `${Math.round(info.illum * 100)}% lit` : '';
	const small = FACES.s;
	const sv = vm(env, small);
	const nameBox = { ...inner, h: Math.max(10, inner.h - (lit ? sv.lh : 0)) };
	const fit = fitText(env, info.name, nameBox.w, nameBox.h, ['m', 's'], o.bold === true || true);
	if (!lit) return drawLines(env, inner, fit.lines, fit.face, o.align, 'middle', color);
	const nv = blockH(env, fit.face, fit.lines.length);
	const total = nv + 4 + sv.asc + sv.desc;
	const top = inner.y + Math.max(0, (inner.h - total) / 2);
	drawLines(env, { x: inner.x, y: top, w: inner.w, h: nv }, fit.lines, fit.face, o.align, 'top', color);
	drawLines(env, { x: inner.x, y: top + nv + 4, w: inner.w, h: sv.asc + sv.desc }, [lit], small, o.align, 'top', color);
}

function sunTimesWidget(env: Env, w: Widget, o: Opts) {
	const { ctx, d } = env;
	const { inner, color } = chrome(env, w, o);
	if (!ctx.loc) {
		const fit = fitText(env, 'Add a weather location in setup', inner.w, inner.h, ['s'], false);
		return drawLines(env, inner, fit.lines, fit.face, 'left', 'middle', color);
	}
	const now = tmOf(ctx.nowLocal);
	const sun = sunTimes(now.year, now.mon, now.mday, ctx.loc.lat, ctx.loc.lon);
	if (sun.rise === null || sun.set === null) {
		return drawLines(env, inner, [sun.polar === 'day' ? 'The sun stays up all day' : 'The sun stays down all day'], FACES.s, 'left', 'middle', color);
	}
	const off = ctx.utcOffsetSec ?? 0;
	const sv = vm(env, FACES.s);
	const big = withBold(FACES.m, true);
	const bv = vm(env, big);
	const extra = o.daylight === true && inner.h >= 64;
	const total = sv.asc + 6 + bv.asc + bv.desc + (extra ? 6 + sv.asc : 0);
	const top = inner.y + Math.max(0, (inner.h - total) / 2);
	d.text(inner.x, top + sv.asc, 's', 'Sunrise', { color });
	d.text(inner.x + inner.w, top + sv.asc, 's', 'Sunset', { align: 'right', color });
	const tb = top + sv.asc + 6 + bv.asc;
	d.text(inner.x, tb, big.role, hhmm(sun.rise, off), { color });
	d.text(inner.x + inner.w, tb, big.role, hhmm(sun.set, off), { align: 'right', color });
	if (extra) {
		const mins = Math.round((sun.set - sun.rise) / 60000);
		d.text(inner.x + inner.w / 2, tb + bv.desc + 6 + sv.asc, 's', `${Math.floor(mins / 60)}h ${pad2(mins % 60)}m of daylight`, { align: 'center', color, maxW: inner.w });
	}
}

function sunArc(env: Env, w: Widget) {
	const d = env.d;
	const rx = Math.max(20, Math.floor(w.w / 2) - 8);
	const hy = w.y + w.h - 8;
	const ry = Math.max(10, Math.min(w.h - 26, Math.floor(rx * 0.8)));
	const cx = w.x + w.w / 2;
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
}

// ---- extras ----
function quoteWidget(env: Env, w: Widget, o: Opts) {
	const { inner, color } = chrome(env, w, o);
	const [text, author] = quoteForDay(dayIdx(env.ctx.nowLocal));
	const small = FACES.s;
	const sv = vm(env, small);
	const authorH = o.author === true ? sv.lh + 2 : 0;
	const box = { ...inner, h: Math.max(10, inner.h - authorH) };
	const fit = fitText(env, text, box.w, box.h, facesFor(o.size), false);
	drawLines(env, box, fit.lines, fit.face, o.align, 'middle', color);
	if (authorH) drawLines(env, { x: inner.x, y: inner.y + inner.h - sv.asc - sv.desc, w: inner.w, h: sv.asc + sv.desc }, ['- ' + author], small, o.align, 'top', color);
}

function parseDay(s: string): number | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
	if (!m) return null;
	const ms = Date.UTC(+m[1], +m[2] - 1, +m[3]);
	return Number.isFinite(ms) ? Math.floor(ms / 86400000) : null;
}

function countdownWidget(env: Env, w: Widget, o: Opts) {
	const { inner, color } = chrome(env, w, o);
	const c = env.ctx.countdown;
	const target = c ? parseDay(c.date) : null;
	if (!c || !c.title.trim() || target === null) {
		const fit = fitText(env, 'Set a name and date for this countdown', inner.w, inner.h, ['s'], false);
		return drawLines(env, inner, fit.lines, fit.face, 'center', 'middle', color);
	}
	const days = target - dayIdx(env.ctx.nowLocal);
	const med = withBold(FACES.m, true);
	const mv = vm(env, med);
	let top = inner.y;
	let bottom = inner.y + inner.h;
	if (o.title === true && inner.h >= 70) {
		const fit = fitText(env, c.title.trim(), inner.w, mv.lh * 2, ['m', 's'], true);
		const bh = blockH(env, fit.face, fit.lines.length);
		drawLines(env, { x: inner.x, y: top, w: inner.w, h: bh }, fit.lines, fit.face, 'center', 'top', color);
		top += bh + 4;
	}
	const sub = days > 0 ? (days === 1 ? 'day to go' : 'days to go') : days === 0 ? '' : days === -1 ? 'day ago' : 'days ago';
	if (sub && bottom - top > mv.lh + 24) {
		drawLines(env, { x: inner.x, y: bottom - mv.asc - mv.desc, w: inner.w, h: mv.asc + mv.desc }, [sub], med, 'center', 'top', color);
		bottom -= mv.lh;
	}
	const num = days === 0 ? 'Today!' : String(Math.abs(days));
	const fit = fitText(env, num, inner.w, Math.max(10, bottom - top), ORDER.slice(0, 5), true);
	drawLines(env, { x: inner.x, y: top, w: inner.w, h: Math.max(10, bottom - top) }, fit.lines, fit.face, 'center', 'middle', color);
}

function tasksWidget(env: Env, w: Widget, o: Opts) {
	const { d, ctx } = env;
	const face = FACES.s;
	const v = vm(env, face);
	const note = (text: string) => {
		const fit = fitText(env, text, w.w, w.h, ['s'], false);
		drawLines(env, w, fit.lines, fit.face, 'left', 'top', INK);
	};
	if (ctx.tasksState === 'needs_permission') return note('Connect Google Tasks in Customize display');
	if (ctx.tasksState === 'error' || !ctx.tasks) return note("Couldn't load your tasks");
	const open = ctx.tasks.filter((t) => !t.done);
	const list = o.done === true ? [...open, ...ctx.tasks.filter((t) => t.done)] : open;
	if (!list.length) return note(open.length === 0 ? 'All done!' : 'Nothing to do');
	const pitch = v.lh + 4;
	const rows = Math.max(1, Math.floor((w.h - v.asc - v.desc) / pitch) + 1);
	list.slice(0, rows).forEach((t, i) => {
		const base = w.y + v.asc + i * pitch;
		const bx = w.x + 1;
		const by = base - 13;
		if (t.done) {
			d.fillRound(bx, by, 14, 14, 3);
			d.line(bx + 3, by + 7, bx + 6, by + 10, PAPER);
			d.line(bx + 4, by + 7, bx + 7, by + 10, PAPER);
			d.line(bx + 6, by + 10, bx + 11, by + 3, PAPER);
			d.line(bx + 7, by + 10, bx + 12, by + 3, PAPER);
		} else {
			d.round(bx, by, 14, 14, 3);
			d.round(bx + 1, by + 1, 12, 12, 2);
		}
		const tw = Math.max(10, w.w - 24);
		d.text(w.x + 22, base, face.role, t.title, { maxW: tw });
		if (t.done) d.hline(w.x + 22, base - 5, Math.min(tw, measure(env.fam, face.role, t.title).w));
		if (o.dots === true && i < Math.min(rows, list.length) - 1) d.dots(w.x, base + v.desc + 2, w.w, 4);
	});
}

function progressWidget(env: Env, w: Widget, o: Opts) {
	const { d, ctx } = env;
	const now = tmOf(ctx.nowLocal);
	const dayFrac = (((ctx.nowLocal % 86400) + 86400) % 86400) / 86400;
	let frac = dayFrac;
	let name = 'Day';
	if (o.span === 'week') {
		frac = (((now.wday + 6) % 7) + dayFrac) / 7;
		name = 'Week';
	} else if (o.span === 'month') {
		frac = (now.mday - 1 + dayFrac) / daysInMonth(now.year, now.mon);
		name = MONTH_NAMES[now.mon];
	} else if (o.span === 'year') {
		const start = Date.UTC(now.year, 0, 1) / 86400000;
		const len = (Date.UTC(now.year + 1, 0, 1) - Date.UTC(now.year, 0, 1)) / 86400000;
		frac = (dayIdx(ctx.nowLocal) - start + dayFrac) / len;
		name = String(now.year);
	}
	const pct = Math.round(frac * 100);
	const sv = vm(env, FACES.s);
	const labelH = o.label === true ? sv.lh : 0;
	const barH = Math.max(10, Math.min(18, w.h - labelH));
	const barY = w.y + w.h - barH - (w.h - labelH - barH > 4 ? Math.floor((w.h - labelH - barH) / 2) : 0);
	if (o.label === true) {
		d.text(w.x, barY - 5 - sv.desc, 'sb', name, { maxW: w.w - 50 });
		d.text(w.x + w.w, barY - 5 - sv.desc, 's', `${pct}%`, { align: 'right' });
	}
	d.round(w.x, barY, w.w, barH, 4);
	const fw = Math.round((w.w - 6) * Math.min(1, Math.max(0, frac)));
	if (fw > 0) d.fillRound(w.x + 3, barY + 3, Math.max(2, fw), barH - 6, 2);
}

// ---- shapes ----
function boxWidget(env: Env, w: Widget, o: Opts) {
	const d = env.d;
	const round = o.round === true;
	const r = Math.min(10, Math.floor(Math.min(w.w, w.h) / 4));
	if (o.fill === 'solid') {
		round ? d.fillRound(w.x, w.y, w.w, w.h, r) : d.fill(w.x, w.y, w.w, w.h);
	} else if (o.fill === 'light') {
		const step = w.h > 140 ? 4 : 2;
		for (let row = 0; row < w.h; row += step) d.dots(w.x + ((row / step) % 2 ? 1 : 0), w.y + row, w.w, 2);
		round ? d.round(w.x, w.y, w.w, w.h, r) : d.rect(w.x, w.y, w.w, w.h);
	} else {
		const t = Math.max(1, Math.min(4, Number(o.thick) || 2));
		for (let i = 0; i < t; i++) {
			if (w.w - 2 * i < 2 || w.h - 2 * i < 2) break;
			round ? d.round(w.x + i, w.y + i, w.w - 2 * i, w.h - 2 * i, Math.max(0, r - i)) : d.rect(w.x + i, w.y + i, w.w - 2 * i, w.h - 2 * i);
		}
	}
}

function lineWidget(env: Env, w: Widget, o: Opts) {
	const d = env.d;
	const t = Math.max(1, Math.min(4, Number(o.thick) || 2));
	if (w.w >= w.h) {
		const y0 = w.y + Math.floor(w.h / 2) - Math.floor(t / 2);
		for (let i = 0; i < t; i++) (o.dotted === true ? d.dots(w.x, y0 + i, w.w, 4) : d.hline(w.x, y0 + i, w.w));
	} else {
		const x0 = w.x + Math.floor(w.w / 2) - Math.floor(t / 2);
		for (let i = 0; i < t; i++) {
			if (o.dotted === true) for (let yy = 0; yy < w.h; yy += 4) d.vline(x0 + i, w.y + yy, 2);
			else d.vline(x0 + i, w.y, w.h);
		}
	}
}

function pictureWidget(env: Env, w: Widget) {
	const img = env.ctx.cornerImage;
	if (!img || img.length !== CORNER_BYTES) return;
	let bytes = img;
	let bw = CORNER.w;
	let bh = CORNER.h;
	if (w.w !== CORNER.w || w.h !== CORNER.h) {
		// Fill the box (crop the overflow, centred), sampling the stored dots so it stays crisp at any size.
		const sStride = Math.ceil(CORNER.w / 8);
		const k = Math.max(w.w / CORNER.w, w.h / CORNER.h);
		const ox = (CORNER.w - w.w / k) / 2;
		const oy = (CORNER.h - w.h / k) / 2;
		const oStride = Math.ceil(w.w / 8);
		const out = new Uint8Array(oStride * w.h);
		for (let y = 0; y < w.h; y++) {
			const y0 = Math.min(CORNER.h - 1, Math.floor(oy + y / k));
			const y1 = Math.min(CORNER.h, Math.max(y0 + 1, Math.ceil(oy + (y + 1) / k)));
			for (let x = 0; x < w.w; x++) {
				const x0 = Math.min(CORNER.w - 1, Math.floor(ox + x / k));
				const x1 = Math.min(CORNER.w, Math.max(x0 + 1, Math.ceil(ox + (x + 1) / k)));
				let ink = 0;
				for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) if (img[yy * sStride + (xx >> 3)] & (0x80 >> (xx & 7))) ink++;
				if (ink * 2 >= (y1 - y0) * (x1 - x0)) out[y * oStride + (x >> 3)] |= 0x80 >> (x & 7);
			}
		}
		bytes = out;
		bw = w.w;
		bh = w.h;
	}
	if (env.ctx.dark) bytes = bytes.map((b) => ~b & 0xff);
	env.d.bitmapBytes(w.x, w.y, bw, bh, bytes);
}

function batteryWidget(env: Env, w: Widget, o: Opts) {
	const a = o.align === 'right' ? 'right' : o.align === 'center' ? 'center' : 'left';
	const x = a === 'left' ? w.x : a === 'right' ? w.x + w.w : w.x + w.w / 2;
	batteryIcon(env.d, env.ctx, x, w.y, a, o.invert === true ? PAPER : INK);
}

// ---- one widget ----
function drawWidget(env: Env, w: Widget) {
	const o = withDefaults(w);
	const now = tmOf(env.ctx.nowLocal);
	switch (w.t) {
		case 'text':
			return textWidget(env, w, o, String(o.text ?? ''));
		case 'date_num':
			return textWidget(env, w, o, String(now.mday));
		case 'weekday':
			return textWidget(env, w, o, o.short === true ? DAY_NAMES[now.wday].slice(0, 3) : DAY_NAMES[now.wday]);
		case 'month':
			return textWidget(env, w, o, `${o.short === true ? monthShort(now) : monthName(now)}${o.year === true ? ' ' + now.year : ''}`);
		case 'date_full': {
			const t = o.fmt === 'long' ? `${DAY_NAMES[now.wday]} ${now.mday} ${monthName(now)}` : o.fmt === 'num' ? `${pad2(now.mday)}/${pad2(now.mon + 1)}/${now.year}` : `${dayShort(now)} ${now.mday} ${monthShort(now)}`;
			return textWidget(env, w, o, t);
		}
		case 'events':
			return eventsWidget(env, w, o);
		case 'next_event':
			return nextEventWidget(env, w, o);
		case 'event_count': {
			const n = countEvents(env.ctx);
			return textWidget(env, w, o, n === 0 ? 'No events today' : n === 1 ? '1 event today' : `${n} events today`);
		}
		case 'mini_month':
			return miniMonth(env, w, o);
		case 'week_strip':
			return weekStrip(env, w, o);
		case 'weather':
			return weatherWidget(env, w, o);
		case 'weather_icon':
			return weatherIconWidget(env, w);
		case 'weather_summary':
			return weatherSummaryWidget(env, w, o);
		case 'forecast':
			return forecastWidget(env, w, o);
		case 'moon':
			return moonWidget(env, w);
		case 'moon_text':
			return moonText(env, w, o);
		case 'sun_times':
			return sunTimesWidget(env, w, o);
		case 'sun_arc':
			return sunArc(env, w);
		case 'quote':
			return quoteWidget(env, w, o);
		case 'countdown':
			return countdownWidget(env, w, o);
		case 'tasks':
			return tasksWidget(env, w, o);
		case 'progress':
			return progressWidget(env, w, o);
		case 'battery':
			return batteryWidget(env, w, o);
		case 'picture':
			return pictureWidget(env, w);
		case 'box':
			return boxWidget(env, w, o);
		case 'line':
			return lineWidget(env, w, o);
	}
}

// A draw list may hold at most 700 commands; stop adding widgets well before that.
const BUDGET = 640;

export function renderCustom(ctx: LayoutCtx): string {
	const d = new Draw(ctx.family, ctx.dark);
	const env: Env = { d, ctx, fam: ctx.family };
	const layout: CustomLayout | null | undefined = ctx.custom;
	if (!layout || !layout.widgets.length) {
		d.text(200, 138, 'mb', 'Design your own screen', { align: 'center', maxW: 380 });
		d.text(200, 166, 's', 'Open Customize display on your dashboard', { align: 'center', maxW: 380 });
		d.text(200, 188, 's', 'and choose "Open the layout builder".', { align: 'center', maxW: 380 });
		return d.toString();
	}
	for (const w of layout.widgets) {
		if (d.count > BUDGET) break;
		drawWidget(env, w);
	}
	return d.toString();
}
