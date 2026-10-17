// Machine-readable status (for uptime monitors, widgets, etc.)
export const prerender = false;
import { loadStatus } from '../../lib/status';

export async function GET({ locals }) {
	const data = await loadStatus(locals.runtime?.env ?? {});
	const body = {
		status: data.overall,
		lastCheck: data.lastCheck,
		components: data.components.map((c) => ({
			id: c.id,
			name: c.label,
			state: c.state,
			uptime90d: c.uptime === null ? null : Math.round(c.uptime * 100) / 100,
		})),
		ongoingIncidents: data.incidents
			.filter((i) => i.resolved === null)
			.map((i) => ({ title: i.title, severity: i.severity, since: i.started })),
	};
	return new Response(JSON.stringify(body), {
		headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30' },
	});
}
