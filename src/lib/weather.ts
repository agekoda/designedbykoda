// Today's high/low for a place, from Open-Meteo, through a shared D1 cache.
//
// Devices never talk to the weather service. They ask /today, which calls
// getForecast(); that only reaches Open-Meteo when the cached copy for that
// ~11 km grid square is older than 6 hours or is for a previous local day. So
// calls scale with the number of different areas, not devices or presses.
//
// NOTE: Open-Meteo's free tier is for NON-commercial use. Before selling
// devices, switch to their paid plan or another provider by replacing
// fetchUpstream() below. Nothing else needs to change.
export interface Forecast {
	high: number;
	low: number;
}

const MAX_AGE_SEC = 6 * 3600;

function localDate(nowSec: number, offsetSec: number): string {
	return new Date((nowSec + offsetSec) * 1000).toISOString().slice(0, 10);
}

async function fetchUpstream(lat: number, lon: number) {
	const u = new URL('https://api.open-meteo.com/v1/forecast');
	u.searchParams.set('latitude', String(lat));
	u.searchParams.set('longitude', String(lon));
	u.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min');
	u.searchParams.set('timezone', 'auto');
	u.searchParams.set('forecast_days', '1');
	const res = await fetch(u.toString(), { signal: AbortSignal.timeout(3500) });
	if (!res.ok) throw new Error(`weather HTTP ${res.status}`);
	const j: any = await res.json();
	const high = j?.daily?.temperature_2m_max?.[0];
	const low = j?.daily?.temperature_2m_min?.[0];
	const date = j?.daily?.time?.[0];
	if (typeof high !== 'number' || typeof low !== 'number' || typeof date !== 'string') throw new Error('bad weather reply');
	return { high, low, date, offset: Number(j.utc_offset_seconds) || 0 };
}

export async function getForecast(db: any, lat: number, lon: number): Promise<Forecast | null> {
	if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
	const rlat = Math.round(lat * 10) / 10;
	const rlon = Math.round(lon * 10) / 10;
	const k = `${rlat.toFixed(1)},${rlon.toFixed(1)}`;
	const now = Math.floor(Date.now() / 1000);

	let cached: any = null;
	try {
		cached = await db.prepare('SELECT date, utc_offset, high, low, fetched_at FROM weather_cache WHERE k = ?').bind(k).first();
	} catch {
		return null; // migration not run yet
	}
	const isToday = cached && cached.date === localDate(now, cached.utc_offset);
	if (isToday && now - cached.fetched_at < MAX_AGE_SEC) return { high: cached.high, low: cached.low };

	try {
		const w = await fetchUpstream(rlat, rlon);
		await db
			.prepare(
				`INSERT INTO weather_cache (k, date, utc_offset, high, low, fetched_at) VALUES (?, ?, ?, ?, ?, ?)
				 ON CONFLICT(k) DO UPDATE SET date = excluded.date, utc_offset = excluded.utc_offset,
				   high = excluded.high, low = excluded.low, fetched_at = excluded.fetched_at`
			)
			.bind(k, w.date, w.offset, w.high, w.low, now)
			.run();
		return { high: w.high, low: w.low };
	} catch (e) {
		console.error('weather fetch failed', e);
		// A same-day copy that is merely older than 6h still beats nothing.
		return isToday ? { high: cached.high, low: cached.low } : null;
	}
}
