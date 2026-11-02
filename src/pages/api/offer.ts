// The preorder page asks this for the server's clock, so its early-bird
// countdown matches what checkout will actually charge, even if the visitor's
// own clock is wrong.
export const prerender = false;

export async function GET() {
	return new Response(JSON.stringify({ now: Date.now() }), {
		headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
	});
}
