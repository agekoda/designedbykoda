// Japanese text, drawn as pictures.
//
// The calendar's own fonts only have plain ASCII, so for Japanese the server draws the characters itself
// and sends them as 1-bit bitmaps (the "I" command, which every device already understands). The glyphs
// are in jpGlyphs.ts (made by tools/make_jp_font.py):
//   16 px  DotGothic16        for body text  (roles s, sb)
//   12 px  Fusion Pixel 12px  drawn at 2x (24 px) for headings (m, mb) and 3x (36 px) for big text (bb)
// Both are SIL Open Font License 1.1; see public/eink/JP-FONT-LICENSE.txt.
import { JP12_ASCENT, JP12_B64, JP16_ASCENT, JP16_B64 } from './jpGlyphs';
import type { Role } from './fonts';

interface Table {
	size: number; // the font's own pixel size (16 or 12)
	rec: number; // bytes per record
	data: Uint8Array;
	n: number;
	asc: number; // rows above the baseline
}

function unb64(b: string): Uint8Array {
	const bin = atob(b);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

const tables: Partial<Record<16 | 12, Table>> = {};
function table(size: 16 | 12): Table {
	let t = tables[size];
	if (!t) {
		const data = unb64(size === 16 ? JP16_B64 : JP12_B64);
		const rec = size === 16 ? 34 : 26;
		t = { size, rec, data, n: data.length / rec, asc: size === 16 ? JP16_ASCENT : JP12_ASCENT };
		tables[size] = t;
	}
	return t;
}

// Index of a code point's record in a table, or -1 if the font has no such character.
function find(t: Table, cp: number): number {
	let lo = 0;
	let hi = t.n - 1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		const o = mid * t.rec;
		const v = (t.data[o] << 8) | t.data[o + 1];
		if (v === cp) return mid;
		if (v < cp) lo = mid + 1;
		else hi = mid - 1;
	}
	return -1;
}

// True for a character the Japanese font can draw (kana, kanji, Japanese punctuation, full-width forms).
export function hasGlyph(cp: number): boolean {
	return cp > 0x7f && cp < 0x10000 && find(table(16), cp) >= 0;
}
export function hasJp(s: string): boolean {
	for (let i = 0; i < s.length; i++) if (hasGlyph(s.charCodeAt(i))) return true;
	return false;
}

export interface JpSpec {
	size: 16 | 12;
	k: number; // whole-number enlargement of that font
	bold: boolean;
}
// Which Japanese font a text role uses. Roughly matches the cap height of the Latin role next to it.
export function specFor(role: Role): JpSpec {
	switch (role) {
		case 's':
			return { size: 16, k: 1, bold: false };
		case 'sb':
			return { size: 16, k: 1, bold: true };
		case 'm':
			return { size: 12, k: 2, bold: false };
		case 'mb':
			return { size: 12, k: 2, bold: true };
		default:
			return { size: 12, k: 3, bold: true };
	}
}

// Width of one Japanese character (they are all square), for a role at a text scale.
export function jpAdvance(role: Role, scale = 1): number {
	const sp = specFor(role);
	return sp.size * sp.k * scale;
}
// Pixels from the top of the cell to the baseline, and the cell height.
// The glyphs sit a little lower than their true baseline, so their tops line up with the Latin capitals
// beside them (Japanese characters have no real baseline; the Latin text is shorter than they are tall).
const SINK: Record<string, number> = { s: 2, sb: 2, m: 3, mb: 3, bb: 0 };
export function jpAscent(role: Role, scale = 1): number {
	const sp = specFor(role);
	return (table(sp.size).asc * sp.k - (SINK[role] ?? 0)) * scale;
}
export function jpHeight(role: Role, scale = 1): number {
	return jpAdvance(role, scale);
}

// Draws a run of Japanese characters into a row-padded 1-bit bitmap (1 = ink).
// `bold` thickens every stroke by one font pixel.
export function jpBitmap(text: string, role: Role, scale = 1, bold = false): { w: number; h: number; bytes: Uint8Array } {
	const sp = specFor(role);
	const t = table(sp.size);
	const k = sp.k * scale;
	const chars = Array.from(text);
	const cell = sp.size * k;
	const thick = bold || sp.bold ? scale : 0; // bold = every stroke one pixel wider
	const w = chars.length * cell + thick;
	const h = cell;
	const stride = Math.ceil(w / 8);
	const bytes = new Uint8Array(stride * h);
	const set = (x: number, y: number) => {
		bytes[y * stride + (x >> 3)] |= 0x80 >> (x & 7);
	};
	chars.forEach((ch, ci) => {
		const idx = find(t, ch.codePointAt(0)!);
		if (idx < 0) return;
		const base = idx * t.rec + 2;
		for (let gy = 0; gy < sp.size; gy++) {
			const row = (t.data[base + gy * 2] << 8) | t.data[base + gy * 2 + 1];
			if (!row) continue;
			for (let gx = 0; gx < sp.size; gx++) {
				if (!(row & (0x8000 >> gx))) continue;
				for (let dy = 0; dy < k; dy++) {
					for (let dx = 0; dx < k + thick; dx++) set(ci * cell + gx * k + dx, gy * k + dy);
				}
			}
		}
	});
	return { w, h, bytes };
}
