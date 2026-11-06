// Measures text exactly the way the calendar will draw it (same glyph widths as
// Adafruit_GFX's getTextBounds), so layouts can leave the right amount of room
// whatever font is chosen. Used on the server; no drawing happens here.
import { METRICS } from './metrics';
import { fontId, type Family, type Role } from './fonts';
import { tr } from './i18n';
import { hasGlyph, jpAdvance } from './jp';

export interface Bounds {
	x1: number; // left edge of the visible ink, relative to where drawing starts
	w: number; // visible width
	right: number; // x1 + w
}

export function measure(family: Family, role: Role, s: string, scale = 1): Bounds {
	s = tr(s);
	const id = fontId(family, role);
	const m = METRICS[id] ?? METRICS[fontId('sans', role)];
	if (!m) return { x1: 0, w: s.length * 8 * scale, right: s.length * 8 * scale };
	let x = 0;
	let minx = 0x7fff;
	let maxx = -1;
	const jw = jpAdvance(role, scale);
	for (let i = 0; i < s.length; i++) {
		const code = s.charCodeAt(i);
		if (code > 0x7f && hasGlyph(code)) {
			// a Japanese character: a square cell (drawn as a bitmap, see jp.ts)
			if (x < minx) minx = x;
			if (x + jw - 1 > maxx) maxx = x + jw - 1;
			x += jw;
			continue;
		}
		const ch = code & 255;
		if (ch < m.f || ch > m.l) continue;
		const k = (ch - m.f) * 3;
		const w = m.g[k];
		const xa = m.g[k + 1];
		const xo = m.g[k + 2];
		const x1 = x + xo * scale;
		const x2 = x1 + w * scale - 1;
		if (x1 < minx) minx = x1;
		if (x2 > maxx) maxx = x2;
		x += xa * scale;
	}
	if (maxx < minx) return { x1: 0, w: 0, right: 0 };
	return { x1: minx, w: maxx - minx + 1, right: maxx + 1 };
}

// How far the drawing position moves for one character (what a cursor would advance).
export function advanceOf(family: Family, role: Role, ch: string, scale = 1): number {
	const code = ch.charCodeAt(0);
	if (code > 0x7f && hasGlyph(code)) return jpAdvance(role, scale);
	const m = METRICS[fontId(family, role)] ?? METRICS[fontId('sans', role)];
	const c = code & 255;
	if (!m || c < m.f || c > m.l) return 0;
	return m.g[(c - m.f) * 3 + 1] * scale;
}

// The first of `options` that fits in `maxW` pixels (the last one if none do).
export function firstThatFits(family: Family, role: Role, options: string[], maxW: number, scale = 1): string {
	for (const o of options) if (measure(family, role, o, scale).w <= maxW) return o;
	return options[options.length - 1];
}

// Splits text into lines no wider than maxW, breaking at spaces. A single word wider than
// maxW is kept whole on its own line (the firmware cuts it with ".." if it still doesn't fit).
export function wrapText(family: Family, role: Role, text: string, maxW: number, scale = 1): string[] {
	text = tr(text);
	// Pieces that may start a line: a word, or a single Japanese character (Japanese has no spaces to break at).
	const parts = text.match(/[^\s\x00-\x7f]|[^\s]+?(?=[^\x00-\x7f]|\s|$)|\s+/g) ?? [];
	const lines: string[] = [];
	let cur = '';
	let gap = false;
	for (const p of parts) {
		if (/^\s+$/.test(p)) {
			gap = true;
			continue;
		}
		const t = cur ? cur + (gap ? ' ' : '') + p : p;
		gap = false;
		if (!cur || measure(family, role, t, scale).w <= maxW) cur = t;
		else {
			lines.push(cur);
			cur = p;
		}
	}
	if (cur) lines.push(cur);
	return lines;
}
