// Custom Worker entry: everything Astro normally does, plus a cron handler
// that runs the status checks every 5 minutes (see "triggers" in wrangler.json).
import type { SSRManifest } from 'astro';
import { App } from 'astro/app';
import { handle } from '@astrojs/cloudflare/handler';
import { runStatusChecks } from './lib/status';

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
	};

	return { default: { fetch, scheduled } };
}
