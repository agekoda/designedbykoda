// Picture of the day: one picture per category per day (UTC), the same for every calendar.
// The first calendar to ask after midnight UTC fetches it, turns it into a 400 x 300 greyscale
// picture and keeps it in the database (table potd, made the first time it's needed); everyone
// else that day reads it from there. Each screen turns it into black and white dots at its own
// size (the Picture of the day widget, src/lib/eink/builder/render.ts).
//
// Sources (all free, no key):
//   art     Cleveland Museum of Art (or the Art Institute of Chicago), public domain (CC0) paintings
//   photo   Wikimedia Commons' Picture of the Day (freely licensed; the photographer is credited)
//   space   NASA's image library (NASA's own pictures are public domain)
import jpeg from 'jpeg-js';

export type PotdCat = 'art' | 'photo' | 'space';
export const POTD_CATS: { id: PotdCat; label: string }[] = [
	{ id: 'art', label: 'Art' },
	{ id: 'photo', label: 'Photography' },
	{ id: 'space', label: 'Space' },
];
export const potdCat = (v: unknown): PotdCat => (v === 'photo' || v === 'space' ? v : 'art');

export const POTD_W = 400;
export const POTD_H = 300;
export interface Potd {
	day: string; // YYYY-MM-DD (UTC)
	title: string;
	credit: string;
	gray: Uint8Array; // POTD_W x POTD_H, 0 black .. 255 white
}

const UA = 'designedbykoda-calendar/1.0 (https://designedbykoda.com)';
const HEADERS = { 'User-Agent': UA, 'AIC-User-Agent': UA, Accept: 'application/json' };

const utcDay = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 10);
// a number that's the same all day and different each day
const dayNum = (day: string) => Math.floor(Date.parse(day + 'T00:00:00Z') / 86400000);
const clean = (s: unknown, max = 120) =>
	String(s ?? '')
		.replace(/<[^>]*>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, max);

async function getJson(url: string): Promise<any> {
	const r = await fetch(url, { headers: HEADERS });
	if (!r.ok) throw new Error(`${r.status} from ${new URL(url).host}`);
	return r.json();
}

// A JPEG, made greyscale and cropped to fill 400 x 300 (the middle of it).
async function toGray(url: string): Promise<Uint8Array> {
	const r = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!r.ok) throw new Error(`picture ${r.status} from ${new URL(url).host}`);
	const buf = new Uint8Array(await r.arrayBuffer());
	if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error(`not a JPEG from ${new URL(url).host}`);
	const img = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 40, maxMemoryUsageInMB: 256 });
	const { width: sw, height: sh, data } = img;
	const scale = Math.max(POTD_W / sw, POTD_H / sh);
	const cw = POTD_W / scale;
	const ch = POTD_H / scale;
	const ox = (sw - cw) / 2;
	const oy = (sh - ch) / 2;
	const out = new Uint8Array(POTD_W * POTD_H);
	// average the source pixels under each output pixel (smooth, no jaggies)
	const step = Math.max(1, Math.floor(1 / scale));
	for (let y = 0; y < POTD_H; y++) {
		for (let x = 0; x < POTD_W; x++) {
			const x0 = Math.floor(ox + x / scale);
			const y0 = Math.floor(oy + y / scale);
			let sum = 0;
			let n = 0;
			for (let yy = y0; yy < Math.min(sh, y0 + step); yy++) {
				for (let xx = x0; xx < Math.min(sw, x0 + step); xx++) {
					const i = (yy * sw + xx) * 4;
					sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
					n++;
				}
			}
			out[y * POTD_W + x] = n ? Math.round(sum / n) : 255;
		}
	}
	return out;
}

// ---- the three sources ----
// Art: a public domain (CC0) painting from the Cleveland Museum of Art, or from the Art Institute
// of Chicago if Cleveland is down (Chicago turns away requests from Cloudflare's servers).
async function fetchArt(day: string): Promise<Omit<Potd, 'day'>> {
	try {
		return await fetchCleveland(day);
	} catch (e) {
		try {
			return await fetchChicago(day);
		} catch {
			throw e; // Cleveland's error is the useful one
		}
	}
}

async function fetchCleveland(day: string): Promise<Omit<Potd, 'day'>> {
	const n = dayNum(day);
	const base = 'https://openaccess-api.clevelandart.org/api/artworks/?cc0=1&has_image=1&type=Painting&limit=1';
	let lastErr: unknown;
	for (let t = 0; t < 3; t++) {
		try {
			let skip = (n * 37 + t * 101) % 2000;
			let j = await getJson(`${base}&skip=${skip}`);
			const total = Number(j?.info?.total) || 0;
			if (!j?.data?.length && total > 0) {
				skip = skip % total;
				j = await getJson(`${base}&skip=${skip}`);
			}
			const a = j?.data?.[0];
			const img: string | undefined = a?.images?.web?.url;
			if (!a || !img) continue;
			const gray = await toGray(img);
			// "Claude Monet (French, 1840–1926)" -> "Claude Monet"
			const who = clean(a.creators?.[0]?.description, 80).replace(/\s*\(.*$/, '');
			const by = [who, clean(a.creation_date, 30)].filter(Boolean).join(', ');
			return { title: clean(a.title, 90) || 'Untitled', credit: by ? `${by}, Cleveland Museum of Art` : 'Cleveland Museum of Art', gray };
		} catch (e) {
			lastErr = e;
		}
	}
	throw lastErr ?? new Error('no painting found at Cleveland');
}

async function fetchChicago(day: string): Promise<Omit<Potd, 'day'>> {
	const n = dayNum(day);
	let lastErr: unknown;
	for (let t = 0; t < 4; t++) {
		try {
			const page = ((n * 7 + t * 131) % 2000) + 1; // the search allows up to 10,000 results
			const j = await getJson(
				`https://api.artic.edu/api/v1/artworks/search?q=painting&query[term][is_public_domain]=true&fields=id,title,artist_title,date_display,image_id&limit=5&page=${page}`,
			);
			const base = j?.config?.iiif_url || 'https://www.artic.edu/iiif/2';
			const a = (j?.data ?? []).find((x: any) => x?.image_id);
			if (!a) continue;
			const gray = await toGray(`${base}/${a.image_id}/full/843,/0/default.jpg`);
			const by = [clean(a.artist_title, 60), clean(a.date_display, 30)].filter(Boolean).join(', ');
			return { title: clean(a.title, 90) || 'Untitled', credit: by ? `${by}, Art Institute of Chicago` : 'Art Institute of Chicago', gray };
		} catch (e) {
			lastErr = e;
		}
	}
	throw lastErr ?? new Error('no artwork found');
}

async function fetchPhoto(day: string): Promise<Omit<Potd, 'day'>> {
	// today's, or the day before if today's isn't a JPEG (now and then it's a drawing or a PNG)
	let lastErr: unknown;
	for (let back = 0; back < 4; back++) {
		try {
			const d = utcDay(Date.parse(day + 'T00:00:00Z') - back * 86400000).replace(/-/g, '/');
			const j = await getJson(`https://api.wikimedia.org/feed/v1/wikipedia/en/featured/${d}`);
			const im = j?.image;
			const src: string | undefined = im?.thumbnail?.source || im?.image?.source;
			if (!src) throw new Error('no picture today');
			// a 500 px copy (one of Wikimedia's standard thumbnail sizes) when it's a thumbnail; the
			// copy the feed gives if that doesn't work (say the original is smaller than that)
			const big = src.replace(/\/(\d+)px-([^/]+)$/, (_m: string, _w: string, f: string) => `/500px-${f}`);
			let gray: Uint8Array;
			try {
				gray = await toGray(big);
			} catch {
				gray = await toGray(src);
			}
			const title = clean(im?.description?.text, 90) || clean(String(im?.title ?? '').replace(/^File:/, '').replace(/\.\w+$/, ''), 90);
			const artist = clean(im?.artist?.text, 50);
			const lic = clean(im?.license?.type, 20);
			return { title, credit: [artist, lic].filter(Boolean).join(', ') + ', Wikimedia Commons', gray };
		} catch (e) {
			lastErr = e;
		}
	}
	throw lastErr ?? new Error('no photo found');
}

const SPACE_TOPICS = ['nebula', 'galaxy', 'earth from space', 'hubble', 'webb telescope', 'aurora', 'saturn', 'jupiter', 'lunar surface', 'star cluster', 'astronaut spacewalk', 'mars surface'];
async function fetchSpace(day: string): Promise<Omit<Potd, 'day'>> {
	const n = dayNum(day);
	let lastErr: unknown;
	for (let t = 0; t < 4; t++) {
		try {
			const q = SPACE_TOPICS[(n + t) % SPACE_TOPICS.length];
			const page = ((n * 3 + t) % 8) + 1;
			const j = await getJson(`https://images-api.nasa.gov/search?q=${encodeURIComponent(q)}&media_type=image&page=${page}`);
			const items = (j?.collection?.items ?? []).filter((it: any) => it?.links?.[0]?.href && it?.data?.[0]?.title);
			if (!items.length) continue;
			const it = items[(n * 13 + t) % items.length];
			const thumb: string = it.links[0].href;
			const meta = it.data[0];
			let gray: Uint8Array;
			try {
				gray = await toGray(thumb.replace('~thumb.', '~medium.'));
			} catch {
				gray = await toGray(thumb);
			}
			return { title: clean(meta.title, 90), credit: [clean(meta.photographer || meta.secondary_creator, 40), 'NASA'].filter(Boolean).join(', '), gray };
		} catch (e) {
			lastErr = e;
		}
	}
	throw lastErr ?? new Error('no space picture found');
}

const FETCH: Record<PotdCat, (day: string) => Promise<Omit<Potd, 'day'>>> = { art: fetchArt, photo: fetchPhoto, space: fetchSpace };

// ---- storage ----
async function ensureTable(db: any) {
	await db.prepare('CREATE TABLE IF NOT EXISTS potd (cat TEXT NOT NULL, day TEXT NOT NULL, title TEXT, credit TEXT, gray BLOB, PRIMARY KEY (cat, day))').run();
}
// The picture is kept as base64 text: D1 won't take a Uint8Array as a value.
const rowToPotd = (r: any): Potd | null => {
	if (!r?.gray) return null;
	const gray = typeof r.gray === 'string' ? b64ToGray(r.gray) : r.gray instanceof ArrayBuffer ? new Uint8Array(r.gray) : Array.isArray(r.gray) ? new Uint8Array(r.gray) : null;
	if (!gray || gray.length !== POTD_W * POTD_H) return null;
	return { day: r.day, title: r.title ?? '', credit: r.credit ?? '', gray };
};

// What went wrong last time, by category, so /api/dashboard/potd can say (this worker only)
export const lastError: Record<string, string> = {};

// Today's picture for a category: from the database, or fetched now if nobody has yet today.
// If the source is down, yesterday's (or the newest there is) stays up.
export async function getPotd(db: any, catRaw: unknown): Promise<Potd | null> {
	const cat = potdCat(catRaw);
	const day = utcDay();
	try {
		await ensureTable(db);
		const have = rowToPotd(await db.prepare('SELECT day, title, credit, gray FROM potd WHERE cat = ? AND day = ?').bind(cat, day).first());
		if (have) return have;
	} catch (e) {
		lastError[cat] = 'database: ' + String((e as Error)?.message ?? e);
		return null;
	}
	try {
		const p = await FETCH[cat](day);
		await db.prepare('INSERT OR REPLACE INTO potd (cat, day, title, credit, gray) VALUES (?, ?, ?, ?, ?)').bind(cat, day, p.title, p.credit, grayToB64(p.gray)).run();
		delete lastError[cat];
		// keep a week
		await db.prepare('DELETE FROM potd WHERE cat = ? AND day < ?').bind(cat, utcDay(Date.now() - 7 * 86400000)).run();
		return { day, ...p };
	} catch (e) {
		lastError[cat] = String((e as Error)?.message ?? e);
		console.log('potd', cat, lastError[cat]);
		try {
			return rowToPotd(await db.prepare('SELECT day, title, credit, gray FROM potd WHERE cat = ? ORDER BY day DESC LIMIT 1').bind(cat).first());
		} catch {
			return null;
		}
	}
}

export function grayToB64(g: Uint8Array): string {
	let s = '';
	for (let i = 0; i < g.length; i += 0x8000) s += String.fromCharCode(...g.subarray(i, i + 0x8000));
	return btoa(s);
}
export function b64ToGray(s: string): Uint8Array | null {
	try {
		const bin = atob(s);
		const out = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
		return out.length === POTD_W * POTD_H ? out : null;
	} catch {
		return null;
	}
}
