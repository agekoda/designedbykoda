// Reads the person's Google Tasks (their default list) for the To-do layout.
// Read-only: ticking tasks off is done in Google Tasks / Google Calendar as usual.
import type { TaskItem } from './eink/context';

export type TasksResult = { state: 'ok'; tasks: TaskItem[] } | { state: 'needs_permission' | 'error'; tasks: null };

export async function fetchTasks(accessToken: string, nowMs: number): Promise<TasksResult> {
	try {
		const url = new URL('https://tasks.googleapis.com/tasks/v1/lists/@default/tasks');
		url.searchParams.set('showCompleted', 'true');
		url.searchParams.set('showHidden', 'false');
		url.searchParams.set('maxResults', '100');
		const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
		if (res.status === 401 || res.status === 403) {
			const body = await res.text();
			console.error(`Tasks fetch refused: HTTP ${res.status} ${body.slice(0, 300)}`);
			// "insufficient scope" = the person hasn't connected Google Tasks yet. Anything else
			// (for example the Tasks API not switched on for the project) is our problem, not theirs.
			return /insufficient|ACCESS_TOKEN_SCOPE|scope/i.test(body) ? { state: 'needs_permission', tasks: null } : { state: 'error', tasks: null };
		}
		if (!res.ok) {
			console.error(`Tasks fetch failed: HTTP ${res.status}`);
			return { state: 'error', tasks: null };
		}
		const data: any = await res.json();
		const items: any[] = Array.isArray(data.items) ? data.items : [];
		const parsed = items
			.filter((t) => typeof t.title === 'string' && t.title.trim() && !t.parent) // top-level tasks only
			.map((t, i) => ({
				title: String(t.title).trim(),
				done: t.status === 'completed',
				due: typeof t.due === 'string' ? t.due.slice(0, 10) : undefined,
				completedMs: t.completed ? Date.parse(t.completed) : 0,
				pos: String(t.position ?? ''),
				i,
			}));
		const open = parsed
			.filter((t) => !t.done)
			.sort((a, b) => (a.due && b.due ? a.due.localeCompare(b.due) : a.due ? -1 : b.due ? 1 : 0) || a.pos.localeCompare(b.pos) || a.i - b.i);
		// ticked off in the last day: still shown, struck through, so you see what you got done
		const done = parsed.filter((t) => t.done && nowMs - t.completedMs < 86400_000).sort((a, b) => b.completedMs - a.completedMs);
		return { state: 'ok', tasks: [...open, ...done].map(({ title, done, due }) => ({ title, done, due })) };
	} catch (e) {
		console.error('Tasks fetch threw', e);
		return { state: 'error', tasks: null };
	}
}
