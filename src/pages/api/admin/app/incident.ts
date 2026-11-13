// Status page incidents from the owner app: add, edit, close, reopen, delete. Owner only.
import { isAdmin, sameOrigin } from '../../../../lib/admin';
import { COMPONENTS } from '../../../../lib/status';

export const prerender = false;
const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const SEVERITIES = ['outage', 'degraded', 'maintenance', 'info'];

export async function POST({ request, locals, cookies }: any) {
	const env = locals.runtime?.env ?? {};
	if (!sameOrigin(request) || !(await isAdmin(cookies, env))) return json({ ok: false, error: 'Not signed in.' }, 401);
	const db = env.DB;
	if (!db) return json({ ok: false, error: 'No database.' }, 500);
	const b: any = await request.json().catch(() => null);
	const now = Math.floor(Date.now() / 1000);
	const id = Number(b?.id);
	const text = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
	try {
		if (b?.action === 'add' || b?.action === 'edit') {
			const title = text(b.title, 140);
			const body = text(b.body, 600) || null;
			const component = COMPONENTS.some((c) => c.id === b.component) ? b.component : null;
			const severity = SEVERITIES.includes(b.severity) ? b.severity : 'info';
			if (!title) return json({ ok: false, error: 'Give it a title.' }, 400);
			if (b.action === 'add') {
				const mins = Math.min(Math.max(Number(b.minutesAgo) || 0, 0), 60 * 24 * 30);
				await db
					.prepare("INSERT INTO status_incidents (component, title, body, severity, source, started_at) VALUES (?, ?, ?, ?, 'manual', ?)")
					.bind(component, title, body, severity, now - Math.round(mins * 60))
					.run();
			} else {
				if (!id) return json({ ok: false, error: 'Which incident?' }, 400);
				await db.prepare('UPDATE status_incidents SET component = ?, title = ?, body = ?, severity = ? WHERE id = ?').bind(component, title, body, severity, id).run();
			}
			return json({ ok: true });
		}
		if (!id) return json({ ok: false, error: 'Which incident?' }, 400);
		if (b.action === 'close') await db.prepare('UPDATE status_incidents SET resolved_at = ? WHERE id = ? AND resolved_at IS NULL').bind(now, id).run();
		else if (b.action === 'reopen') await db.prepare('UPDATE status_incidents SET resolved_at = NULL WHERE id = ?').bind(id).run();
		else if (b.action === 'delete') await db.prepare('DELETE FROM status_incidents WHERE id = ?').bind(id).run();
		else return json({ ok: false, error: 'Unknown action.' }, 400);
		return json({ ok: true });
	} catch {
		return json({ ok: false, error: 'The status tables are missing (schema-status.sql).' }, 500);
	}
}
