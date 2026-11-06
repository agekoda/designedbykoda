// Builds the "draw list" the calendar firmware draws, and nothing else.
//
// WHY THIS EXISTS
//   The firmware used to contain every layout (where each word and line goes),
//   so a new layout meant reflashing every device. Now the firmware is a thin
//   drawing engine: it asks this server for "what to draw" every time it wakes
//   and draws exactly that. New layouts, tweaks and fonts are server changes.
//
// WIRE FORMAT (protocol "E2", plain text, one command per line, TAB separated)
//
//   E2<TAB><number of command lines><TAB><dark 0|1>
//   T<TAB>x<TAB>y<TAB>font<TAB>flags<TAB>maxW<TAB>text      text, baseline-left at x,y
//   H<TAB>x<TAB>y<TAB>len<TAB>c                              horizontal line
//   V<TAB>x<TAB>y<TAB>len<TAB>c                              vertical line
//   L<TAB>x0<TAB>y0<TAB>x1<TAB>y1<TAB>c                      any line
//   F<TAB>x<TAB>y<TAB>w<TAB>h<TAB>c                          filled rectangle
//   R<TAB>x<TAB>y<TAB>w<TAB>h<TAB>c                          rectangle outline
//   B<TAB>x<TAB>y<TAB>w<TAB>h<TAB>r<TAB>c                    filled rounded rectangle
//   b<TAB>x<TAB>y<TAB>w<TAB>h<TAB>r<TAB>c                    rounded rectangle outline
//   D<TAB>x<TAB>y<TAB>r<TAB>c                                filled circle
//   C<TAB>x<TAB>y<TAB>r<TAB>c                                circle outline
//   Z<TAB>x<TAB>y<TAB>len<TAB>step<TAB>c                     dotted horizontal line
//   I<TAB>x<TAB>y<TAB>w<TAB>h<TAB>c<TAB>base64               1-bit bitmap (row-padded, MSB first)
//
//   c is a colour: 0 = ink (black), 1 = paper (white). Dark mode swaps them on
//   the device, so layouts never have to think about it.
//
//   flags (T only):  bits 0-2 alignment, bit 3 inverted (paper-coloured text),
//   bit 4 fake bold (drawn twice, 1px apart, for fonts without a bold),
//   bit 5 ring (ink disc behind the text, for "today" in the mini calendar),
//   bits 6-8 text scale minus one.
//
//   maxW (T only): longer text is shortened with ".." so it fits in maxW px.
//   0 means no limit. For alignment 'box' it is the width of the box instead.
//
// The firmware ignores any command letter it doesn't know, so a newer server
// can add commands without breaking older devices.
import { fontId, type Family, type Role } from './fonts';
import { tr } from './i18n';
import { hasGlyph, hasJp, jpAscent, jpAdvance, jpBitmap } from './jp';
import { advanceOf } from './measure';

export type Color = 0 | 1;
export const INK: Color = 0;
export const PAPER: Color = 1;

// How the x position of a text command is used.
//   left    x is the left edge                    (the default)
//   center  x is the middle of the visible text
//   right   x is the right edge of the visible text
//   box     centred in a box that starts at x and is maxW wide (cursor based)
//   rawC    centred on x by cursor position (what the old Agenda used)
//   rawR    right end on x by cursor position (what the old Agenda used)
export type Align = 'left' | 'center' | 'right' | 'box' | 'rawC' | 'rawR';
const ALIGN_BITS: Record<Align, number> = { left: 0, center: 1, right: 2, box: 3, rawC: 4, rawR: 5 };

export interface TextOpts {
	align?: Align;
	color?: Color; // PAPER = inverted text, for use on ink-filled areas
	bold?: boolean; // fake bold, only for fonts that have no bold of their own
	ring?: boolean;
	scale?: number; // 1 to 4
	maxW?: number;
}

const MAX_TITLE_CHARS = 90;

// The firmware's fonts only have plain ASCII, so turn what people type in
// their calendars into the closest ASCII: "Cafe" for "Café", straight quotes,
// plain dashes. Anything with no ASCII equivalent (emoji, other scripts) is
// dropped. Tabs and newlines would break the wire format, so they become spaces.
const SPECIAL: Record<string, string> = {
	ß: 'ss', ø: 'o', Ø: 'O', æ: 'ae', Æ: 'AE', œ: 'oe', Œ: 'OE', đ: 'd', Đ: 'D', ł: 'l', Ł: 'L', þ: 'th', Þ: 'Th', ð: 'd', Ð: 'D', ı: 'i',
};
export function toAscii(input: string, tidy = false): string {
	let s = String(input ?? '');
	s = s.replace(/[ßøØæÆœŒđĐłŁþÞðÐı]/g, (c) => SPECIAL[c] ?? '');
	s = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
	s = s
		.replace(/[\u2018\u2019\u201A\u201B\u2032\u00B4`]/g, "'")
		.replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
		.replace(/[\u2010-\u2015\u2212]/g, '-')
		.replace(/\u2026/g, '...')
		.replace(/[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000]/g, ' ')
		.replace(/[\u00D7]/g, 'x');
	s = s.replace(/[^\x20-\x7E]/g, ' '); // also turns tabs and newlines into spaces
	if (tidy) {
		// For text people typed: squash runs of spaces, trim, and cap the length.
		s = s.replace(/ +/g, ' ').trim();
		if (s.length > MAX_TITLE_CHARS) s = s.slice(0, MAX_TITLE_CHARS).trim();
	}
	return s;
}

// Like toAscii, but keeps Japanese (kana, kanji, Japanese punctuation, full-width letters and digits), which
// the server draws itself (see jp.ts). For text the person typed into the dashboard (countdown name,
// layout builder text boxes). Event and task titles still go through toAscii.
export function cleanText(input: string, tidy = false): string {
	let out = '';
	for (const ch of String(input ?? '')) {
		const cp = ch.codePointAt(0)!;
		if (hasGlyph(cp)) {
			out += ch;
			continue;
		}
		const k = ch.normalize('NFKC'); // half-width katakana become full-width, and so on
		if (k !== ch && Array.from(k).every((c) => hasGlyph(c.codePointAt(0)!))) out += k;
		else out += toAscii(ch);
	}
	if (tidy) {
		out = out.replace(/ +/g, ' ').trim();
		if (out.length > MAX_TITLE_CHARS) out = out.slice(0, MAX_TITLE_CHARS).trim();
	}
	return out;
}

// An event title, made safe to draw. Never empty.
export function cleanTitle(input: string): string {
	return toAscii(input, true) || '(event)';
}

export class Draw {
	private lines: string[] = [];
	constructor(
		private family: Family,
		private dark: boolean,
	) {}

	private n(v: number): number {
		return Math.round(v);
	}

	// ---- text ----
	text(x: number, y: number, role: Role, s: string, o: TextOpts = {}): this {
		s = tr(s);
		if (hasJp(s)) return this.mixedText(x, y, role, s, o);
		const clean = toAscii(s);
		if (!clean.trim()) return this;
		const scale = Math.min(4, Math.max(1, Math.round(o.scale ?? 1)));
		const flags =
			ALIGN_BITS[o.align ?? 'left'] |
			(o.color === PAPER ? 8 : 0) |
			(o.bold ? 16 : 0) |
			(o.ring ? 32 : 0) |
			((scale - 1) << 6);
		this.lines.push(`T\t${this.n(x)}\t${this.n(y)}\t${fontId(this.family, role)}\t${flags}\t${this.n(o.maxW ?? 0)}\t${clean}`);
		return this;
	}

	// Text with Japanese in it. The firmware can't draw Japanese, so this lays the line out itself:
	// runs of Latin text become normal text commands, runs of Japanese become bitmaps (jp.ts), side by side
	// on the same baseline. Alignment and ".." shortening, which the firmware does for plain text, are done here.
	private mixedText(x: number, y: number, role: Role, s: string, o: TextOpts): this {
		const scale = Math.min(4, Math.max(1, Math.round(o.scale ?? 1)));
		const align = o.align ?? 'left';
		// one entry per character: Japanese ones as they are, everything else as plain ASCII
		let chars: { ch: string; jp: boolean; w: number }[] = [];
		for (const c of Array.from(s)) {
			if (hasGlyph(c.codePointAt(0)!)) chars.push({ ch: c, jp: true, w: jpAdvance(role, scale) });
			else for (const a of toAscii(c)) chars.push({ ch: a, jp: false, w: advanceOf(this.family, role, a, scale) });
		}
		const total = () => chars.reduce((n, c) => n + c.w, 0);
		const maxW = o.maxW ?? 0;
		if (maxW > 0 && align !== 'box' && total() > maxW) {
			const dotW = advanceOf(this.family, role, '.', scale) * 2;
			while (chars.length && total() + dotW > maxW) chars.pop();
			chars.push({ ch: '.', jp: false, w: dotW / 2 }, { ch: '.', jp: false, w: dotW / 2 });
		}
		if (!chars.some((c) => c.jp || c.ch.trim())) return this;
		const w = total();
		let cx = x;
		if (align === 'center' || align === 'rawC') cx = x - w / 2;
		else if (align === 'right' || align === 'rawR') cx = x - w;
		else if (align === 'box') cx = x + ((o.maxW ?? 0) - w) / 2;
		const colour: Color = o.color === PAPER ? PAPER : INK;
		const latinFlags = (o.color === PAPER ? 8 : 0) | (o.bold ? 16 : 0) | ((scale - 1) << 6);
		let i = 0;
		while (i < chars.length) {
			let j = i;
			let run = '';
			let rw = 0;
			while (j < chars.length && chars[j].jp === chars[i].jp) {
				run += chars[j].ch;
				rw += chars[j].w;
				j++;
			}
			if (chars[i].jp) {
				const bmp = jpBitmap(run, role, scale, o.bold === true);
				this.bitmapBytes(cx, y - jpAscent(role, scale), bmp.w, bmp.h, bmp.bytes, colour);
			} else if (run.trim()) {
				this.lines.push(`T\t${this.n(cx)}\t${this.n(y)}\t${fontId(this.family, role)}\t${latinFlags}\t0\t${run}`);
			}
			cx += rw;
			i = j;
		}
		return this;
	}

	// ---- lines and shapes ----
	hline(x: number, y: number, len: number, c: Color = INK): this {
		this.lines.push(`H\t${this.n(x)}\t${this.n(y)}\t${this.n(len)}\t${c}`);
		return this;
	}
	vline(x: number, y: number, len: number, c: Color = INK): this {
		this.lines.push(`V\t${this.n(x)}\t${this.n(y)}\t${this.n(len)}\t${c}`);
		return this;
	}
	line(x0: number, y0: number, x1: number, y1: number, c: Color = INK): this {
		this.lines.push(`L\t${this.n(x0)}\t${this.n(y0)}\t${this.n(x1)}\t${this.n(y1)}\t${c}`);
		return this;
	}
	fill(x: number, y: number, w: number, h: number, c: Color = INK): this {
		this.lines.push(`F\t${this.n(x)}\t${this.n(y)}\t${this.n(w)}\t${this.n(h)}\t${c}`);
		return this;
	}
	rect(x: number, y: number, w: number, h: number, c: Color = INK): this {
		this.lines.push(`R\t${this.n(x)}\t${this.n(y)}\t${this.n(w)}\t${this.n(h)}\t${c}`);
		return this;
	}
	fillRound(x: number, y: number, w: number, h: number, r: number, c: Color = INK): this {
		this.lines.push(`B\t${this.n(x)}\t${this.n(y)}\t${this.n(w)}\t${this.n(h)}\t${this.n(r)}\t${c}`);
		return this;
	}
	round(x: number, y: number, w: number, h: number, r: number, c: Color = INK): this {
		this.lines.push(`b\t${this.n(x)}\t${this.n(y)}\t${this.n(w)}\t${this.n(h)}\t${this.n(r)}\t${c}`);
		return this;
	}
	disc(x: number, y: number, r: number, c: Color = INK): this {
		this.lines.push(`D\t${this.n(x)}\t${this.n(y)}\t${this.n(r)}\t${c}`);
		return this;
	}
	circle(x: number, y: number, r: number, c: Color = INK): this {
		this.lines.push(`C\t${this.n(x)}\t${this.n(y)}\t${this.n(r)}\t${c}`);
		return this;
	}
	dots(x: number, y: number, len: number, step: number, c: Color = INK): this {
		this.lines.push(`Z\t${this.n(x)}\t${this.n(y)}\t${this.n(len)}\t${this.n(step)}\t${c}`);
		return this;
	}

	// ---- images ----
	// rows: one string per pixel row, '#' (or 'X', '1') = ink, anything else = paper.
	bitmap(x: number, y: number, rows: string[], c: Color = INK): this {
		const h = rows.length;
		const w = Math.max(...rows.map((r) => r.length));
		const stride = Math.ceil(w / 8);
		const bytes = new Uint8Array(stride * h);
		rows.forEach((row, yy) => {
			for (let xx = 0; xx < row.length; xx++) {
				if ('#X1'.includes(row[xx])) bytes[yy * stride + (xx >> 3)] |= 0x80 >> (xx & 7);
			}
		});
		return this.bitmapBytes(x, y, w, h, bytes, c);
	}
	// bytes: row-padded to whole bytes, most significant bit first, 1 = ink.
	bitmapBytes(x: number, y: number, w: number, h: number, bytes: Uint8Array, c: Color = INK): this {
		let bin = '';
		for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
		this.lines.push(`I\t${this.n(x)}\t${this.n(y)}\t${this.n(w)}\t${this.n(h)}\t${c}\t${btoa(bin)}`);
		return this;
	}

	// How many commands have been added so far (a draw list may hold at most 700).
	get count(): number {
		return this.lines.length;
	}

	toString(): string {
		const body = this.lines.length ? this.lines.join('\n') + '\n' : '';
		return `E2\t${this.lines.length}\t${this.dark ? 1 : 0}\n${body}`;
	}
}
