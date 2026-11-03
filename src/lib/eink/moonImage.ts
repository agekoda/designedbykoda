// Draws the Moon as a 1-bit picture, lit exactly as it is tonight.
//
// A real map of the Moon is wrapped onto a sphere, lit from the direction of the
// Sun using the same brightness law real moonlight follows (so a full moon is flat
// and bright right out to its edge, and a crescent fades gently into shadow), then
// turned into black and white dots with error diffusion so the craters and the
// dark seas keep their shape.
//
// `flip` turns the picture upside down, which is how the Moon looks from the
// southern hemisphere (the same side is lit, but the Moon appears rotated 180 degrees).
//
// The result is packed 1 bit per dot (most significant bit first, 1 = ink), ready
// for Draw.bitmapBytes. On a light screen the unlit part is solid ink, like a night
// sky disc with the lit part showing through; on a dark screen the lit part is ink
// (white) and the unlit edge is drawn as a faint dotted ring.
import { MOON_B64, MOON_H, MOON_LAT, MOON_W } from './moonMap';

let tex: Uint8Array | null = null;
function texture(): Uint8Array {
	if (!tex) {
		const bin = atob(MOON_B64);
		tex = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) tex[i] = bin.charCodeAt(i);
	}
	return tex;
}

// Bilinear sample of the map at a longitude / latitude (radians), 0..1.
function sample(t: Uint8Array, lon: number, lat: number): number {
	let fx = (lon / (2 * Math.PI) + 0.5) * MOON_W - 0.5;
	let fy = ((MOON_LAT - lat) / (2 * MOON_LAT)) * (MOON_H - 1);
	fy = fy < 0 ? 0 : fy > MOON_H - 1 ? MOON_H - 1 : fy;
	fx = ((fx % MOON_W) + MOON_W) % MOON_W;
	const x0 = Math.floor(fx);
	const y0 = Math.min(MOON_H - 2, Math.floor(fy));
	const x1 = (x0 + 1) % MOON_W;
	const ax = fx - x0;
	const ay = fy - y0;
	const a = t[y0 * MOON_W + x0];
	const b = t[y0 * MOON_W + x1];
	const c = t[(y0 + 1) * MOON_W + x0];
	const d = t[(y0 + 1) * MOON_W + x1];
	return ((a + (b - a) * ax) * (1 - ay) + (c + (d - c) * ax) * ay) / 255;
}

export interface MoonOptions {
	size: number; // diameter in dots
	elong: number; // degrees the Moon is ahead of the Sun (0 new, 90 first quarter, 180 full)
	flip: boolean; // southern hemisphere
	dark: boolean; // the screen is in dark mode
}

export function moonBits(o: MoonOptions): Uint8Array {
	const t = texture();
	const n = o.size;
	const r = n / 2 - 0.5;
	const c = (n - 1) / 2;
	const Ls = ((180 - o.elong) * Math.PI) / 180; // longitude of the point on the Moon the Sun is overhead
	const sx = Math.sin(Ls);
	const sz = Math.cos(Ls);

	const g = new Float32Array(n * n).fill(-1); // -1 = outside the disc
	for (let py = 0; py < n; py++) {
		for (let px = 0; px < n; px++) {
			const x = (px - c) / r;
			const y = (py - c) / r;
			const q = x * x + y * y;
			if (q > 1) continue;
			const z = Math.sqrt(1 - q);
			const mu0 = x * sx + z * sz; // how directly the Sun hits this spot
			let b = 0;
			if (mu0 > 0) {
				const ls = (2 * mu0) / (mu0 + z + 1e-6); // Lommel-Seeliger: flat at full, soft at the terminator
				const lit = Math.pow(Math.min(1, ls * 1.3), 0.8);
				const alb = 0.16 + 0.84 * Math.pow(sample(t, Math.atan2(x, z), Math.asin(-y)), 1.05);
				b = alb * lit * 1.1;
				// a touch more contrast, so the dark seas and bright highlands separate cleanly
				b = Math.max(0, Math.min(1, (b - 0.5) * 1.45 + 0.54));
			}
			g[py * n + px] = b * 255;
		}
	}

	// turn it the other way up for the southern hemisphere
	let grey = g;
	if (o.flip) {
		grey = new Float32Array(g.length);
		for (let i = 0; i < g.length; i++) grey[i] = g[g.length - 1 - i];
	}

	// Floyd-Steinberg error diffusion, left to right then right to left
	const bright = new Uint8Array(n * n); // 1 = lit dot
	for (let y = 0; y < n; y++) {
		const ltr = (y & 1) === 0;
		for (let k = 0; k < n; k++) {
			const x = ltr ? k : n - 1 - k;
			const i = y * n + x;
			const v = grey[i];
			if (v < 0) continue;
			const on = v >= 127.5 ? 1 : 0;
			bright[i] = on;
			const err = v - (on ? 255 : 0);
			const dx = ltr ? 1 : -1;
			const push = (xx: number, yy: number, w: number) => {
				if (xx < 0 || xx >= n || yy >= n) return;
				const j = yy * n + xx;
				if (grey[j] >= 0) grey[j] += err * w;
			};
			push(x + dx, y, 7 / 16);
			push(x - dx, y + 1, 3 / 16);
			push(x, y + 1, 5 / 16);
			push(x + dx, y + 1, 1 / 16);
		}
	}

	// pack: ink = 1
	const stride = Math.ceil(n / 8);
	const out = new Uint8Array(stride * n);
	for (let py = 0; py < n; py++) {
		for (let px = 0; px < n; px++) {
			const i = py * n + px;
			const x = px - c;
			const y = py - c;
			const d2 = x * x + y * y;
			if (grey[i] < 0) continue; // outside the disc: paper
			let ink: number;
			if (!o.dark) {
				ink = bright[i] ? 0 : 1; // sky is ink, lit dots are paper
			} else {
				ink = bright[i] ? 1 : 0; // lit dots are ink (white)
				// a faint dotted rim so the unlit edge is still visible on black
				if (!ink && d2 >= (r - 1.2) * (r - 1.2) && (px + py) % 3 === 0) ink = 1;
			}
			if (ink) out[py * stride + (px >> 3)] |= 0x80 >> (px & 7);
		}
	}
	return out;
}
