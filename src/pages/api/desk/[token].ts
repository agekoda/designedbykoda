// Set the desk name plate's status, no sign-in needed: the private link is the key.
//   GET  /api/desk/<token>                       what it says now
//   GET  /api/desk/<token>?text=In+a+meeting&mins=60   set it (for an iPhone Shortcut: "Get contents of URL")
//   GET  /api/desk/<token>?clear=1               back to free or busy from the calendar
//   POST the same, as JSON { text, mins } or { clear: true }
import { statusByToken, setStatus, activeStatus, STATUS_PRESETS } from '../../../lib/deskStatus';
export const prerender = false;

const reply = (request: Request, data: any, status = 200) => {
	// a Shortcut or a browser address bar gets a short line of text; the phone page asks for JSON
	const wantsJson = (request.headers.get('accept') ?? '').includes('application/json') || request.method === 'POST';
	if (wantsJson) return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
	const left = data.now?.until ? Math.max(1, Math.round((data.now.until - Date.now() / 1000) / 60)) : 0;
	const line = data.error ?? (data.now ? `Set to "${data.now.text}"${left ? ` for ${left >= 120 ? Math.round(left / 60) + ' hours' : left + ' min'}` : ''}. It shows on the calendar at its next check.` : 'Cleared. The sign goes back to free or busy from your calendar.');
	return new Response(line + '\n', { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
};

async function handle(request: Request, locals: any, token: string, input: { text?: unknown; mins?: unknown; clear?: unknown } | null) {
	const db = locals.runtime?.env?.DB;
	if (!db) return reply(request, { error: 'Server is not fully configured yet.' }, 500);
	const s = await statusByToken(db, token);
	if (!s) return reply(request, { error: 'This link has been turned off, or made new. Get the current one from your dashboard.' }, 404);
	const now = Math.floor(Date.now() / 1000);
	if (input && (input.clear || input.text !== undefined)) {
		const mins = input.mins === undefined || input.mins === null || input.mins === '' ? null : Math.round(Number(input.mins));
		await setStatus(db, token, input.clear ? '' : String(input.text ?? ''), Number.isFinite(mins as number) ? (mins as number) : null, now);
	}
	const fresh = await statusByToken(db, token);
	return reply(request, { ok: true, now: activeStatus(fresh, now), presets: STATUS_PRESETS });
}

export async function GET({ request, locals, params }: any) {
	const q = new URL(request.url).searchParams;
	const input = q.has('clear') ? { clear: true } : q.has('text') ? { text: q.get('text'), mins: q.get('mins') } : null;
	return handle(request, locals, String(params.token ?? ''), input);
}

export async function POST({ request, locals, params }: any) {
	let body: any = null;
	try {
		body = await request.json();
	} catch {}
	return handle(request, locals, String(params.token ?? ''), body ?? {});
}
