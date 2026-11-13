// Custom Worker entry: everything Astro normally does, plus a cron handler
// that runs the status checks every 5 minutes (see "triggers" in wrangler.json),
// the email alerts once an hour, and the daily orders summary at midnight Perth time.
import type { SSRManifest } from 'astro';
import { App } from 'astro/app';
import { handle } from '@astrojs/cloudflare/handler';
import { runStatusChecks } from './lib/status';
import { runAlerts } from './lib/alerts';
import { runDailySummary } from './lib/dailySummary';

export function createExports(manifest: SSRManifest) {
	const app = new App(manifest);

	const fetch = async (request: Request, env: any, ctx: any) => {
		return await handle(manifest, app, request, env, ctx);
	};

	const scheduled = async (_event: unknown, env: any, ctx: any) => {
		ctx.waitUntil(
			runStatusChecks(env, (req) => fetch(req, env, ctx)).catch((err) => {
				console.error('status checks failed:', err?.stack || err);
			}),
		);
		// email alerts (battery low, not checking in, updated): once an hour
		ctx.waitUntil(runAlerts(env).catch((err) => console.error('alerts failed:', err?.stack || err)));
		// the day's pre-orders, emailed to you just after midnight Perth time (16:00 UTC)
		const t = new Date();
		if (t.getUTCHours() === 16 && t.getUTCMinutes() < 5)
			ctx.waitUntil(runDailySummary(env).catch((err) => console.error('daily summary failed:', err?.stack || err)));
	};

	return { default: { fetch, scheduled } };
}
