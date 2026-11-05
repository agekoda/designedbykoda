// Browser helpers for the dashboard's live previews: loads the font data, builds
// sample events, and paints the 1-bit screen onto a canvas.
import { renderEink } from './render';
import { loadFontPack, renderDrawList, SCREEN_W, SCREEN_H, type Rendered } from './preview';
import { renderLayout } from './layouts';
import type { CalEvent, TaskItem } from './context';
import type { CustomLayout } from './builder/model';

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

// A typical working day, for the Timeline preview (which needs several events today, with ends).
export function sampleDay(nowLocal: number): CalEvent[] {
	const day = Math.floor(nowLocal / 86400) * 86400;
	const at = (h: number, m = 0) => day + h * 3600 + m * 60;
	return [
		{ title: 'Mum\'s birthday', startLocal: day, endLocal: day + 86400, allDay: true },
		{ title: 'Team standup', startLocal: at(9, 30), endLocal: at(10), allDay: false },
		{ title: 'Design review', startLocal: at(11), endLocal: at(12, 30), allDay: false },
		{ title: 'Lunch with Sam', startLocal: at(13), endLocal: at(14), allDay: false },
		{ title: 'Project review', startLocal: at(15, 15), endLocal: at(16, 15), allDay: false },
	];
}

// Example tasks for the To-do preview.
export const SAMPLE_TASKS: TaskItem[] = [
	{ title: 'Book the dentist', done: false, due: 'overdue' },
	{ title: 'Reply to Milah', done: false, due: 'today' },
	{ title: 'Buy a birthday present', done: false, due: 'tomorrow' },
	{ title: 'Order new e-ink panels', done: false },
	{ title: 'Water the plants', done: false },
	{ title: 'Pay the electricity bill', done: true },
	{ title: 'Back up the photos', done: true },
];
// The sample tasks' due dates are written as words, so they stay overdue / today / tomorrow whatever the date is.
function sampleTasks(nowLocal: number): TaskItem[] {
	const day = Math.floor(nowLocal / 86400);
	const iso = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10);
	return SAMPLE_TASKS.map((t) => (t.due === 'overdue' ? { ...t, due: iso(day - 1) } : t.due === 'today' ? { ...t, due: iso(day) } : t.due === 'tomorrow' ? { ...t, due: iso(day + 1) } : t));
}

// Made-up forecast for previews: a mix of conditions so every icon gets seen.
function sampleWeather(nowLocal: number) {
	const day = Math.floor(nowLocal / 86400);
	const iso = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10);
	const mk = [
		[2, 21, 12, 20, 14],
		[61, 18, 11, 70, 22],
		[0, 24, 13, 0, 9],
		[3, 20, 12, 15, 17],
		[95, 17, 10, 80, 30],
	];
	const days = mk.map(([code, high, low, rain, wind], i) => ({ date: iso(day + i), code, high, low, rain, wind }));
	return { high: 21, low: 12, code: 2, rain: 20, wind: 14, days };
}

export interface PreviewOptions {
	style: string;
	font?: string | null;
	dark: boolean;
	hasWeather: boolean;
	vbat?: number | null;
	cornerImage?: Uint8Array | null;
	cornerSize?: { w: number; h: number } | null;
	refreshSec?: number;
	loc?: { lat: number; lon: number } | null; // where the calendar lives (Moon & Sun)
	countdown?: { title: string; date: string } | null;
	frameImage?: Uint8Array | null; // Photo frame
	tasksState?: 'ok' | 'needs_permission'; // To-do: pretend we can / cannot read Google Tasks
	custom?: CustomLayout | null; // Your own design (layout builder)
}

export function drawListFor(o: PreviewOptions): string {
	let nowLocal = Math.floor(Date.now() / 1000) - new Date().getTimezoneOffset() * 60;
	const timeline = o.style === 'timeline';
	// The live Timeline preview pretends it is 9:00 am, so the moving bar is always on show.
	if (timeline && (o.refreshSec ?? 86400) < 86400) nowLocal = Math.floor(nowLocal / 86400) * 86400 + 9 * 3600;
	return renderLayout(
		o.style,
		{
			nowLocal,
			events: timeline ? sampleDay(nowLocal) : sampleEvents(nowLocal),
			weather: o.hasWeather ? sampleWeather(nowLocal) : null,
			vbat: o.vbat ?? null,
			dark: o.dark,
			cornerImage: o.cornerImage ?? null,
			cornerSize: o.cornerSize ?? null,
			refreshSec: o.refreshSec ?? 86400,
			loc: o.loc ?? null,
			utcOffsetSec: -new Date().getTimezoneOffset() * 60,
			countdown: o.countdown ?? null,
			frameImage: o.frameImage ?? null,
			tasks: o.tasksState === 'needs_permission' ? null : sampleTasks(nowLocal),
			tasksState: o.tasksState ?? 'ok',
			custom: o.custom ?? null,
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


// Full-screen previews (400x300 buffers) go through the shared e-paper renderer.
// "screen" = just the panel, "device" = the panel inside the device mockup.
// The draw-list renderer already bakes dark mode into the pixels, so dark is never passed on.
export function paintScreen(canvas: HTMLCanvasElement, px: Uint8Array, opts: { mode?: 'screen' | 'device'; scale?: number; width?: number } = {}) {
	renderEink(canvas as any, px, { mode: opts.mode ?? 'screen', scale: opts.scale ?? 1, width: opts.width, texture: 1 });
}
