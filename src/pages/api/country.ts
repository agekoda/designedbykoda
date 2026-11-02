// Tells the preorder page which country the visitor is in (from Cloudflare),
// so it can start with the right country, price and shipping selected.
export const prerender = false;

export async function GET({ request }) {
	const cf = (request as any).cf;
	const country = typeof cf?.country === 'string' ? cf.country : '';
	return new Response(JSON.stringify({ country }), {
		headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
	});
}
