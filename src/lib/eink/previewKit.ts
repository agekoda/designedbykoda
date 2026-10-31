// Browser helpers for the dashboard's live previews: loads the font data, builds
// sample events, and paints the 1-bit screen onto a canvas.
import { loadFontPack, renderDrawList, SCREEN_W, SCREEN_H, type Rendered } from './preview';
import { renderLayout } from './layouts';
import type { CalEvent } from './context';

let fontsPromise: Promise<ReturnType<typeof loadFontPack>> | null = null;
export function loadFonts() {
	if (!fontsPromise) {
		fontsPromise = fetch('/eink/fonts.json')
			.then((r) => {
				if (!r.ok) throw new Error('fonts');
				return r.json();
			})
			.then(loadFontPack);
		fontsPromise.catch(() => (fontsPromise = null));
	}
	return fontsPromise;
}

// Example events so the preview has something to show. They move with today's date.
export function sampleEvents(nowLocal: number): CalEvent[] {
	const day = Math.floor(nowLocal / 86400) * 86400;
	const at = (d: number, h: number, m = 0) => day + d * 86400 + h * 3600 + m * 60;
	const h = new Date(nowLocal * 1000).getUTCHours() + 1; // next hour, so something is always "upcoming"
	return [
		{ title: 'Team standup', startLocal: Math.max(nowLocal + 1800, at(0, Math.min(h, 22))), allDay: false },
		{ title: 'Lunch with Sam', startLocal: at(1, 12, 30), allDay: false },
		{ title: 'Dentist', startLocal: at(1, 15), allDay: false },
		{ title: 'Project review', startLocal: at(2, 10), allDay: false },
		{ title: "Mum's birthday", startLocal: at(3, 0), allDay: true },
		{ title: 'Climbing', startLocal: at(3, 18, 30), allDay: false },
		{ title: 'Flight to Melbourne', startLocal: at(5, 7, 15), allDay: false },
		{ title: 'Concert', startLocal: at(6, 20), allDay: false },
	];
}

export interface PreviewOptions {
	style: string;
	font?: string | null;
	dark: boolean;
	hasWeather: boolean;
	vbat?: number | null;
	cornerImage?: Uint8Array | null;
}

export function drawListFor(o: PreviewOptions): string {
	const nowLocal = Math.floor(Date.now() / 1000) - new Date().getTimezoneOffset() * 60;
	return renderLayout(
		o.style,
		{
			nowLocal,
			events: sampleEvents(nowLocal),
			weather: o.hasWeather ? { high: 21, low: 12 } : null,
			vbat: o.vbat ?? null,
			dark: o.dark,
			cornerImage: o.cornerImage ?? null,
		},
		o.font ?? undefined
	);
}

export async function renderPreview(o: PreviewOptions): Promise<Rendered> {
	const fonts = await loadFonts();
	return renderDrawList(drawListFor(o), fonts);
}

// Paints the screen with e-ink-ish colours. `scale` repeats each pixel into a block.
const INK = [20, 20, 20];
const PAPER = [223, 219, 208];
export function paint(canvas: HTMLCanvasElement, px: Uint8Array, scale = 1, w = SCREEN_W, h = SCREEN_H) {
	canvas.width = w * scale;
	canvas.height = h * scale;
	const ctx = canvas.getContext('2d')!;
	const img = ctx.createImageData(w * scale, h * scale);
	const d = img.data;
	for (let y = 0; y < h * scale; y++) {
		const sy = Math.floor(y / scale);
		for (let x = 0; x < w * scale; x++) {
			const c = px[sy * w + Math.floor(x / scale)] ? PAPER : INK;
			const o = (y * w * scale + x) * 4;
			d[o] = c[0];
			d[o + 1] = c[1];
			d[o + 2] = c[2];
			d[o + 3] = 255;
		}
	}
	ctx.putImageData(img, 0, 0);
}
