// Weather pictograms drawn as 1-bit images at any size, plus the wording for each weather code.
//
// Each icon is a few shapes (circles, rounded boxes, line segments, a bolt) described by
// distance functions in a 0..1 square. They are sampled 2x2 per dot so edges stay clean even
// at 24 dots. The result is packed 1 bit per dot (most significant bit first, 1 = ink), ready
// for Draw.bitmapBytes. Clouds are outlines, the sun and the rain are solid, so they read well
// on e-ink in both light and dark mode.
export type WxKind = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'thunder';

// Open-Meteo / WMO weather codes.
export function wxKind(code: number): WxKind {
	if (code <= 1) return 'clear';
	if (code === 2) return 'partly';
	if (code === 3) return 'cloudy';
	if (code === 45 || code === 48) return 'fog';
	if (code >= 51 && code <= 57) return 'drizzle';
	if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
	if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
	if (code >= 95) return 'thunder';
	return 'cloudy';
}

const LABELS: Record<number, string> = {
	0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Cloudy', 45: 'Fog', 48: 'Fog',
	51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle',
	61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain',
	71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
	80: 'Light showers', 81: 'Showers', 82: 'Heavy showers', 85: 'Snow showers', 86: 'Snow showers',
	95: 'Thunderstorm', 96: 'Thunder and hail', 99: 'Thunder and hail',
};
export const wxLabel = (code: number): string => LABELS[code] ?? 'Cloudy';

// ---- shapes (all in a 0..1 square) ----
type Sdf = (x: number, y: number) => number; // negative inside
const circ = (cx: number, cy: number, r: number): Sdf => (x, y) => Math.hypot(x - cx, y - cy) - r;
const seg = (x0: number, y0: number, x1: number, y1: number, half: number): Sdf => (x, y) => {
	const dx = x1 - x0, dy = y1 - y0;
	const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy || 1)));
	return Math.hypot(x - (x0 + t * dx), y - (y0 + t * dy)) - half;
};
const rbox = (cx: number, cy: number, hw: number, hh: number, r: number): Sdf => (x, y) => {
	const qx = Math.abs(x - cx) - (hw - r), qy = Math.abs(y - cy) - (hh - r);
	return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const poly = (pts: [number, number][]): Sdf => (x, y) => {
	let inside = false;
	for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
		const [xi, yi] = pts[i], [xj, yj] = pts[j];
		if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
	}
	return inside ? -1 : 1;
};
const union = (...f: Sdf[]): Sdf => (x, y) => Math.min(...f.map((g) => g(x, y)));
const cloud = (ox: number, oy: number, s: number): Sdf => {
	const base = union(circ(0.3, 0.58, 0.15), circ(0.5, 0.47, 0.2), circ(0.7, 0.59, 0.14), rbox(0.5, 0.655, 0.24, 0.095, 0.095));
	return (x, y) => base((x - ox) / s, (y - oy) / s) * s;
};

type Layer = { f: Sdf; mode: 'fill' | 'stroke' | 'erase'; grow?: number };

function layersFor(kind: WxKind, t: number): Layer[] {
	const half = t / 2;
	const rays = (cx: number, cy: number, r0: number, r1: number): Layer[] =>
		Array.from({ length: 8 }, (_, k) => {
			const a = (k * Math.PI) / 4;
			return { f: seg(cx + r0 * Math.cos(a), cy + r0 * Math.sin(a), cx + r1 * Math.cos(a), cy + r1 * Math.sin(a), half), mode: 'fill' as const };
		});
	const under = (kind2: 'rain' | 'drizzle' | 'snow' | 'thunder'): Layer[] => {
		const c = cloud(0.075, -0.07, 0.85);
		const out: Layer[] = [{ f: c, mode: 'stroke' }];
		const xs = [0.32, 0.5, 0.68];
		if (kind2 === 'rain') xs.forEach((x) => out.push({ f: seg(x, 0.76, x - 0.05, 0.9, half), mode: 'fill' }));
		if (kind2 === 'drizzle') xs.forEach((x, i) => out.push({ f: circ(x - 0.02, 0.82 + (i % 2) * 0.06, half * 1.15), mode: 'fill' }));
		if (kind2 === 'snow')
			xs.forEach((x, i) => {
				const cy = 0.83 + (i % 2) * 0.05;
				for (let k = 0; k < 3; k++) {
					const a = (k * Math.PI) / 3 + Math.PI / 6;
					out.push({ f: seg(x - 0.05 * Math.cos(a), cy - 0.05 * Math.sin(a), x + 0.05 * Math.cos(a), cy + 0.05 * Math.sin(a), half * 0.7), mode: 'fill' });
				}
			});
		if (kind2 === 'thunder')
			out.push({ f: poly([[0.56, 0.62], [0.36, 0.84], [0.49, 0.84], [0.42, 0.99], [0.66, 0.76], [0.52, 0.76], [0.6, 0.62]]), mode: 'fill' });
		return out;
	};
	switch (kind) {
		case 'clear':
			return [{ f: circ(0.5, 0.5, 0.2), mode: 'fill' }, ...rays(0.5, 0.5, 0.3, 0.43)];
		case 'partly':
			return [
				{ f: circ(0.36, 0.38, 0.15), mode: 'fill' },
				...rays(0.36, 0.38, 0.22, 0.32),
				{ f: cloud(0.17, 0.12, 0.8), mode: 'erase', grow: 0.035 },
				{ f: cloud(0.17, 0.12, 0.8), mode: 'stroke' },
			];
		case 'cloudy':
			return [
				{ f: cloud(0.02, -0.1, 0.62), mode: 'stroke' },
				{ f: cloud(0.02, 0.0, 1), mode: 'erase', grow: 0.04 },
				{ f: cloud(0.02, 0.0, 1), mode: 'stroke' },
			];
		case 'fog':
			return [
				[0.15, 0.85, 0.3], [0.25, 0.9, 0.46], [0.12, 0.75, 0.62], [0.3, 0.85, 0.78],
			].map(([a, b, y]) => ({ f: seg(a, y, b, y, half), mode: 'fill' as const }));
		default:
			return under(kind);
	}
}

export function weatherBits(kind: WxKind, size: number): Uint8Array {
	const n = Math.max(8, Math.round(size));
	const t = Math.max(1.5, n * 0.06) / n; // line thickness in 0..1 units
	const layers = layersFor(kind, t);
	const stride = Math.ceil(n / 8);
	const out = new Uint8Array(stride * n);
	const ink = (x: number, y: number): boolean => {
		let on = false;
		for (const l of layers) {
			const v = l.f(x, y);
			if (l.mode === 'fill') { if (v < 0) on = true; }
			else if (l.mode === 'stroke') { if (Math.abs(v) <= t / 2) on = true; }
			else if (v < (l.grow ?? 0)) on = false;
		}
		return on;
	};
	for (let py = 0; py < n; py++) {
		for (let px = 0; px < n; px++) {
			let hits = 0;
			for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) if (ink((px + (sx + 0.5) / 2) / n, (py + (sy + 0.5) / 2) / n)) hits++;
			if (hits >= 2) out[py * stride + (px >> 3)] |= 0x80 >> (px & 7);
		}
	}
	return out;
}
