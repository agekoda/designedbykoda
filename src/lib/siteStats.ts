// The numbers on /stats (Press & Brands). They start as the vars in wrangler.json; once they have been
// saved from the owner app they live in the site_stats table instead, so a change shows straight away
// with no deploy. The table is made the first time something is saved.
export const STAT_KEYS = [
	'YOUTUBE_SUBSCRIBERS', 'YOUTUBE_VIEWS', 'TIKTOK_FOLLOWERS', 'TIKTOK_VIEWS', 'INSTAGRAM_FOLLOWERS', 'INSTAGRAM_VIEWS',
	'TOTAL_VIEWERS_REACHED', 'STATS_LAST_UPDATED',
] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export async function loadStats(env: any): Promise<Record<StatKey, string>> {
	const out = {} as Record<StatKey, string>;
	for (const k of STAT_KEYS) out[k] = env?.[k] != null ? String(env[k]) : '';
	try {
		const r = await env.DB.prepare('SELECT key, value FROM site_stats').all();
		for (const row of r.results ?? []) if ((STAT_KEYS as readonly string[]).includes(row.key) && row.value != null) out[row.key as StatKey] = String(row.value);
	} catch {
		// no table yet: the vars are the numbers
	}
	return out;
}

export async function saveStats(env: any, values: Record<string, unknown>) {
	const db = env.DB;
	await db.prepare('CREATE TABLE IF NOT EXISTS site_stats (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)').run();
	const now = Math.floor(Date.now() / 1000);
	for (const k of STAT_KEYS) {
		if (!(k in values)) continue;
		let v = String(values[k] ?? '').trim();
		if (k !== 'STATS_LAST_UPDATED') {
			v = v.replace(/[,\s]/g, '');
			if (!/^\d{1,12}$/.test(v)) throw new Error('Each number should be whole, like 2270.');
		} else v = v.slice(0, 40);
		await db.prepare('INSERT INTO site_stats (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(k, v, now).run();
	}
}
