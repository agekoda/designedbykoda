// A software copy of what the calendar's firmware does with a draw list, so the
// dashboard can show exactly what the e-ink screen will look like, live, in the
// browser. It follows draw_list.h (the firmware side) and Adafruit_GFX line for
// line, so the pictures match the real display pixel for pixel.
//
// No DOM in here: it works on a plain array, and the page paints that to a canvas.

export const SCREEN_W = 400;
export const SCREEN_H = 300;

export interface PreviewFont {
	f: number; // first character
	l: number; // last character
	y: number; // yAdvance
	g: number[]; // 6 numbers per glyph: bitmapOffset, width, height, xAdvance, xOffset, yOffset
	b: string; // base64 glyph bitmap
}
export interface FontPack {
	families: string[];
	fonts: Record<string, PreviewFont>;
}
interface LoadedFont extends Omit<PreviewFont, 'b'> {
	bits: Uint8Array;
}

export function loadFontPack(pack: FontPack): Map<number, LoadedFont> {
	const out = new Map<number, LoadedFont>();
	for (const [id, f] of Object.entries(pack.fonts)) {
		const bin = atob(f.b);
		const bits = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) bits[i] = bin.charCodeAt(i);
		out.set(Number(id), { f: f.f, l: f.l, y: f.y, g: f.g, bits });
	}
	return out;
}

export interface Rendered {
	px: Uint8Array; // SCREEN_W * SCREEN_H, 1 = white, 0 = black, exactly as the panel shows it
	dark: boolean;
	ok: boolean; // false if the draw list was not valid (the real device would ignore it too)
}

// The firmware's dl_validate(): the list must be complete before anything is drawn.
export function validate(text: string): { ok: boolean; dark: boolean } {
	if (text.length < 6 || text[0] !== 'E' || text[1] !== '2' || text[2] !== '\t') return { ok: false, dark: false };
	const nl = text.indexOf('\n');
	if (nl < 0) return { ok: false, dark: false };
	const head = text.slice(3, nl).split('\t');
	const n = parseInt(head[0], 10);
	const d = parseInt(head[1], 10);
	if (!(n >= 0 && n <= 700)) return { ok: false, dark: false };
	let lines = 0;
	for (let i = nl + 1; i < text.length; i++) if (text.charCodeAt(i) === 10) lines++;
	if (text[text.length - 1] !== '\n' && n !== 0) return { ok: false, dark: false };
	if (lines !== n) return { ok: false, dark: false };
	return { ok: true, dark: d !== 0 };
}

const i16 = (v: number) => (v > 4000 ? 4000 : v < -4000 ? -4000 : v | 0);
// Reads one tab separated whole number, the way dl_num does.
class Cursor {
	constructor(
		public s: string,
		public p: number,
	) {}
	num(): number {
		const s = this.s;
		while (this.p < s.length && s[this.p] === '\t') this.p++;
		let neg = false;
		if (s[this.p] === '-') {
			neg = true;
			this.p++;
		}
		let v = 0;
		while (this.p < s.length && s[this.p] >= '0' && s[this.p] <= '9') {
			v = v * 10 + (s.charCodeAt(this.p) - 48);
			if (v > 1000000) v = 1000000;
			this.p++;
		}
		while (this.p < s.length && s[this.p] !== '\t') this.p++;
		if (s[this.p] === '\t') this.p++;
		return neg ? -v : v;
	}
}

class Gfx {
	px = new Uint8Array(SCREEN_W * SCREEN_H);
	font: LoadedFont | null = null;
	size = 1;
	color = 0;
	cx = 0;
	cy = 0;

	pixel(x: number, y: number, c: number) {
		if (x < 0 || y < 0 || x >= SCREEN_W || y >= SCREEN_H) return;
		this.px[y * SCREEN_W + x] = c;
	}
	line(x0: number, y0: number, x1: number, y1: number, c: number) {
		const steep = Math.abs(y1 - y0) > Math.abs(x1 - x0);
		if (steep) [x0, y0, x1, y1] = [y0, x0, y1, x1];
		if (x0 > x1) [x0, x1, y0, y1] = [x1, x0, y1, y0];
		const dx = x1 - x0;
		const dy = Math.abs(y1 - y0);
		let err = Math.trunc(dx / 2);
		const ystep = y0 < y1 ? 1 : -1;
		for (; x0 <= x1; x0++) {
			if (steep) this.pixel(y0, x0, c);
			else this.pixel(x0, y0, c);
			err -= dy;
			if (err < 0) {
				y0 += ystep;
				err += dx;
			}
		}
	}
	vline(x: number, y: number, h: number, c: number) {
		this.line(x, y, x, y + h - 1, c);
	}
	hline(x: number, y: number, w: number, c: number) {
		this.line(x, y, x + w - 1, y, c);
	}
	fillRect(x: number, y: number, w: number, h: number, c: number) {
		for (let i = x; i < x + w; i++) this.vline(i, y, h, c);
	}
	drawRect(x: number, y: number, w: number, h: number, c: number) {
		this.hline(x, y, w, c);
		this.hline(x, y + h - 1, w, c);
		this.vline(x, y, h, c);
		this.vline(x + w - 1, y, h, c);
	}
	circle(x0: number, y0: number, r: number, c: number) {
		let f = 1 - r;
		let ddx = 1;
		let ddy = -2 * r;
		let x = 0;
		let y = r;
		this.pixel(x0, y0 + r, c);
		this.pixel(x0, y0 - r, c);
		this.pixel(x0 + r, y0, c);
		this.pixel(x0 - r, y0, c);
		while (x < y) {
			if (f >= 0) {
				y--;
				ddy += 2;
				f += ddy;
			}
			x++;
			ddx += 2;
			f += ddx;
			this.pixel(x0 + x, y0 + y, c);
			this.pixel(x0 - x, y0 + y, c);
			this.pixel(x0 + x, y0 - y, c);
			this.pixel(x0 - x, y0 - y, c);
			this.pixel(x0 + y, y0 + x, c);
			this.pixel(x0 - y, y0 + x, c);
			this.pixel(x0 + y, y0 - x, c);
			this.pixel(x0 - y, y0 - x, c);
		}
	}
	circleHelper(x0: number, y0: number, r: number, corner: number, c: number) {
		let f = 1 - r;
		let ddx = 1;
		let ddy = -2 * r;
		let x = 0;
		let y = r;
		while (x < y) {
			if (f >= 0) {
				y--;
				ddy += 2;
				f += ddy;
			}
			x++;
			ddx += 2;
			f += ddx;
			if (corner & 4) {
				this.pixel(x0 + x, y0 + y, c);
				this.pixel(x0 + y, y0 + x, c);
			}
			if (corner & 2) {
				this.pixel(x0 + x, y0 - y, c);
				this.pixel(x0 + y, y0 - x, c);
			}
			if (corner & 8) {
				this.pixel(x0 - y, y0 + x, c);
				this.pixel(x0 - x, y0 + y, c);
			}
			if (corner & 1) {
				this.pixel(x0 - y, y0 - x, c);
				this.pixel(x0 - x, y0 - y, c);
			}
		}
	}
	fillCircleHelper(x0: number, y0: number, r: number, corners: number, delta: number, c: number) {
		let f = 1 - r;
		let ddx = 1;
		let ddy = -2 * r;
		let x = 0;
		let y = r;
		let px = x;
		let py = y;
		delta++;
		while (x < y) {
			if (f >= 0) {
				y--;
				ddy += 2;
				f += ddy;
			}
			x++;
			ddx += 2;
			f += ddx;
			if (x < y + 1) {
				if (corners & 1) this.vline(x0 + x, y0 - y, 2 * y + delta, c);
				if (corners & 2) this.vline(x0 - x, y0 - y, 2 * y + delta, c);
			}
			if (y !== py) {
				if (corners & 1) this.vline(x0 + py, y0 - px, 2 * px + delta, c);
				if (corners & 2) this.vline(x0 - py, y0 - px, 2 * px + delta, c);
				py = y;
			}
			px = x;
		}
	}
	fillCircle(x0: number, y0: number, r: number, c: number) {
		this.vline(x0, y0 - r, 2 * r + 1, c);
		this.fillCircleHelper(x0, y0, r, 3, 0, c);
	}
	drawRoundRect(x: number, y: number, w: number, h: number, r: number, c: number) {
		const maxr = Math.trunc(Math.min(w, h) / 2);
		if (r > maxr) r = maxr;
		this.hline(x + r, y, w - 2 * r, c);
		this.hline(x + r, y + h - 1, w - 2 * r, c);
		this.vline(x, y + r, h - 2 * r, c);
		this.vline(x + w - 1, y + r, h - 2 * r, c);
		this.circleHelper(x + r, y + r, r, 1, c);
		this.circleHelper(x + w - r - 1, y + r, r, 2, c);
		this.circleHelper(x + w - r - 1, y + h - r - 1, r, 4, c);
		this.circleHelper(x + r, y + h - r - 1, r, 8, c);
	}
	fillRoundRect(x: number, y: number, w: number, h: number, r: number, c: number) {
		const maxr = Math.trunc(Math.min(w, h) / 2);
		if (r > maxr) r = maxr;
		this.fillRect(x + r, y, w - 2 * r, h, c);
		this.fillCircleHelper(x + w - r - 1, y + r, r, 1, h - 2 * r - 1, c);
		this.fillCircleHelper(x + r, y + r, r, 2, h - 2 * r - 1, c);
	}

	// ---- text (Adafruit_GFX with a custom font) ----
	private glyph(ch: number) {
		const f = this.font!;
		if (ch < f.f || ch > f.l) return null;
		const i = (ch - f.f) * 6;
		const g = f.g;
		// xOffset / yOffset are signed bytes in the font data
		const sb = (v: number) => (v > 127 ? v - 256 : v);
		return { bo: g[i], w: g[i + 1], h: g[i + 2], xa: g[i + 3], xo: sb(g[i + 4]), yo: sb(g[i + 5]) };
	}
	bounds(s: string, x: number, y: number) {
		let minx = 0x7fff;
		let miny = 0x7fff;
		let maxx = -1;
		let maxy = -1;
		const f = this.font;
		const size = this.size;
		if (f) {
			for (let k = 0; k < s.length; k++) {
				const ch = s.charCodeAt(k) & 255;
				if (ch === 10) {
					x = 0;
					y += size * f.y;
				} else if (ch !== 13) {
					const g = this.glyph(ch);
					if (!g) continue;
					if (x + (g.xo + g.w) * size > SCREEN_W) {
						x = 0;
						y += size * f.y;
					}
					const x1 = x + g.xo * size;
					const y1 = y + g.yo * size;
					const x2 = x1 + g.w * size - 1;
					const y2 = y1 + g.h * size - 1;
					if (x1 < minx) minx = x1;
					if (y1 < miny) miny = y1;
					if (x2 > maxx) maxx = x2;
					if (y2 > maxy) maxy = y2;
					x += g.xa * size;
				}
			}
		}
		let x1 = x;
		let y1 = y;
		let w = 0;
		let h = 0;
		if (maxx >= minx) {
			x1 = minx;
			w = maxx - minx + 1;
		}
		if (maxy >= miny) {
			y1 = miny;
			h = maxy - miny + 1;
		}
		return { x1, y1, w, h };
	}
	private drawChar(x: number, y: number, ch: number) {
		const f = this.font!;
		const g = this.glyph(ch);
		if (!g) return;
		const size = this.size;
		let bo = g.bo;
		let bits = 0;
		let bit = 0;
		for (let yy = 0; yy < g.h; yy++) {
			for (let xx = 0; xx < g.w; xx++) {
				if (!(bit++ & 7)) bits = f.bits[bo++] ?? 0;
				if (bits & 0x80) {
					if (size === 1) this.pixel(x + g.xo + xx, y + g.yo + yy, this.color);
					else this.fillRect(x + (g.xo + xx) * size, y + (g.yo + yy) * size, size, size, this.color);
				}
				bits = (bits << 1) & 255;
			}
		}
	}
	print(s: string) {
		const f = this.font;
		if (!f) return;
		for (let k = 0; k < s.length; k++) {
			const ch = s.charCodeAt(k) & 255;
			if (ch === 10) {
				this.cx = 0;
				this.cy += this.size * f.y;
			} else if (ch !== 13) {
				const g = this.glyph(ch);
				if (!g) continue;
				if (g.w > 0 && g.h > 0) {
					if (this.cx + this.size * (g.xo + g.w) > SCREEN_W) {
						this.cx = 0;
						this.cy += this.size * f.y;
					}
					this.drawChar(this.cx, this.cy, ch);
				}
				this.cx += g.xa * this.size;
			}
		}
	}
}

const MAX_TEXT = 120;

// Shortens s with ".." until it fits in maxW pixels (dl_fit).
function fit(g: Gfx, s: string, maxW: number): string {
	let b = g.bounds(s, 0, 0);
	if (b.x1 + b.w <= maxW) return s;
	let n = s.length;
	while (n > 0) {
		n--;
		let t = s.slice(0, n);
		t = t.replace(/^ +/, '').replace(/ +$/, '');
		t += '..';
		b = g.bounds(t, 0, 0);
		if (b.x1 + b.w <= maxW) return t;
	}
	return '';
}

function b64bytes(s: string, need: number): Uint8Array {
	const out = new Uint8Array(need);
	let o = 0;
	let acc = 0;
	let nb = 0;
	const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
	for (let i = 0; i < s.length && o < need; i++) {
		const v = A.indexOf(s[i]);
		if (v < 0) continue;
		acc = ((acc << 6) | v) & 0xffffff;
		nb += 6;
		if (nb >= 8) {
			nb -= 8;
			out[o++] = (acc >> nb) & 255;
		}
	}
	return out;
}

// What was drawn where, for automatic layout checks (see tools/check-layouts).
export interface Trace {
	texts: { x: number; y: number; w: number; h: number; txt: string }[];
	lines: { x: number; y: number; w: number; h: number }[]; // H / V rules
	fills: { x: number; y: number; w: number; h: number }[]; // F bars and I pictures
}

// Draws a draw list the way the calendar does. `fonts` comes from loadFontPack().
export function renderDrawList(text: string, fonts: Map<number, LoadedFont>, trace?: Trace): Rendered {
	const v = validate(text);
	const g = new Gfx();
	if (!v.ok) {
		g.px.fill(1);
		return { px: g.px, dark: false, ok: false };
	}
	const ink = v.dark ? 1 : 0;
	const paper = v.dark ? 0 : 1;
	g.px.fill(paper);
	const col = (c: number) => (c ? paper : ink);
	const pickFont = (id: number): LoadedFont | null => fonts.get(id) ?? fonts.get(id & 7) ?? null;

	const nl = text.indexOf('\n');
	let p = nl + 1;
	while (p < text.length) {
		let eol = text.indexOf('\n', p);
		if (eol < 0) eol = text.length;
		if (eol === p) {
			p = eol + 1;
			continue;
		}
		const op = text[p];
		let q = p + 1;
		if (q < eol && text[q] === '\t') q++;
		const cur = new Cursor(text.slice(0, eol), q);
		switch (op) {
			case 'T': {
				const x = i16(cur.num());
				const y = i16(cur.num());
				const fontId = cur.num();
				const flags = cur.num();
				let maxW = cur.num();
				if (maxW > 400) maxW = 400;
				let txt = text.slice(cur.p, eol);
				if (txt.length > MAX_TEXT) txt = txt.slice(0, MAX_TEXT);
				drawText(g, x, y, pickFont(fontId), flags, maxW, txt, ink, paper, trace);
				break;
			}
			case 'H': { const x = i16(cur.num()), y = i16(cur.num()), l = i16(cur.num()), c = cur.num(); g.hline(x, y, l, col(c)); trace?.lines.push({ x, y, w: l, h: 1 }); break; }
			case 'V': { const x = i16(cur.num()), y = i16(cur.num()), l = i16(cur.num()), c = cur.num(); g.vline(x, y, l, col(c)); trace?.lines.push({ x, y, w: 1, h: l }); break; }
			case 'L': { const a = i16(cur.num()), b = i16(cur.num()), c2 = i16(cur.num()), d = i16(cur.num()), c = cur.num(); g.line(a, b, c2, d, col(c)); break; }
			case 'F': { const x = i16(cur.num()), y = i16(cur.num()), w = i16(cur.num()), h = i16(cur.num()), c = cur.num(); g.fillRect(x, y, w, h, col(c)); if (!c) trace?.fills.push({ x, y, w, h }); break; }
			case 'R': { const x = i16(cur.num()), y = i16(cur.num()), w = i16(cur.num()), h = i16(cur.num()), c = cur.num(); g.drawRect(x, y, w, h, col(c)); break; }
			case 'B': { const x = i16(cur.num()), y = i16(cur.num()), w = i16(cur.num()), h = i16(cur.num()), r = i16(cur.num()), c = cur.num(); g.fillRoundRect(x, y, w, h, r, col(c)); break; }
			case 'b': { const x = i16(cur.num()), y = i16(cur.num()), w = i16(cur.num()), h = i16(cur.num()), r = i16(cur.num()), c = cur.num(); g.drawRoundRect(x, y, w, h, r, col(c)); break; }
			case 'D': { const x = i16(cur.num()), y = i16(cur.num()), r = i16(cur.num()), c = cur.num(); g.fillCircle(x, y, r, col(c)); break; }
			case 'C': { const x = i16(cur.num()), y = i16(cur.num()), r = i16(cur.num()), c = cur.num(); g.circle(x, y, r, col(c)); break; }
			case 'Z': {
				const x = i16(cur.num()), y = i16(cur.num());
				let l = cur.num();
				let step = cur.num();
				const c = cur.num();
				if (step < 1) step = 1;
				if (l > 1000) l = 1000;
				for (let i = 0; i < l; i += step) g.pixel(x + i, y, col(c));
				break;
			}
			case 'I': {
				const x = i16(cur.num()), y = i16(cur.num());
				const w = cur.num(), h = cur.num(), c = cur.num();
				if (w > 0 && h > 0 && w <= 400 && h <= 300) {
					trace?.fills.push({ x, y, w, h });
					const stride = (w + 7) >> 3;
					const bits = b64bytes(text.slice(cur.p, eol), stride * h);
					for (let yy = 0; yy < h; yy++)
						for (let xx = 0; xx < w; xx++)
							if (bits[yy * stride + (xx >> 3)] & (0x80 >> (xx & 7))) g.pixel(x + xx, y + yy, col(c));
				}
				break;
			}
			default:
				break;
		}
		p = eol + 1;
	}
	return { px: g.px, dark: v.dark, ok: true };
}

function drawText(g: Gfx, x: number, y: number, font: LoadedFont | null, flags: number, maxW: number, txt: string, ink: number, paper: number, trace?: Trace) {
	const align = flags & 7;
	const inv = !!(flags & 8);
	const bold = !!(flags & 16);
	const ring = !!(flags & 32);
	let scale = ((flags >> 6) & 7) + 1;
	if (scale > 4) scale = 4;

	g.font = font;
	g.size = scale;
	if (maxW > 0 && align !== 3) txt = fit(g, txt, maxW);
	if (!txt) {
		g.size = 1;
		return;
	}
	const b = g.bounds(txt, 0, 0);
	let cx = x;
	switch (align) {
		case 1: cx = x - b.x1 - Math.trunc(b.w / 2); break;
		case 2: cx = x - (b.x1 + b.w); break;
		case 3: cx = x + Math.trunc((maxW - b.w) / 2); break;
		case 4: cx = x - Math.trunc(b.w / 2); break;
		case 5: cx = x - b.w; break;
		default: break;
	}
	const color = inv || ring ? paper : ink;
	if (ring) {
		const t = g.bounds(txt, cx, y);
		const rad = Math.trunc(Math.max(t.w, t.h) / 2) + 3;
		g.fillCircle(t.x1 + Math.trunc(t.w / 2), t.y1 + Math.trunc(t.h / 2), rad, ink);
	}
	if (trace) {
		const t = g.bounds(txt, cx, y);
		trace.texts.push({ x: t.x1, y: t.y1, w: t.w + (bold ? 1 : 0), h: t.h, txt });
	}
	g.color = color;
	g.cx = cx;
	g.cy = y;
	g.print(txt);
	if (bold) {
		g.cx = cx + 1;
		g.cy = y;
		g.print(txt);
	}
	g.size = 1;
}
