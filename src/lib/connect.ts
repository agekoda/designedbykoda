// Connections: data from other services for the builder's widgets. YouTube subscribers, headlines
// from any RSS or Atom feed, GitHub contributions, exchange rates and crypto prices, tides and surf,
// UV and air quality. All free; only YouTube needs a key (YOUTUBE_API_KEY, from Google Cloud).
//
// Every answer is kept in Cloudflare's cache for a while (shared by every calendar asking the same
// thing), so a hundred calendars showing Bitcoin cost one request every 15 minutes, not a hundred.
// A source that fails gives null, and its widget says so; it never stops the screen being drawn.

export interface YouTubeStats { name: string; subs: number | null } // null subs: the channel hides them
export interface FeedItems { title: string; items: string[] }
export interface GitHubDays { total: number; first: string; levels: string } // levels: one digit 0-4 per day from `first`
export interface Quote { sym: string; price: number; change: number | null; crypto: boolean }
export interface Markets { base: string; quotes: Quote[] }
export interface Marine { tides: { at: number; h: number; high: boolean }[]; waveNow: number | null; waveMax: number | null; sea: number | null }
export interface Air { uvNow: number | null; uvMax: number | null; uvMaxAt: number | null; aqi: number | null }

export interface Connected {
	youtube?: Record<string, YouTubeStats | null>;
	youtubeKey?: boolean; // false: the site has no YOUTUBE_API_KEY yet
	feeds?: Record<string, FeedItems | null>;
	github?: Record<string, GitHubDays | null>;
	markets?: Record<string, Markets | null>; // key: base|SYM,SYM
	marine?: Marine | null;
	air?: Air | null;
}

const UA = 'designedbykoda e-ink calendar (+https://designedbykoda.com)';

async function cached<T>(key: string, ttlSec: number, get: () => Promise<T | null>): Promise<T | null> {
	const c: Cache | undefined = (globalThis as any).caches?.default;
	const url = 'https://cache.designedbykoda.internal/' + encodeURIComponent(key);
	if (c) {
		try {
			const hit = await c.match(url);
			if (hit) return (await hit.json()) as T;
		} catch {}
	}
	let v: T | null = null;
	try {
		v = await get();
	} catch (err) {
		console.error('connect', key, err);
	}
	if (v !== null && c) {
		try {
			await c.put(url, new Response(JSON.stringify(v), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${ttlSec}` } }));
		} catch {}
	}
	return v;
}

const getJson = async (url: string, headers: Record<string, string> = {}) => {
	const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...headers } });
	if (!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(url).host}`);
	return r.json() as Promise<any>;
};

// ---- YouTube ----
// A channel as people paste it: "@handle", "handle", a youtube.com/@handle link, or a UC… id.
export function youtubeRef(v: unknown): string {
	let s = String(v ?? '').trim();
	const m = s.match(/youtube\.com\/(?:channel\/(UC[\w-]{22})|@([\w.-]+))/i);
	if (m) s = m[1] ?? '@' + m[2];
	if (/^UC[\w-]{22}$/.test(s)) return s;
	s = s.replace(/^@/, '');
	return /^[\w.-]{3,30}$/.test(s) ? '@' + s : '';
}
export async function youtubeStats(ref: string, key: string | undefined): Promise<YouTubeStats | null> {
	if (!ref || !key) return null;
	return cached(`yt:${ref.toLowerCase()}`, 1800, async () => {
		const q = ref.startsWith('UC') ? `id=${ref}` : `forHandle=${encodeURIComponent(ref)}`;
		const j = await getJson(`https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&${q}&key=${key}`);
		const ch = j.items?.[0];
		if (!ch) return null;
		const hidden = ch.statistics?.hiddenSubscriberCount === true;
		return { name: String(ch.snippet?.title ?? ''), subs: hidden ? null : Number(ch.statistics?.subscriberCount ?? 0) };
	});
}

// ---- RSS / Atom ----
const decode = (s: string) =>
	s
		.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
		.replace(/<[^>]+>/g, '')
		.replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(+n))
		.replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)))
		.replace(/&quot;/g, '"')
		.replace(/&apos;|&#39;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();
export function feedUrl(v: unknown): string {
	const s = String(v ?? '').trim();
	try {
		const u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s);
		return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : '';
	} catch {
		return '';
	}
}
export function parseFeed(xml: string): FeedItems {
	const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? [];
	const items = blocks.map((b) => decode(b.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '')).filter(Boolean);
	const head = xml.split(/<(item|entry)\b/i)[0];
	const title = decode(head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
	return { title, items: items.slice(0, 8) };
}
export async function feedItems(url: string): Promise<FeedItems | null> {
	if (!url) return null;
	return cached(`rss:${url}`, 1800, async () => {
		const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' } });
		if (!r.ok) throw new Error(`HTTP ${r.status}`);
		const f = parseFeed((await r.text()).slice(0, 2_000_000));
		return f.items.length ? f : null;
	});
}

// ---- GitHub contributions (the public profile graph, no sign-in) ----
export function githubUser(v: unknown): string {
	const s = String(v ?? '').trim().replace(/^@/, '').replace(/^https?:\/\/github\.com\//i, '').split('/')[0];
	return /^[a-z\d](?:[a-z\d-]{0,38})$/i.test(s) ? s : '';
}
export function parseContributions(html: string): GitHubDays | null {
	const days: { d: string; l: number }[] = [];
	for (const m of html.matchAll(/<td\b[^>]*>/g)) {
		const tag = m[0];
		const d = tag.match(/data-date="(\d{4}-\d{2}-\d{2})"/)?.[1];
		const l = tag.match(/data-level="(\d)"/)?.[1];
		if (d && l) days.push({ d, l: Math.min(4, +l) });
	}
	if (!days.length) return null;
	days.sort((a, b) => (a.d < b.d ? -1 : 1));
	const total = Number((html.match(/([\d,]+)\s+contributions?\s+in the last year/i)?.[1] ?? '0').replace(/,/g, ''));
	return { total, first: days[0].d, levels: days.map((x) => x.l).join('') };
}
export async function githubDays(user: string): Promise<GitHubDays | null> {
	if (!user) return null;
	return cached(`gh:${user.toLowerCase()}`, 3600, async () => {
		const r = await fetch(`https://github.com/users/${encodeURIComponent(user)}/contributions`, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
		if (!r.ok) throw new Error(`HTTP ${r.status}`);
		return parseContributions(await r.text());
	});
}

// ---- exchange rates and crypto ----
export const COINS: Record<string, string> = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', XRP: 'ripple', DOGE: 'dogecoin', ADA: 'cardano', LTC: 'litecoin', BNB: 'binancecoin', DOT: 'polkadot', AVAX: 'avalanche-2', LINK: 'chainlink', USDT: 'tether' };
export function marketList(v: unknown): string[] {
	return [...new Set(String(v ?? '').toUpperCase().split(/[\s,;/]+/).filter((s) => /^[A-Z]{2,5}$/.test(s)))].slice(0, 6);
}
export function marketBase(v: unknown): string {
	const s = String(v ?? '').trim().toUpperCase();
	return /^[A-Z]{3}$/.test(s) ? s : 'AUD';
}
export async function markets(base: string, syms: string[]): Promise<Markets | null> {
	if (!syms.length) return null;
	const coins = syms.filter((s) => COINS[s]);
	const fiat = syms.filter((s) => !COINS[s] && s !== base);
	const [fx, cg] = await Promise.all([
		fiat.length ? cached(`fx:${base}:${fiat.join(',')}`, 3 * 3600, () => getJson(`https://api.frankfurter.dev/v1/latest?base=${base}&symbols=${fiat.join(',')}`)) : null,
		coins.length
			? cached(`cg:${base}:${coins.join(',')}`, 900, () => getJson(`https://api.coingecko.com/api/v3/simple/price?ids=${coins.map((c) => COINS[c]).join(',')}&vs_currencies=${base.toLowerCase()}&include_24hr_change=true`))
			: null,
	]);
	const quotes: Quote[] = [];
	for (const s of syms) {
		if (COINS[s]) {
			const c = (cg as any)?.[COINS[s]];
			const p = c?.[base.toLowerCase()];
			if (typeof p === 'number') quotes.push({ sym: s, price: p, change: typeof c[`${base.toLowerCase()}_24h_change`] === 'number' ? c[`${base.toLowerCase()}_24h_change`] : null, crypto: true });
		} else {
			const p = (fx as any)?.rates?.[s];
			if (typeof p === 'number') quotes.push({ sym: s, price: p, change: null, crypto: false });
		}
	}
	return quotes.length ? { base, quotes } : null;
}

// ---- tides and surf (Open-Meteo marine), at the calendar's weather place ----
// Local times come back in "local seconds" (the same as nowLocal) because of timezone=auto plus the offset.
export async function marine(lat: number, lon: number): Promise<Marine | null> {
	const k = `${lat.toFixed(2)},${lon.toFixed(2)}`;
	return cached(`marine:${k}`, 3 * 3600, async () => {
		const j = await getJson(
			`https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&hourly=wave_height,sea_level_height_msl,sea_surface_temperature&forecast_days=3&timezone=auto&timeformat=unixtime`,
		);
		const off = Number(j.utc_offset_seconds ?? 0);
		const t: number[] = j.hourly?.time ?? [];
		const h: (number | null)[] = j.hourly?.sea_level_height_msl ?? [];
		const w: (number | null)[] = j.hourly?.wave_height ?? [];
		const sst: (number | null)[] = j.hourly?.sea_surface_temperature ?? [];
		// high and low tides: turning points, refined with a parabola through the three hours round them
		const tides: Marine['tides'] = [];
		for (let i = 1; i < h.length - 1; i++) {
			const a = h[i - 1], b = h[i], c = h[i + 1];
			if (a == null || b == null || c == null) continue;
			const high = b > a && b >= c;
			const low = b < a && b <= c;
			if (!high && !low) continue;
			const den = a - 2 * b + c;
			const dx = den ? (0.5 * (a - c)) / den : 0;
			tides.push({ at: Math.round(t[i] + dx * 3600) + off, h: Math.round((b - 0.25 * (a - c) * dx) * 100) / 100, high });
		}
		const now = Date.now() / 1000;
		const idx = Math.max(0, t.findIndex((x) => x > now) - 1);
		const today = w.slice(idx, idx + 24).filter((x): x is number => x != null);
		if (!tides.length && !today.length) return null; // inland: the marine model has nothing here
		return { tides, waveNow: w[idx] ?? null, waveMax: today.length ? Math.max(...today) : null, sea: sst[idx] ?? null };
	});
}

// ---- UV and air quality (Open-Meteo air quality) ----
export async function air(lat: number, lon: number): Promise<Air | null> {
	const k = `${lat.toFixed(2)},${lon.toFixed(2)}`;
	return cached(`air:${k}`, 3600, async () => {
		const j = await getJson(
			`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,uv_index&hourly=uv_index&forecast_days=1&timezone=auto&timeformat=unixtime`,
		);
		const off = Number(j.utc_offset_seconds ?? 0);
		const uv: (number | null)[] = j.hourly?.uv_index ?? [];
		const t: number[] = j.hourly?.time ?? [];
		let uvMax: number | null = null;
		let uvMaxAt: number | null = null;
		uv.forEach((v, i) => {
			if (v != null && (uvMax === null || v > uvMax)) {
				uvMax = v;
				uvMaxAt = t[i] + off;
			}
		});
		const cur = j.current ?? {};
		return { uvNow: typeof cur.uv_index === 'number' ? cur.uv_index : null, uvMax, uvMaxAt, aqi: typeof cur.us_aqi === 'number' ? cur.us_aqi : null };
	});
}

// What the screen's widgets ask for, fetched together.
export async function connectFor(widgets: { t: string; o: Record<string, unknown> }[], place: { lat: number; lon: number } | null, env: any): Promise<Connected | null> {
	const types = new Set(widgets.map((w) => w.t));
	if (!['youtube', 'rss', 'github', 'markets', 'tides', 'uvair'].some((t) => types.has(t))) return null;
	const out: Connected = { youtube: {}, youtubeKey: !!env?.YOUTUBE_API_KEY, feeds: {}, github: {}, markets: {} };
	const jobs: Promise<unknown>[] = [];
	for (const w of widgets.slice(0, 30)) {
		if (w.t === 'youtube') {
			const ref = youtubeRef(w.o.channel);
			if (ref && !(ref in out.youtube!)) {
				out.youtube![ref] = null;
				jobs.push(youtubeStats(ref, env?.YOUTUBE_API_KEY).then((v) => (out.youtube![ref] = v)));
			}
		} else if (w.t === 'rss') {
			const url = feedUrl(w.o.url);
			if (url && !(url in out.feeds!)) {
				out.feeds![url] = null;
				jobs.push(feedItems(url).then((v) => (out.feeds![url] = v)));
			}
		} else if (w.t === 'github') {
			const u = githubUser(w.o.user);
			if (u && !(u in out.github!)) {
				out.github![u] = null;
				jobs.push(githubDays(u).then((v) => (out.github![u] = v)));
			}
		} else if (w.t === 'markets') {
			const base = marketBase(w.o.base);
			const syms = marketList(w.o.list);
			const key = `${base}|${syms.join(',')}`;
			if (syms.length && !(key in out.markets!)) {
				out.markets![key] = null;
				jobs.push(markets(base, syms).then((v) => (out.markets![key] = v)));
			}
		}
	}
	if (place && types.has('tides')) jobs.push(marine(place.lat, place.lon).then((v) => (out.marine = v)));
	if (place && types.has('uvair')) jobs.push(air(place.lat, place.lon).then((v) => (out.air = v)));
	await Promise.all(jobs.map((j) => j.catch(() => null)));
	return out;
}
