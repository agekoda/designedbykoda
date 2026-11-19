// Draws a custom layout: every widget of the person's design, in order, into one draw list.
// Text always fits its box (it shrinks or wraps rather than spilling out), so whatever size
// someone drags a widget to, the result is a valid, tidy screen. Used by the server for the
// real display and by the editor for the live preview, so they always match.
import { deg, windText } from '../units';
import { minutesShort, timeText } from '../clock';
import { Draw, PAPER, INK, type Align, type Color } from '../draw';
import { fontId, type Family, type Role } from '../fonts';
import { advanceOf, measure, wrapText } from '../measure';
import { VMETRICS } from '../vmetrics';
import { CORNER, fitBits } from '../image';
import { batteryIcon } from '../batteryIcon';
import { moonBits } from '../moonImage';
import { weatherBits, wxKind, wxLabel } from '../weatherIcon';
import { moonInfo, sunTimes } from '../astro';
import { quoteFor } from '../../../data/quotes';
import {
	dateShort, dayAbbr, dayIdx, dayLetter, dayLong, dayShort, daysInMonth, dayMonth, evTimeStr, monthLong, monthName, monthShort, monthYear, round0, tmOf, weekLetters, type CalEvent, type LayoutCtx,
} from '../context';
import { isJa, tr } from '../i18n';
import { DAY_NAMES } from '../context';
import { withDefaults, type CustomLayout, type Widget } from './model';
import { linkPayload, qrBits, qrMatrix, wifiPayload, type WifiSecurity } from '../qr';
import { toAscii } from '../draw';
import { messageList } from '../layouts/messages';
import { reminderList } from '../layouts/reminders';
import { habitGrid } from '../layouts/habits';
import { birthdayList } from '../layouts/birthdays';
import { wordOfDay } from '../jpWords';
import { personName, type NameStyle } from '../waiting';

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

// Where each line of a Text box sits on the screen, so the builder can type straight onto the
// canvas in the real pixel font: it draws its own cursor from this, and turns clicks into positions.
// Same steps as textWidget (padding, fitting, wrapping, alignment). Lines know where they start in
// the text, so the cursor can be placed by character.
export interface CaretLine { start: number; end: number; x: number; base: number; adv: number[] }
export function textLayout(family: Family, w: Widget, text: string): { lines: CaretLine[]; asc: number; desc: number } {
	const o = withDefaults(w);
	const env = { d: new Draw(family, false), ctx: null as any, fam: family } as Env;
	const pad = o.invert === true || o.border === true ? 5 : 0;
	const inner: Box = { x: w.x + pad, y: w.y + pad, w: Math.max(1, w.w - 2 * pad), h: Math.max(1, w.h - 2 * pad) };
	const fit = fitText(env, text, inner.w, inner.h, facesFor(o.size), o.bold === true);
	const face = fit.face;
	const v = vm(env, face);
	const shown = fit.lines.length ? fit.lines : [''];
	const bh = blockH(env, face, shown.length);
	const top = o.valign === 'top' ? inner.y : o.valign === 'bottom' ? inner.y + inner.h - bh : inner.y + (inner.h - bh) / 2;
	const lines: CaretLine[] = [];
	let pos = 0;
	shown.forEach((ln, i) => {
		// find this line in the text, past the spaces and line breaks wrapping took out
		let start = ln ? text.indexOf(ln, pos) : pos;
		if (start < 0) start = pos;
		const end = start + ln.length;
		pos = end;
		const adv = Array.from(ln).map((c) => advanceOf(family, face.role, c, face.scale));
		const width = adv.reduce((a, b) => a + b, 0);
		const x = o.align === 'center' ? inner.x + (inner.w - width) / 2 : o.align === 'right' ? inner.x + inner.w - width : inner.x;
		lines.push({ start, end, x, base: top + v.asc + i * v.lh, adv });
	});
	// whatever the last line didn't take (trailing spaces, a new empty line) belongs at its end
	if (lines.length) lines[lines.length - 1].end = Math.max(lines[lines.length - 1].end, text.length);
	return { lines, asc: v.asc, desc: v.desc };
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
	const dayWord = day === today ? tr('Today') : day === today + 1 ? tr('Tomorrow') : dateShort(t);
	const whenLine = isJa() ? `${dayWord}・${evTimeStr(ev)}` : ev.allDay ? `${dayWord}, all day` : `${dayWord}, ${evTimeStr(ev)}`;
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
		const full = monthYear(now);
		const title = measure(env.fam, sb.role, full).w <= w.w ? full : monthYear(now, true);
		d.text(w.x + w.w / 2, w.y + 17, sb.role, title, { align: 'center', maxW: w.w });
	}
	const letters = weekLetters(monFirst);
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
		d.text(cx, top + 14, 's', wide ? dayAbbr(t.wday) : dayLetter(t.wday), { align: 'center', color: ink });
		d.text(cx, top + 40, 'm', String(t.mday), { align: 'center', color: ink });
		const n = o.dots === true ? Math.min(3, counts.get(day) ?? 0) : 0;
		if (n && w.h >= 54) for (let k = 0; k < n; k++) d.fill(cx - (n * 6 - 2) / 2 + k * 6, top + 48, 4, 4, ink);
	}
}

// ---- weather & sky ----
const pad2 = (n: number) => String(n).padStart(2, '0');
function hhmm(ms: number, off: number): string {
	return minutesShort(Math.round((ms / 1000 + off) / 60)); // under Sunrise / Sunset labels: no am/pm
}

function weatherWidget(env: Env, w: Widget, o: Opts) {
	const wx = env.ctx.weather;
	if (!wx) return textWidget(env, w, o, '---');
	const hi = round0(wx.high);
	const lo = round0(wx.low);
	const text = o.show === 'high' ? `High ${hi}${deg()}` : o.show === 'low' ? `Low ${lo}${deg()}` : `High ${hi}${deg()}  Low ${lo}${deg()}`;
	const short = o.show === 'high' ? `${hi}${deg()}` : o.show === 'low' ? `${lo}${deg()}` : `${hi}${deg()} / ${lo}${deg()}`;
	// the long wording at the biggest size that fits; if even the smallest overflows, the short wording
	const { inner } = { inner: { w: w.w - (o.invert === true || o.border === true ? 10 : 0) } };
	const sized = facesFor(o.size);
	const fits = (s: string, key: string) => measure(env.fam, withBold(FACES[key], o.bold === true).role, s, FACES[key].scale).w <= inner.w;
	if (o.show !== 'high' && o.show !== 'low') {
		// High and Low: on one line if it fits, otherwise High above Low (never broken mid-way),
		// at the biggest size that fits; the short wording if nothing does.
		const { inner: box, color } = chrome(env, w, o);
		const two = [`High ${hi}${deg()}`, `Low ${lo}${deg()}`];
		for (const k of sized) {
			const face = withBold(FACES[k], o.bold === true);
			for (const lines of [[text], two]) {
				if (lines.every((l) => measure(env.fam, face.role, l, face.scale).w <= box.w) && blockH(env, face, lines.length) <= box.h)
					return drawLines(env, box, lines, face, o.align, o.valign ?? 'middle', color);
			}
		}
		const sf = fitText(env, short, box.w, box.h, sized, o.bold === true);
		return drawLines(env, box, sf.lines, sf.face, o.align, o.valign ?? 'middle', color);
	}
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
	if (o.wind === true && wx.wind !== null && wx.wind !== undefined) bits.push(windText(wx.wind));
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
	const name = (i: number) => (start + i === 0 ? tr('Today') : dayAbbr(new Date(days[i].date + 'T00:00:00Z').getUTCDay()));
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
	const [text, author] = quoteFor(dayIdx(env.ctx.nowLocal), isJa());
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
		name = monthLong(now.mon);
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
	if (!img) return;
	const sw = env.ctx.cornerSize?.w ?? CORNER.w;
	const sh = env.ctx.cornerSize?.h ?? CORNER.h;
	if (img.length !== Math.ceil(sw / 8) * sh) return;
	// Stored at the size it was made for; if the box has since changed, fill it from the stored dots.
	let bytes = fitBits(img, sw, sh, w.w, w.h);
	if (env.ctx.dark) bytes = bytes.map((b) => ~b & 0xff);
	env.d.bitmapBytes(w.x, w.y, w.w, w.h, bytes);
}

function batteryWidget(env: Env, w: Widget, o: Opts) {
	const a = o.align === 'right' ? 'right' : o.align === 'center' ? 'center' : 'left';
	const x = a === 'left' ? w.x : a === 'right' ? w.x + w.w : w.x + w.w / 2;
	batteryIcon(env.d, env.ctx, x, w.y, a, o.invert === true ? PAPER : INK);
}

// ---- QR code ----
function qrPayload(o: Opts): string {
	if (o.mode === 'wifi') return String(o.ssid ?? '') ? wifiPayload(String(o.ssid), String(o.pass ?? ''), (String(o.sec) as WifiSecurity) || 'WPA', o.hidden === true) : '';
	if (o.mode === 'text') return String(o.data ?? '');
	return linkPayload(String(o.url ?? ''));
}

function qrWidget(env: Env, w: Widget, o: Opts) {
	const { d, ctx } = env;
	let box: Box = { x: w.x, y: w.y, w: w.w, h: w.h };
	if (o.border === true) {
		d.round(w.x, w.y, w.w, w.h, 3, INK);
		d.round(w.x + 1, w.y + 1, w.w - 2, w.h - 2, 2, INK);
		box = { x: w.x + 6, y: w.y + 6, w: Math.max(1, w.w - 12), h: Math.max(1, w.h - 12) };
	}
	const caption = String(o.caption ?? '').trim();
	const wantDetails = o.mode === 'wifi' && o.details === true && !!String(o.ssid ?? '');
	const beside = o.pos === 'right' && (!!caption || wantDetails);
	// width the words get: the whole box below the code, or what's left beside it
	const textW = beside ? Math.max(10, box.w - Math.min(box.h, Math.floor(box.w * 0.55)) - 8) : box.w;
	const lines: string[] = [];
	if (caption) lines.push(caption);
	// "Label: value" on one line if it fits, else the value gets a line of its own
	const pair = (label: string, value: string) => {
		const one = toAscii(`${label}: ${value}`);
		if (measure(env.fam, 's', one).w <= textW) lines.push(one);
		else lines.push(label + ':', toAscii(value));
	};
	if (wantDetails) {
		pair('Wi-Fi', String(o.ssid));
		if (o.sec !== 'nopass' && String(o.pass ?? '')) pair('Password', String(o.pass));
	}
	const m = qrMatrix(qrPayload(o));
	const capFace = withBold(FACES.s, o.bold === true);
	const sv = vm(env, FACES.s);
	// room left for the code itself
	const textH = !beside && lines.length ? (lines.length - 1) * sv.lh + sv.asc + sv.desc + 6 : 0;
	const side = beside ? Math.min(box.h, Math.floor(box.w * 0.55)) : Math.min(box.w, box.h - textH);
	if (!m) {
		drawLines(env, box, [qrPayload(o) ? 'Too much text for a QR code' : o.mode === 'wifi' ? 'Type your Wi-Fi name' : 'Type a link or some text'], FACES.s, 'center', 'middle', INK);
		return;
	}
	const QUIET = 2; // white modules round the code, so a phone can find its edge
	const scale = Math.floor(side / (m.size + QUIET * 2));
	if (scale < 2) {
		drawLines(env, box, ['Make this bigger', 'to fit the code'], FACES.s, 'center', 'middle', INK);
		return;
	}
	const { w: qw, bytes } = qrBits(m, scale);
	const full = qw + QUIET * 2 * scale;
	const qx = beside ? box.x : box.x + Math.floor((box.w - full) / 2);
	const qy = beside ? box.y + Math.floor((box.h - full) / 2) : box.y;
	// Always black on white, even in dark mode (dark mode swaps ink and paper on the device),
	// because not every phone camera reads a white-on-black code.
	const bg: Color = ctx.dark ? INK : PAPER;
	const fg: Color = ctx.dark ? PAPER : INK;
	d.fill(qx, qy, full, full, bg);
	d.bitmapBytes(qx + QUIET * scale, qy + QUIET * scale, qw, qw, bytes, fg);
	if (!lines.length) return;
	if (beside) {
		const tb: Box = { x: qx + full + 8, y: box.y, w: Math.max(10, box.x + box.w - (qx + full + 8)), h: box.h };
		listLines(env, tb, lines, capFace, 'left', 'middle', INK);
	} else {
		const tb: Box = { x: box.x, y: qy + full + 4, w: box.w, h: Math.max(10, box.y + box.h - (qy + full + 4)) };
		listLines(env, tb, lines, capFace, 'center', 'top', INK);
	}
}

// Several short lines (the first one in `first` face, the rest regular), each cut with ".." if too wide.
function listLines(env: Env, box: Box, lines: string[], first: Face, align: Align, valign: 'top' | 'middle', color: Color) {
	const v = vm(env, FACES.s);
	const max = Math.max(1, Math.floor((box.h - v.asc - v.desc) / v.lh) + 1);
	const shown = lines.slice(0, max);
	const bh = (shown.length - 1) * v.lh + v.asc + v.desc;
	const top = valign === 'top' ? box.y : box.y + (box.h - bh) / 2;
	const x = align === 'center' ? box.x + box.w / 2 : box.x;
	shown.forEach((ln, i) => env.d.text(x, top + v.asc + i * v.lh, i === 0 ? first.role : 's', ln, { align, color, maxW: box.w }));
}

// ---- list ----
function listWidget(env: Env, w: Widget, o: Opts) {
	const { inner, color } = chrome(env, w, o);
	const items = String(o.items ?? '')
		.split('\n')
		.map((s) => s.trim())
		.filter(Boolean);
	if (!items.length) return;
	const sizes = o.size === 's' ? ['s'] : o.size === 'm' ? ['m'] : o.size === 'l' ? ['l'] : ['l', 'm', 's'];
	const kind = String(o.bullet);
	// lay the list out at each size, biggest first, and keep the first one that fits
	let plan: { face: Face; rows: { lines: string[]; n: number }[]; indent: number } | null = null;
	for (const key of sizes) {
		const face = withBold(FACES[key], o.bold === true);
		const v = vm(env, face);
		const indent = kind === 'none' ? 0 : kind === 'num' ? measure(env.fam, face.role, `${items.length}.`, face.scale).w + 6 : kind === 'box' ? Math.round(v.cap) + 8 : Math.round(v.cap * 0.6) + 8;
		const rows = items.map((it, i) => ({ lines: wrapText(env.fam, face.role, it, Math.max(10, inner.w - indent), face.scale), n: i + 1 }));
		const total = rows.reduce((a, r) => a + r.lines.length, 0);
		const h = (total - 1) * v.lh + (rows.length - 1) * Math.round(v.lh * 0.25) + v.asc + v.desc;
		plan = { face, rows, indent };
		if (h <= inner.h) break;
	}
	if (!plan) return;
	const { face, rows, indent } = plan;
	const v = vm(env, face);
	const gap = Math.round(v.lh * 0.25);
	let y = inner.y + v.asc;
	for (const r of rows) {
		if (y + v.desc > inner.y + inner.h + 1) break;
		const midY = Math.round(y - v.cap / 2);
		if (kind === 'dot') env.d.disc(inner.x + Math.max(2, Math.round(v.cap * 0.18)), midY, Math.max(2, Math.round(v.cap * 0.18)), color);
		else if (kind === 'dash') env.d.fill(inner.x, midY, Math.max(4, Math.round(v.cap * 0.5)), Math.max(1, Math.round(v.cap / 8)), color);
		else if (kind === 'num') env.d.text(inner.x, y, face.role, `${r.n}.`, { scale: face.scale, color });
		else if (kind === 'box') {
			const b = Math.round(v.cap);
			env.d.round(inner.x, Math.round(y - v.cap), b, b, 2, color);
		}
		for (const ln of r.lines) {
			if (y + v.desc > inner.y + inner.h + 1) break;
			env.d.text(inner.x + indent, y, face.role, ln, { scale: face.scale, color, maxW: Math.max(10, inner.w - indent) });
			y += v.lh;
		}
		y += gap;
	}
}

// ---- free or busy ----
// The timed event happening right now, if any (all-day events don't make you busy).
function currentEvent(ctx: LayoutCtx): CalEvent | null {
	for (const e of ctx.events) {
		if (e.allDay) continue;
		const end = e.endLocal ?? e.startLocal + 1800;
		if (e.startLocal <= ctx.nowLocal + 60 && end > ctx.nowLocal + 60) return e;
	}
	return null;
}
const hm = (local: number) => {
	const t = tmOf(local);
	return timeText(t.hour, t.min);
};

function roomStatusWidget(env: Env, w: Widget, o: Opts) {
	const { d, ctx } = env;
	// a status set from a phone ("In a meeting") wins over the calendar, and looks busy
	const status = ctx.deskStatus ?? null;
	const now = status ? null : currentEvent(ctx);
	const busy = !!now || !!status;
	let color: Color = INK;
	if (busy && o.black === true) {
		d.fillRound(w.x, w.y, w.w, w.h, 4, INK);
		color = PAPER;
	} else if (o.border === true) {
		d.round(w.x, w.y, w.w, w.h, 4, INK);
		d.round(w.x + 1, w.y + 1, w.w - 2, w.h - 2, 3, INK);
	}
	const pad = (busy && o.black === true) || o.border === true ? 8 : 0;
	const inner: Box = { x: w.x + pad, y: w.y + pad, w: Math.max(1, w.w - pad * 2), h: Math.max(1, w.h - pad * 2) };
	const detail: string[] = [];
	if (status) {
		if (status.untilLocal !== null) detail.push(`until ${hm(status.untilLocal)}`);
	} else if (o.detail === true) {
		const today = dayIdx(ctx.nowLocal);
		if (now) {
			if (o.title === true) detail.push(now.title);
			const end = now.endLocal ?? now.startLocal + 1800;
			detail.push(`until ${hm(end)}`);
		} else {
			const next = ctx.events.find((e) => !e.allDay && e.startLocal > ctx.nowLocal && dayIdx(e.startLocal) === today);
			detail.push(next ? (o.title === true ? `Next ${hm(next.startLocal)}  ${next.title}` : `until ${hm(next.startLocal)}`) : 'for the rest of the day');
		}
	}
	const sv = vm(env, FACES.s);
	const detailH = detail.length ? detail.length * sv.lh + 2 : 0;
	const word = status ? status.text : String((busy ? o.busy : o.free) ?? '') || (busy ? 'Busy' : 'Free');
	const bigBox: Box = { x: inner.x, y: inner.y, w: inner.w, h: Math.max(14, inner.h - detailH) };
	const fit = fitText(env, word, bigBox.w, bigBox.h, ORDER, true);
	drawLines(env, bigBox, fit.lines, fit.face, o.align, 'middle', color);
	if (detail.length) {
		const a: Align = o.align === 'center' ? 'center' : o.align === 'right' ? 'right' : 'left';
		const x = a === 'center' ? inner.x + inner.w / 2 : a === 'right' ? inner.x + inner.w : inner.x;
		const top = inner.y + inner.h - detail.length * sv.lh + sv.asc - sv.desc + 2;
		detail.forEach((ln, i) => d.text(x, top + i * sv.lh, i === 0 && !!now && o.title === true ? 'sb' : 's', ln, { align: a, color, maxW: inner.w }));
	}
}

// Japanese word of the day: the word big, its reading in kana under it, then romaji and the meaning.
function jpWordWidget(env: Env, w: Widget, o: Opts) {
	const { d, ctx } = env;
	const [word, kana, romaji, meaning] = wordOfDay(dayIdx(ctx.nowLocal));
	const a: Align = o.align === 'center' ? 'center' : o.align === 'right' ? 'right' : 'left';
	const x = a === 'center' ? w.x + w.w / 2 : a === 'right' ? w.x + w.w : w.x;
	const sv = vm(env, FACES.s);
	let top = w.y;
	if (o.label !== false) {
		d.text(x, top + sv.asc, 'sb', 'Word of the day', { align: a, maxW: w.w });
		top += sv.lh + 4;
	}
	// the lines under the word, from the bottom up
	const under: { text: string; role: 's' | 'sb' }[] = [];
	if (kana !== word) under.push({ text: kana, role: 's' });
	if (o.romaji !== false) under.push({ text: romaji, role: 's' });
	if (o.meaning !== false) under.push({ text: meaning, role: 'sb' });
	const underH = under.length * sv.lh;
	const bigBox: Box = { x: w.x, y: top, w: w.w, h: Math.max(16, w.y + w.h - top - underH - 2) };
	// at most three times the pixel font's size: bigger than that and the kanji turn to blocks
	const fit = fitText(env, word, bigBox.w, bigBox.h, ['xl', 'l', 'm', 's'], false);
	drawLines(env, bigBox, fit.lines.slice(0, 1), fit.face, a, 'middle', INK);
	let y = bigBox.y + bigBox.h + sv.asc - sv.desc + 4;
	for (const ln of under) {
		// the meaning stays English: it's what the word means, not a label to translate
		d.text(x, y, ln.role, ln.text, { align: a, maxW: w.w, raw: true });
		y += sv.lh;
	}
}

// Waiting room: the appointment happening now, big, then who's next today. Names are cut down to
// "Sam K." by default (src/lib/eink/waiting.ts) so a full name never shows to the room.
function queueWidget(env: Env, w: Widget, o: Opts) {
	const { d, ctx } = env;
	const style = (['short', 'first', 'full'].includes(String(o.names)) ? o.names : 'short') as NameStyle;
	const who = (e: CalEvent) => personName(e.title, style) || e.title;
	const today = dayIdx(ctx.nowLocal);
	const now = currentEvent(ctx);
	const later = ctx.events.filter((e) => !e.allDay && e.startLocal > ctx.nowLocal + 60 && dayIdx(e.startLocal) === today && e !== now);
	const a: Align = o.align === 'center' ? 'center' : o.align === 'right' ? 'right' : 'left';
	const xOf = (box: Box) => (a === 'center' ? box.x + box.w / 2 : a === 'right' ? box.x + box.w : box.x);
	const inner: Box = { x: w.x, y: w.y, w: w.w, h: w.h };
	if (!now && !later.length) {
		const fit = fitText(env, String(o.empty ?? '') || 'No more appointments today', inner.w, Math.min(inner.h, 90), ['l', 'm', 's'], true);
		drawLines(env, inner, fit.lines, fit.face, a, 'middle', INK);
		return;
	}
	// the big name: whoever is in now, or else whoever is first
	const big = now ?? later[0];
	const rest = now ? later : later.slice(1);
	const count = Math.max(0, Math.min(4, parseInt(String(o.count ?? '3'), 10) || 0));
	const shown = rest.slice(0, count);
	const sv = vm(env, FACES.s);
	const head = now ? String(o.now ?? '') || 'Now seeing' : `Next${o.times !== false ? ', at ' + hm(big.startLocal) : ''}`;
	const headH = sv.lh + 2;
	const listH = shown.length ? shown.length * (sv.lh + 2) + sv.lh + 12 : 0;
	d.text(xOf(inner), inner.y + sv.asc - sv.desc + 2, 'sb', head, { align: a, maxW: inner.w });
	const bigBox: Box = { x: inner.x, y: inner.y + headH, w: inner.w, h: Math.max(20, inner.h - headH - listH) };
	const fit = fitText(env, who(big), bigBox.w, bigBox.h, ORDER, true);
	drawLines(env, bigBox, fit.lines.slice(0, 2), fit.face, a, 'middle', INK);
	if (!shown.length) return;
	let y = bigBox.y + bigBox.h + 2;
	d.hline(Math.round(inner.x + (a === 'center' ? inner.w * 0.2 : 0)), Math.round(y), Math.round(a === 'center' ? inner.w * 0.6 : inner.w), INK);
	y += sv.asc - sv.desc + 13;
	d.text(xOf(inner), y, 'sb', 'Next', { align: a, maxW: inner.w });
	for (const e of shown) {
		y += sv.lh + 2;
		d.text(xOf(inner), y, 's', o.times !== false ? `${hm(e.startLocal)}  ${who(e)}` : who(e), { align: a, maxW: inner.w });
	}
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
			return textWidget(env, w, o, o.short === true ? dayAbbr(now.wday) : dayLong(now.wday));
		case 'month':
			return textWidget(env, w, o, isJa() ? (o.year === true ? monthYear(now) : monthLong(now.mon)) : `${o.short === true ? monthShort(now) : monthName(now)}${o.year === true ? ' ' + now.year : ''}`);
		case 'date_full': {
			const t = o.fmt === 'long' ? (isJa() ? `${dayMonth(now)} ${dayLong(now.wday)}` : `${DAY_NAMES[now.wday]} ${now.mday} ${monthName(now)}`) : o.fmt === 'num' ? `${pad2(now.mday)}/${pad2(now.mon + 1)}/${now.year}` : dateShort(now);
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
		case 'reminders':
			return reminderList(env.d, env.ctx, w, { bigToday: o.big === true, days: Number(o.days) || 7 });
		case 'jpword':
			return jpWordWidget(env, w, o);
		case 'birthdays':
			return birthdayList(env.d, env.ctx, w, { count: Number(o.count) || 4, days: Number(o.days) || 31, label: o.label !== false });
		case 'habits':
			return habitGrid(env.d, env.ctx, w, { days: Number(o.days) || 0, streak: o.streak !== false, letters: o.letters === true });
		case 'qr':
			return qrWidget(env, w, o);
		case 'messages':
			return messageList(env.d, env.ctx, w, { big: o.big === true, author: o.author === true, time: o.time === true });
		case 'list':
			return listWidget(env, w, o);
		case 'room_status':
			return roomStatusWidget(env, w, o);
		case 'queue':
			return queueWidget(env, w, o);
		case 'updated':
			return textWidget(env, w, o, `${String(o.prefix ?? '').trim()} ${hm(env.ctx.nowLocal)}`.trim());
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
		d.text(200, 188, 's', 'and choose "Edit this design".', { align: 'center', maxW: 380 });
		return d.toString();
	}
	for (const w of layout.widgets) {
		if (d.count > BUDGET) break;
		drawWidget(env, w);
	}
	return d.toString();
}
