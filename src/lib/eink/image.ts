// Turning a photo into the 1-bit picture the calendar draws in its corner.
// Pure maths on arrays (no DOM), so it runs the same in the browser editor and
// in tests. The browser crops the photo to CORNER.w x CORNER.h greyscale, hands
// it to processImage(), and uploads the packed bits.

// Where the picture goes on the Agenda layout (the mini calendar's spot).
export const CORNER = { x: 208, y: 4, w: 184, h: 140 } as const;
export const CORNER_STRIDE = Math.ceil(CORNER.w / 8);
export const CORNER_BYTES = CORNER_STRIDE * CORNER.h;

// The Photo frame layout: the picture fills the whole 400 x 300 screen.
export const FRAME = { x: 0, y: 0, w: 400, h: 300 } as const;
export const FRAME_STRIDE = Math.ceil(FRAME.w / 8);
export const FRAME_BYTES = FRAME_STRIDE * FRAME.h;

export type Dither = 'floyd' | 'atkinson' | 'ordered' | 'threshold';
export const DITHERS: { id: Dither; label: string; note: string }[] = [
	{ id: 'floyd', label: 'Smooth', note: 'Floyd-Steinberg. Best for photos' },
	{ id: 'atkinson', label: 'Crisp', note: 'Atkinson. Punchier, keeps white clean' },
	{ id: 'ordered', label: 'Pattern', note: 'Ordered dots. Retro screen look' },
	{ id: 'threshold', label: 'Solid', note: 'Pure black and white. Good for logos' },
];

export interface ImageSettings {
	zoom: number; // 1 = fills the box, up to 4
	panX: number; // pixels the picture is shifted inside the box
	panY: number;
	exposure: number; // stops, -2 .. 2
	brightness: number; // -100 .. 100
	contrast: number; // -100 .. 100
	threshold: number; // 0 .. 255, the black/white cut-off
	dither: Dither;
	invert: boolean;
}

export const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
	zoom: 1,
	panX: 0,
	panY: 0,
	exposure: 0,
	brightness: 0,
	contrast: 0,
	threshold: 128,
	dither: 'floyd',
	invert: false,
};

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export function cleanSettings(raw: any): ImageSettings {
	const d = DEFAULT_IMAGE_SETTINGS;
	const n = (v: unknown, def: number, a: number, b: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, a, b) : def);
	return {
		zoom: n(raw?.zoom, d.zoom, 1, 4),
		panX: n(raw?.panX, 0, -2000, 2000),
		panY: n(raw?.panY, 0, -2000, 2000),
		exposure: n(raw?.exposure, 0, -2, 2),
		brightness: n(raw?.brightness, 0, -100, 100),
		contrast: n(raw?.contrast, 0, -100, 100),
		threshold: n(raw?.threshold, 128, 0, 255),
		dither: DITHERS.some((x) => x.id === raw?.dither) ? raw.dither : d.dither,
		invert: raw?.invert === true,
	};
}

// 8x8 Bayer matrix, values 0..63
const BAYER8 = [
	0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63,
	31, 55, 23, 61, 29, 53, 21,
];

// gray: w*h values 0 (black) .. 255 (white). Returns w*h values, 1 = black dot.
export function ditherGray(gray: Float32Array, w: number, h: number, s: ImageSettings): Uint8Array {
	const out = new Uint8Array(w * h);
	const t = s.threshold;
	const v = new Float32Array(gray.length);
	const gain = Math.pow(2, s.exposure);
	const c = (259 * (s.contrast + 255)) / (255 * (259 - s.contrast));
	for (let i = 0; i < v.length; i++) {
		let x = gray[i] * gain + s.brightness * 1.28;
		x = (x - 128) * c + 128;
		v[i] = clamp(x, 0, 255);
	}
	if (s.dither === 'threshold') {
		for (let i = 0; i < v.length; i++) out[i] = v[i] < t ? 1 : 0;
	} else if (s.dither === 'ordered') {
		for (let y = 0; y < h; y++)
			for (let x = 0; x < w; x++) {
				const m = ((BAYER8[(y & 7) * 8 + (x & 7)] + 0.5) / 64) * 255;
				out[y * w + x] = v[y * w + x] + (128 - t) < m ? 1 : 0;
			}
	} else {
		const atk = s.dither === 'atkinson';
		for (let y = 0; y < h; y++)
			for (let x = 0; x < w; x++) {
				const i = y * w + x;
				const old = v[i];
				const black = old < t;
				out[i] = black ? 1 : 0;
				const err = old - (black ? 0 : 255);
				const add = (dx: number, dy: number, f: number) => {
					const xx = x + dx;
					const yy = y + dy;
					if (xx < 0 || xx >= w || yy >= h) return;
					v[yy * w + xx] += err * f;
				};
				if (atk) {
					const f = 1 / 8;
					add(1, 0, f); add(2, 0, f); add(-1, 1, f); add(0, 1, f); add(1, 1, f); add(0, 2, f);
				} else {
					add(1, 0, 7 / 16); add(-1, 1, 3 / 16); add(0, 1, 5 / 16); add(1, 1, 1 / 16);
				}
			}
	}
	if (s.invert) for (let i = 0; i < out.length; i++) out[i] ^= 1;
	return out;
}

// dots (1 = ink) -> row-padded bytes, most significant bit first, like the draw list wants.
export function packBits(dots: Uint8Array, w: number, h: number): Uint8Array {
	const stride = Math.ceil(w / 8);
	const bytes = new Uint8Array(stride * h);
	for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (dots[y * w + x]) bytes[y * stride + (x >> 3)] |= 0x80 >> (x & 7);
	return bytes;
}

export function bytesToB64(b: Uint8Array): string {
	let bin = '';
	for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
	return btoa(bin);
}
export function b64ToBytes(s: string): Uint8Array | null {
	try {
		const bin = atob(s);
		const out = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
		return out;
	} catch {
		return null;
	}
}


// ---- stored pictures of any size ----
// The Picture widget in the layout builder stores its dots at the size of the widget, up to the full
// screen. A picture that isn't the classic corner size is saved as "WxH:" + base64; a plain base64
// string is always the classic corner size, so older saved pictures keep working unchanged.
export const PIC_MAX = { w: 400, h: 300 } as const;

export interface Pic {
	w: number;
	h: number;
	bytes: Uint8Array;
}

export function encodePic(bytes: Uint8Array, w: number, h: number): string {
	const b64 = bytesToB64(bytes);
	return w === CORNER.w && h === CORNER.h ? b64 : `${w}x${h}:${b64}`;
}

export function decodePic(s: unknown): Pic | null {
	if (typeof s !== 'string' || !s) return null;
	let w: number = CORNER.w;
	let h: number = CORNER.h;
	let b64 = s;
	const m = /^(\d{1,3})x(\d{1,3}):/.exec(s);
	if (m) {
		w = +m[1];
		h = +m[2];
		b64 = s.slice(m[0].length);
	}
	if (w < 1 || h < 1 || w > PIC_MAX.w || h > PIC_MAX.h) return null;
	const bytes = b64ToBytes(b64);
	if (!bytes || bytes.length !== Math.ceil(w / 8) * h) return null;
	return { w, h, bytes };
}

// Fills a tw x th box with a stored picture (crops the overflow, centred), averaging the dots it covers.
export function fitBits(src: Uint8Array, sw: number, sh: number, tw: number, th: number): Uint8Array {
	if (sw === tw && sh === th) return src;
	const sStride = Math.ceil(sw / 8);
	const oStride = Math.ceil(tw / 8);
	const k = Math.max(tw / sw, th / sh);
	const ox = (sw - tw / k) / 2;
	const oy = (sh - th / k) / 2;
	const out = new Uint8Array(oStride * th);
	for (let y = 0; y < th; y++) {
		const y0 = Math.min(sh - 1, Math.floor(oy + y / k));
		const y1 = Math.min(sh, Math.max(y0 + 1, Math.ceil(oy + (y + 1) / k)));
		for (let x = 0; x < tw; x++) {
			const x0 = Math.min(sw - 1, Math.floor(ox + x / k));
			const x1 = Math.min(sw, Math.max(x0 + 1, Math.ceil(ox + (x + 1) / k)));
			let ink = 0;
			for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) if (src[yy * sStride + (xx >> 3)] & (0x80 >> (xx & 7))) ink++;
			if (ink * 2 >= (y1 - y0) * (x1 - x0)) out[y * oStride + (x >> 3)] |= 0x80 >> (x & 7);
		}
	}
	return out;
}

// For the places that only know the classic corner size (Customize display, the dashboard preview).
export function cornerPlain(s: unknown): string | null {
	const p = decodePic(s);
	if (!p) return null;
	return p.w === CORNER.w && p.h === CORNER.h ? bytesToB64(p.bytes) : bytesToB64(fitBits(p.bytes, p.w, p.h, CORNER.w, CORNER.h));
}
