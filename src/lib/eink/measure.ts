// Measures text exactly the way the calendar will draw it (same glyph widths as
// Adafruit_GFX's getTextBounds), so layouts can leave the right amount of room
// whatever font is chosen. Used on the server; no drawing happens here.
import { METRICS } from './metrics';
import { fontId, type Family, type Role } from './fonts';

export interface Bounds {
	x1: number; // left edge of the visible ink, relative to where drawing starts
	w: number; // visible width
	right: number; // x1 + w
}

export function measure(family: Family, role: Role, s: string, scale = 1): Bounds {
	const id = fontId(family, role);
	const m = METRICS[id] ?? METRICS[fontId('sans', role)];
	if (!m) return { x1: 0, w: s.length * 8 * scale, right: s.length * 8 * scale };
	let x = 0;
	let minx = 0x7fff;
	let maxx = -1;
	for (let i = 0; i < s.length; i++) {
		const ch = s.charCodeAt(i) & 255;
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

// The first of `options` that fits in `maxW` pixels (the last one if none do).
export function firstThatFits(family: Family, role: Role, options: string[], maxW: number, scale = 1): string {
	for (const o of options) if (measure(family, role, o, scale).w <= maxW) return o;
	return options[options.length - 1];
}
