// Status page logic: the checks that run every 5 minutes (from the Worker's
// cron trigger) and the queries the /status page reads.

export type ComponentId =
	| 'website'
	| 'device_api'
	| 'database'
	| 'google_signin'
	| 'google_calendar';

export const COMPONENTS: { id: ComponentId; label: string; blurb: string }[] = [
	{ id: 'website', label: 'Website', blurb: 'designedbykoda.com pages and the dashboard' },
	{ id: 'device_api', label: 'Calendar device API', blurb: 'What your e-ink calendar talks to when it wakes up' },
	{ id: 'database', label: 'Database', blurb: 'Stores pairing, devices and settings' },
	{ id: 'google_signin', label: 'Google sign-in', blurb: 'Used to connect your Google account (Google)' },
	{ id: 'google_calendar', label: 'Google Calendar', blurb: 'Where your events come from (Google)' },
];

const ORIGIN = 'https://designedbykoda.com';
const TIMEOUT_MS = 8000;
const SLOW_MS = 3000;

type Result = { component: ComponentId; ok: boolean; ms: number; detail: string | null };

async function timed(
	component: ComponentId,
	fn: () => Promise<{ ok: boolean; detail?: string }>,
): Promise<Result> {
	const t0 = Date.now();
	try {
		const r = await fn();
		return { component, ok: r.ok, ms: Date.now() - t0, detail: r.ok ? null : r.detail ?? 'failed' };
	} catch (err) {
		const name = (err as Error)?.name;
		return {
			component,
			ok: false,
			ms: Date.now() - t0,
			detail: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'unreachable',
		};
	}
}

const signal = () => AbortSignal.timeout(TIMEOUT_MS);

// Most recent check per component. One indexed LIMIT 1 lookup each (uses
// idx_status_checks_comp_ts), so it reads ~5 rows instead of scanning the whole
// 3-day table, which a GROUP BY MAX(id) subquery does on every call.
async function latestChecks(db: any): Promise<any[]> {
	const res = await db.batch(
		COMPONENTS.map((c) =>
			db
				.prepare(
					'SELECT component, ok, ms, ts FROM status_checks WHERE component = ? ORDER BY ts DESC LIMIT 1',
				)
				.bind(c.id),
		),
	);
	return res.flatMap((r: any) => r.results ?? []);
}

// `appFetch` runs a request through this same Worker in-process, so the
// checks exercise the real code path without needing to loop back through
// the public internet.
export async function runStatusChecks(env: any, appFetch: (req: Request) => Promise<Response>) {
	const db = env.DB;
	if (!db) return;

	const results = await Promise.all([
		timed('website', async () => {
			// Static pages come straight from the assets binding.
			const res = env.ASSETS
				? await env.ASSETS.fetch(new Request(`${ORIGIN}/`))
				: await fetch(`${ORIGIN}/`, { signal: signal() });
			return { ok: res.status < 400, detail: `HTTP ${res.status}` };
		}),
		timed('device_api', async () => {
			// No credentials on purpose: a healthy API answers 401. A 5xx or
			// a missing route means something is actually broken.
			const res = await appFetch(
				new Request(`${ORIGIN}/api/device/status-check/today`, {
					headers: { 'User-Agent': 'status-check' },
				}),
			);
			return { ok: res.status === 401, detail: `HTTP ${res.status}` };
		}),
		timed('database', async () => {
			const row = await db.prepare('SELECT COUNT(*) AS n FROM devices').first();
			return { ok: !!row, detail: 'no response' };
		}),
		timed('google_signin', async () => {
			const res = await fetch('https://accounts.google.com/.well-known/openid-configuration', {
				signal: signal(),
			});
			return { ok: res.ok, detail: `HTTP ${res.status}` };
		}),
		timed('google_calendar', async () => {
			const res = await fetch(
				'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest?fields=id',
				{ signal: signal() },
			);
			return { ok: res.ok, detail: `HTTP ${res.status}` };
		}),
	]);

	const now = Math.floor(Date.now() / 1000);
	const day = new Date(now * 1000).toISOString().slice(0, 10);

	// Previous result per component, read before we insert the new one.
	const prev = new Map<string, { ok: number; ts: number }>(
		(await latestChecks(db)).map((r: any) => [r.component, r]),
	);
	const openRows = await db
		.prepare(
			`SELECT id, component FROM status_incidents
			 WHERE source = 'auto' AND resolved_at IS NULL`,
		)
		.all();
	const open = new Map<string, number>((openRows.results ?? []).map((r: any) => [r.component, r.id]));

	const stmts: any[] = [];
	for (const r of results) {
		stmts.push(
			db
				.prepare('INSERT INTO status_checks (component, ts, ok, ms, detail) VALUES (?, ?, ?, ?, ?)')
				.bind(r.component, now, r.ok ? 1 : 0, r.ms, r.detail),
		);
		stmts.push(
			db
				.prepare(
					`INSERT INTO status_daily (day, component, checks, ok_checks, ms_total)
					 VALUES (?, ?, 1, ?, ?)
					 ON CONFLICT(day, component) DO UPDATE SET
					   checks = checks + 1,
					   ok_checks = ok_checks + excluded.ok_checks,
					   ms_total = ms_total + excluded.ms_total`,
				)
				.bind(day, r.component, r.ok ? 1 : 0, r.ok ? r.ms : 0),
		);

		const p = prev.get(r.component);
		const openId = open.get(r.component);
		const label = COMPONENTS.find((c) => c.id === r.component)!.label;
		if (!r.ok && p && p.ok === 0 && !openId) {
			// Two failures in a row: record an outage starting at the first one.
			stmts.push(
				db
					.prepare(
						`INSERT INTO status_incidents (component, title, body, severity, source, started_at)
						 VALUES (?, ?, ?, 'outage', 'auto', ?)`,
					)
					.bind(r.component, `${label} is not responding`, r.detail, p.ts),
			);
		} else if (r.ok && openId) {
			stmts.push(
				db.prepare('UPDATE status_incidents SET resolved_at = ? WHERE id = ?').bind(now, openId),
			);
		}
	}

	// Housekeeping.
	stmts.push(db.prepare('DELETE FROM status_checks WHERE ts < ?').bind(now - 3 * 86400));
	stmts.push(
		db
			.prepare('DELETE FROM status_daily WHERE day < ?')
			.bind(new Date((now - 120 * 86400) * 1000).toISOString().slice(0, 10)),
	);

	await db.batch(stmts);
}

// ---------------------------------------------------------------------------
// Reading side (used by /status)
// ---------------------------------------------------------------------------

export type ComponentState = 'operational' | 'slow' | 'outage' | 'unknown';

export type ComponentView = {
	id: ComponentId;
	label: string;
	blurb: string;
	state: ComponentState;
	ms: number | null;
	avgMs: number | null;
	uptime: number | null; // percent over the window, or null with no data
	days: { day: string; pct: number | null }[]; // oldest first
};

export type IncidentView = {
	id: number;
	component: string | null;
	componentLabel: string | null;
	title: string;
	body: string | null;
	severity: string;
	source: string;
	started: number;
	resolved: number | null;
};

export type StatusData = {
	components: ComponentView[];
	incidents: IncidentView[];
	lastCheck: number | null;
	lastDeviceSeen: number | null;
	devicesActive24h: number | null;
	overall: 'operational' | 'degraded' | 'partial' | 'major' | 'maintenance' | 'unknown';
	demo: boolean;
};

const DAYS = 90;

function dayList(): string[] {
	const out: string[] = [];
	const today = Date.UTC(
		new Date().getUTCFullYear(),
		new Date().getUTCMonth(),
		new Date().getUTCDate(),
	);
	for (let i = DAYS - 1; i >= 0; i--) out.push(new Date(today - i * 86400000).toISOString().slice(0, 10));
	return out;
}

function summarise(components: ComponentView[], incidents: IncidentView[], lastCheck: number | null) {
	const ongoing = incidents.filter((i) => i.resolved === null);
	const outages = components.filter((c) => c.state === 'outage');
	if (lastCheck === null && components.every((c) => c.state === 'unknown')) return 'unknown' as const;
	if (outages.length >= 3) return 'major' as const;
	if (outages.length > 0) return 'partial' as const;
	if (ongoing.some((i) => i.severity === 'outage')) return 'partial' as const;
	if (ongoing.some((i) => i.severity === 'maintenance')) return 'maintenance' as const;
	if (components.some((c) => c.state === 'slow') || ongoing.some((i) => i.severity === 'degraded'))
		return 'degraded' as const;
	return 'operational' as const;
}

export async function loadStatus(env: any): Promise<StatusData> {
	const db = env?.DB;
	const days = dayList();
	const empty: StatusData = {
		components: COMPONENTS.map((c) => ({
			...c,
			state: 'unknown',
			ms: null,
			avgMs: null,
			uptime: null,
			days: days.map((day) => ({ day, pct: null })),
		})),
		incidents: [],
		lastCheck: null,
		lastDeviceSeen: null,
		devicesActive24h: null,
		overall: 'unknown',
		demo: false,
	};
	if (!db) return empty;

	try {
		const now = Math.floor(Date.now() / 1000);
		const since = days[0];
		const [daily, latest, avg, incRows, dev] = await Promise.all([
			db.prepare('SELECT day, component, checks, ok_checks FROM status_daily WHERE day >= ?').bind(since).all(),
			latestChecks(db).then((results) => ({ results })),
			db
				.prepare(
					`SELECT component, AVG(ms) AS avg_ms FROM status_checks
					 WHERE ts > ? AND ok = 1 GROUP BY component`,
				)
				.bind(now - 86400)
				.all(),
			db
				.prepare(
					`SELECT id, component, title, body, severity, source, started_at, resolved_at
					 FROM status_incidents
					 WHERE started_at > ? OR resolved_at IS NULL
					 ORDER BY started_at DESC LIMIT 60`,
				)
				.bind(now - DAYS * 86400)
				.all(),
			// Two index-backed lookups (idx_devices_last_seen), so this stays
			// cheap however many devices exist: MAX reads 1 row, COUNT only
			// walks the rows seen in the last 24 hours.
			db
				.prepare(
					`SELECT (SELECT MAX(last_seen_at) FROM devices) AS last,
					        (SELECT COUNT(*) FROM devices WHERE last_seen_at > ?) AS n`,
				)
				.bind(now - 86400)
				.first(),
		]);

		const dailyBy = new Map<string, { checks: number; ok: number }>();
		for (const r of daily.results ?? []) dailyBy.set(`${r.component}|${r.day}`, { checks: r.checks, ok: r.ok_checks });
		const latestBy = new Map<string, any>((latest.results ?? []).map((r: any) => [r.component, r]));
		const avgBy = new Map<string, number>((avg.results ?? []).map((r: any) => [r.component, r.avg_ms]));

		const components: ComponentView[] = COMPONENTS.map((c) => {
			let checks = 0;
			let ok = 0;
			const dayViews = days.map((day) => {
				const d = dailyBy.get(`${c.id}|${day}`);
				if (!d || d.checks === 0) return { day, pct: null };
				checks += d.checks;
				ok += d.ok;
				return { day, pct: (d.ok / d.checks) * 100 };
			});
			const l = latestBy.get(c.id);
			const fresh = l && now - l.ts < 20 * 60;
			let state: ComponentState = 'unknown';
			if (l && fresh) state = !l.ok ? 'outage' : l.ms > SLOW_MS ? 'slow' : 'operational';
			return {
				...c,
				state,
				ms: l?.ok ? l.ms : null,
				avgMs: avgBy.has(c.id) ? Math.round(avgBy.get(c.id)!) : null,
				uptime: checks ? (ok / checks) * 100 : null,
				days: dayViews,
			};
		});

		const labelOf = (id: string | null) => COMPONENTS.find((c) => c.id === id)?.label ?? null;
		const incidents: IncidentView[] = (incRows.results ?? []).map((r: any) => ({
			id: r.id,
			component: r.component,
			componentLabel: labelOf(r.component),
			title: r.title,
			body: r.body,
			severity: r.severity,
			source: r.source,
			started: r.started_at,
			resolved: r.resolved_at,
		}));

		const lastCheck = (latest.results ?? []).reduce((m: number, r: any) => Math.max(m, r.ts), 0) || null;
		return {
			components,
			incidents,
			lastCheck,
			lastDeviceSeen: (dev as any)?.last ?? null,
			devicesActive24h: (dev as any)?.n ?? 0,
			overall: summarise(components, incidents, lastCheck),
			demo: false,
		};
	} catch {
		// Tables not created yet, or D1 hiccup: show "no data" rather than a 500.
		return empty;
	}
}

// Made-up data so the page can be previewed (and the outage look checked)
// without waiting for a real outage: /status?demo=outage
export function demoStatus(kind: string): StatusData {
	const days = dayList();
	const now = Math.floor(Date.now() / 1000);
	const rnd = (n: number) => {
		const x = Math.sin(n * 9301 + 49297) * 233280;
		return x - Math.floor(x);
	};
	const components: ComponentView[] = COMPONENTS.map((c, ci) => {
		const dayViews = days.map((day, i) => {
			let pct = 100;
			if (rnd(i + ci * 7) > 0.93) pct = 97 + rnd(i) * 2.4;
			if (c.id === 'device_api' && (i === 61 || i === 62)) pct = i === 61 ? 82.3 : 99.1;
			if (c.id === 'google_calendar' && i === 40) pct = 91;
			if (i < 6 && c.id !== 'website') return { day, pct: null };
			return { day, pct };
		});
		const real = dayViews.filter((d) => d.pct !== null) as { pct: number }[];
		let uptime = real.reduce((s, d) => s + d.pct, 0) / real.length;
		let state: ComponentState = 'operational';
		let ms: number | null = 80 + Math.round(rnd(ci) * 200);
		if (kind === 'outage' && c.id === 'device_api') {
			state = 'outage';
			ms = null;
			uptime -= 0.4;
			dayViews[dayViews.length - 1].pct = 71.4;
		}
		if (kind === 'outage' && c.id === 'google_calendar') {
			state = 'slow';
			ms = 4200;
		}
		return { ...c, state, ms, avgMs: 90 + Math.round(rnd(ci + 3) * 240), uptime, days: dayViews };
	});
	const incidents: IncidentView[] = [];
	if (kind === 'outage') {
		incidents.push({
			id: 9,
			component: 'device_api',
			componentLabel: 'Calendar device API',
			title: 'Calendar device API is not responding',
			body: 'HTTP 502',
			severity: 'outage',
			source: 'auto',
			started: now - 47 * 60,
			resolved: null,
		});
	}
	incidents.push(
		{
			id: 8,
			component: 'device_api',
			componentLabel: 'Calendar device API',
			title: 'Calendar device API is not responding',
			body: 'timeout',
			severity: 'outage',
			source: 'auto',
			started: now - 28 * 86400 - 3600,
			resolved: now - 28 * 86400 + 1500,
		},
		{
			id: 7,
			component: 'google_calendar',
			componentLabel: 'Google Calendar',
			title: 'Google Calendar is not responding',
			body: 'HTTP 503',
			severity: 'outage',
			source: 'auto',
			started: now - 50 * 86400,
			resolved: now - 50 * 86400 + 2400,
		},
		{
			id: 6,
			component: null,
			componentLabel: null,
			title: 'Planned maintenance: database migration',
			body: 'Calendars may update a few minutes late while this happens.',
			severity: 'maintenance',
			source: 'manual',
			started: now - 71 * 86400,
			resolved: now - 71 * 86400 + 1800,
		},
	);
	return {
		components,
		incidents,
		lastCheck: now - 140,
		lastDeviceSeen: now - 9 * 60,
		devicesActive24h: 14,
		overall: summarise(components, incidents, now),
		demo: true,
	};
}
