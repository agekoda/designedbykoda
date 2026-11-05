// Today's high/low, conditions and a 5-day forecast for a place, from Open-Meteo, through a shared D1 cache.
//
// Devices never talk to the weather service. They ask /today, which calls
// getForecast(); that only reaches Open-Meteo when the cached copy for that
// ~11 km grid square is older than 6 hours or is for a previous local day. So
// calls scale with the number of different areas, not devices or presses.
//
// NOTE: Open-Meteo's free tier is for NON-commercial use. Before selling
// devices, switch to their paid plan or another provider by replacing
// fetchUpstream() below. Nothing else needs to change.
import type { WxDay } from './eink/context';

export interface Forecast {
	high: number;
	low: number;
	// today's conditions and the next few days (needs schema-weather2.sql; without it only high/low come back)
	code?: number;
	rain?: number | null;
	wind?: number | null;
	days?: WxDay[];
}

const MAX_AGE_SEC = 6 * 3600;

function localDate(nowSec: number, offsetSec: number): string {
	return new Date((nowSec + offsetSec) * 1000).toISOString().slice(0, 10);
}

async function fetchUpstream(lat: number, lon: number) {
	const u = new URL('https://api.open-meteo.com/v1/forecast');
	u.searchParams.set('latitude', String(lat));
	u.searchParams.set('longitude', String(lon));
	u.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max');
	u.searchParams.set('timezone', 'auto');
	u.searchParams.set('forecast_days', '5');
	const res = await fetch(u.toString(), { signal: AbortSignal.timeout(3500) });
	if (!res.ok) throw new Error(`weather HTTP ${res.status}`);
	const j: any = await res.json();
	const high = j?.daily?.temperature_2m_max?.[0];
	const low = j?.daily?.temperature_2m_min?.[0];
	const date = j?.daily?.time?.[0];
	if (typeof high !== 'number' || typeof low !== 'number' || typeof date !== 'string') throw new Error('bad weather reply');
	const dd = j.daily;
	const days: WxDay[] = [];
	for (let i = 0; i < (dd.time?.length ?? 0) && i < 5; i++) {
		const hi = dd.temperature_2m_max?.[i];
		const lo = dd.temperature_2m_min?.[i];
		if (typeof dd.time[i] !== 'string' || typeof hi !== 'number' || typeof lo !== 'number') continue;
		const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);
		days.push({ date: dd.time[i], code: num(dd.weather_code?.[i]) ?? 3, high: hi, low: lo, rain: num(dd.precipitation_probability_max?.[i]), wind: num(dd.wind_speed_10m_max?.[i]) });
	}
	return { high, low, date, offset: Number(j.utc_offset_seconds) || 0, days };
}

function withToday(high: number, low: number, days: WxDay[] | undefined): Forecast {
	const t = days?.[0];
	return t ? { high, low, code: t.code, rain: t.rain, wind: t.wind, days } : { high, low };
}

export async function getForecast(db: any, lat: number, lon: number): Promise<Forecast | null> {
	if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
	const rlat = Math.round(lat * 10) / 10;
	const rlon = Math.round(lon * 10) / 10;
	const k = `${rlat.toFixed(1)},${rlon.toFixed(1)}`;
	const now = Math.floor(Date.now() / 1000);

	let cached: any = null;
	let hasDays = true; // false until schema-weather2.sql has been run
	try {
		cached = await db.prepare('SELECT date, utc_offset, high, low, fetched_at, days FROM weather_cache WHERE k = ?').bind(k).first();
	} catch {
		hasDays = false;
		try {
			cached = await db.prepare('SELECT date, utc_offset, high, low, fetched_at FROM weather_cache WHERE k = ?').bind(k).first();
		} catch {
			return null; // migration not run yet
		}
	}
	const parseDays = (): WxDay[] | undefined => {
		try {
			const v = cached?.days ? JSON.parse(cached.days) : undefined;
			return Array.isArray(v) ? v : undefined;
		} catch {
			return undefined;
		}
	};
	const isToday = cached && cached.date === localDate(now, cached.utc_offset);
	// A row saved before the days column existed is refreshed once so the new widgets get their data.
	const complete = !hasDays || !!cached?.days;
	if (isToday && complete && now - cached.fetched_at < MAX_AGE_SEC) return withToday(cached.high, cached.low, parseDays());

	try {
		const w = await fetchUpstream(rlat, rlon);
		try {
			await db
				.prepare(
					`INSERT INTO weather_cache (k, date, utc_offset, high, low, fetched_at, days) VALUES (?, ?, ?, ?, ?, ?, ?)
					 ON CONFLICT(k) DO UPDATE SET date = excluded.date, utc_offset = excluded.utc_offset,
					   high = excluded.high, low = excluded.low, fetched_at = excluded.fetched_at, days = excluded.days`
				)
				.bind(k, w.date, w.offset, w.high, w.low, now, JSON.stringify(w.days))
				.run();
		} catch {
			// days column missing: save the old way so high/low keep working
			await db
				.prepare(
					`INSERT INTO weather_cache (k, date, utc_offset, high, low, fetched_at) VALUES (?, ?, ?, ?, ?, ?)
					 ON CONFLICT(k) DO UPDATE SET date = excluded.date, utc_offset = excluded.utc_offset,
					   high = excluded.high, low = excluded.low, fetched_at = excluded.fetched_at`
				)
				.bind(k, w.date, w.offset, w.high, w.low, now)
				.run();
		}
		return withToday(w.high, w.low, w.days);
	} catch (e) {
		console.error('weather fetch failed', e);
		// A same-day copy that is merely older than 6h still beats nothing.
		return isToday ? withToday(cached.high, cached.low, parseDays()) : null;
	}
}
