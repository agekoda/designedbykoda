// City autocomplete for the weather location. Reads our own `cities` table
// (seeded by schema-cities.sql), so there's no outside service, no key and no
// limit. 1-3 letters is a single-row lookup in `city_top`; longer is a range
// scan on the primary key. Answers are also cached at Cloudflare's edge, so a
// repeated search never reaches the database at all.
import { normalizeKey } from '../../../lib/geo';
export const prerender = false;

const LIMIT = 8;

export async function GET({ request, locals }) {
	const db = locals.runtime?.env?.DB;
	if (!db) return json({ results: [] }, 500);

	const url = new URL(request.url);
	const q = normalizeKey(url.searchParams.get('q') || '').slice(0, 40);
	if (!q) return json({ results: [] }, 200);

	// Cloudflare edge cache (not present in local dev).
	const cache = (globalThis as any).caches?.default;
	const cacheKey = new Request(`${url.origin}/api/geo/search?q=${encodeURIComponent(q)}`);
	if (cache) {
		const hit = await cache.match(cacheKey).catch(() => null);
		if (hit) return hit;
	}

	let results: unknown[] = [];
	if (q.length <= 3) {
		const row = await db.prepare('SELECT json FROM city_top WHERE p = ?').bind(q).first();
		if (row?.json) results = JSON.parse(row.json);
	} else {
		const rows = await db
			.prepare(
				`SELECT id, label, lat, lon FROM cities
				 WHERE k >= ?1 AND k < ?2
				 GROUP BY id ORDER BY MAX(pop) DESC LIMIT ${LIMIT}`
			)
			.bind(q, q + '\u007f')
			.all();
		results = rows.results ?? [];
	}

	const res = json({ results }, 200, 'public, max-age=86400');
	if (cache) cache.put(cacheKey, res.clone()).catch(() => {});
	return res;
}

function json(data: unknown, status: number, cacheControl = 'no-store') {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json', 'Cache-Control': cacheControl },
	});
}
