// Poll API. GET returns the running results (and this visitor's own vote);
// POST records or replaces a vote. Results come from the poll_tallies
// counters, so a GET reads only a few rows however many people have voted.
import { POLLS } from '../../../data/polls';

export const prerender = false;

const COOKIE = 'poll_voter';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLS = ['r1', 'r2', 'r3'] as const;

function readVoter(request: Request): string | null {
	const m = (request.headers.get('Cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
	return m && UUID_RE.test(m[1]) ? m[1] : null;
}

export async function GET({ params, request, locals }) {
	const poll = POLLS[params.id ?? ''];
	const db = locals.runtime?.env?.DB;
	if (!poll) return json({ error: 'Poll not found.' }, 404);
	if (!db) return json({ error: 'Voting is not available right now.' }, 503);

	const voter = readVoter(request);
	const [tallies, mine] = await Promise.all([
		db.prepare('SELECT style, r1, r2, r3 FROM poll_tallies WHERE poll = ?').bind(params.id).all(),
		voter
			? db
					.prepare('SELECT first, second, third FROM poll_votes WHERE poll = ? AND voter = ?')
					.bind(params.id, voter)
					.first()
			: Promise.resolve(null),
	]);
	return json(summarise(poll, tallies.results ?? [], mine), 200);
}

export async function POST({ params, request, locals }) {
	const poll = POLLS[params.id ?? ''];
	const db = locals.runtime?.env?.DB;
	if (!poll) return json({ error: 'Poll not found.' }, 404);
	if (!db) return json({ error: 'Voting is not available right now.' }, 503);

	// Only accept votes sent from this site's own pages.
	const origin = request.headers.get('Origin');
	if (origin && origin !== new URL(request.url).origin) return json({ error: 'Not allowed.' }, 403);

	let picks: string[];
	try {
		const body = await request.json();
		picks = Array.isArray(body.picks) ? body.picks : [];
	} catch {
		return json({ error: 'Invalid request.' }, 400);
	}
	const valid = new Set(poll.options.map((o) => o.id));
	if (
		picks.length < 1 ||
		picks.length > poll.maxPicks ||
		new Set(picks).size !== picks.length ||
		!picks.every((p) => typeof p === 'string' && valid.has(p))
	) {
		return json({ error: 'Please pick between 1 and 3 different options.' }, 400);
	}

	const newVoter = readVoter(request) ?? crypto.randomUUID();
	const now = Math.floor(Date.now() / 1000);
	const id = params.id;

	const old = (await db
		.prepare('SELECT first, second, third FROM poll_votes WHERE poll = ? AND voter = ?')
		.bind(id, newVoter)
		.first()) as { first: string; second: string | null; third: string | null } | null;

	const stmts: any[] = [];
	// Undo this visitor's previous vote in the totals, then add the new one.
	if (old) {
		[old.first, old.second, old.third].forEach((s, i) => {
			if (s && valid.has(s)) {
				stmts.push(
					db
						.prepare(`UPDATE poll_tallies SET ${COLS[i]} = MAX(${COLS[i]} - 1, 0) WHERE poll = ? AND style = ?`)
						.bind(id, s),
				);
			}
		});
	}
	picks.forEach((s, i) => {
		const seed = [0, 0, 0];
		seed[i] = 1;
		stmts.push(
			db
				.prepare(
					`INSERT INTO poll_tallies (poll, style, r1, r2, r3) VALUES (?, ?, ?, ?, ?)
					 ON CONFLICT(poll, style) DO UPDATE SET ${COLS[i]} = ${COLS[i]} + 1`,
				)
				.bind(id, s, seed[0], seed[1], seed[2]),
		);
	});
	stmts.push(
		db
			.prepare(
				`INSERT INTO poll_votes (poll, voter, first, second, third, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?)
				 ON CONFLICT(poll, voter) DO UPDATE SET
				   first = excluded.first, second = excluded.second, third = excluded.third,
				   updated_at = excluded.updated_at`,
			)
			.bind(id, newVoter, picks[0], picks[1] ?? null, picks[2] ?? null, now, now),
	);
	await db.batch(stmts);

	const tallies = await db.prepare('SELECT style, r1, r2, r3 FROM poll_tallies WHERE poll = ?').bind(id).all();
	const res = json(
		summarise(poll, tallies.results ?? [], { first: picks[0], second: picks[1] ?? null, third: picks[2] ?? null }),
		200,
	);
	res.headers.append(
		'Set-Cookie',
		`${COOKIE}=${newVoter}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`,
	);
	return res;
}

function summarise(poll: (typeof POLLS)[string], rows: any[], mine: any) {
	const by = new Map(rows.map((r) => [r.style, r]));
	const results = poll.options.map((o) => {
		const t = by.get(o.id) ?? { r1: 0, r2: 0, r3: 0 };
		return { id: o.id, r1: t.r1, r2: t.r2, r3: t.r3, points: t.r1 * 3 + t.r2 * 2 + t.r3 };
	});
	return {
		voters: results.reduce((n, r) => n + r.r1, 0), // everyone has exactly one first pick
		results,
		mine: mine ? [mine.first, mine.second, mine.third].filter(Boolean) : null,
	};
}

function json(data: unknown, status: number) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
	});
}
