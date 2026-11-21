// Browser helpers for the dashboard's live previews: loads the font data, builds
// sample events, and paints the 1-bit screen onto a canvas.
import { loadJp } from './jp';
import { loadMoon } from './moonImage';
import { renderEink } from './render';
import { sanitizeReminders } from './reminders';
import { sanitizeHabits } from './habits';
import { loadFontPack, renderDrawList, SCREEN_W, SCREEN_H, type Rendered } from './preview';
import { renderLayout } from './layouts';
import type { CalEvent, TaskItem } from './context';
import { withDefaults, builtinLayout, type CustomLayout } from './builder/model';
import { feedUrl, githubUser, marketBase, marketList, youtubeRef } from '../connect';

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

// A day of appointments, for the Waiting room preview (titles the way booking systems write them).
export function sampleAppointments(nowLocal: number): CalEvent[] {
	const day = Math.floor(nowLocal / 86400) * 86400;
	const names = ['Priya Mehta - Initial consult', 'Sam Kowalski - Follow-up', 'Jordan Taylor - Follow-up', 'Mei Chen - Review', 'Lee Wong - Initial consult', 'Ava Brown - Follow-up', 'Noah Singh - Review', 'Ruby Clarke - Follow-up'];
	return names.map((title, i) => ({ title, startLocal: day + 9 * 3600 + i * 45 * 60, endLocal: day + 9 * 3600 + i * 45 * 60 + 40 * 60, allDay: false }));
}

// Example data for the connection widgets' previews (the real thing comes when the calendar updates).
export function sampleConnect(custom: CustomLayout | null | undefined, nowLocal: number) {
	if (!custom?.widgets?.some((w) => ['youtube', 'rss', 'github', 'markets', 'tides', 'uvair'].includes(w.t))) return null;
	const out: any = { sample: true, youtube: {}, feeds: {}, github: {}, markets: {} };
	let seed = 7;
	const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
	for (const w of custom.widgets) {
		const o = withDefaults(w) as any;
		if (w.t === 'youtube') out.youtube[youtubeRef(o.channel) || '@example'] = { name: 'Your channel', subs: 12480 };
		if (w.t === 'rss')
			out.feeds[feedUrl(o.url)] = {
				title: 'ABC News',
				items: ['Perth swelters through its hottest November day in a decade', 'Rate decision due on Tuesday as inflation eases', 'New bike paths planned along the Swan River foreshore', 'Scorchers name their squad for the summer season', 'How to keep your pets cool this week'],
			};
		if (w.t === 'github') {
			const levels = Array.from({ length: 371 }, (_, i) => {
				const r = rnd() * (i % 7 === 0 || i % 7 === 6 ? 0.45 : 1);
				return r < 0.3 ? 0 : r < 0.55 ? 1 : r < 0.75 ? 2 : r < 0.9 ? 3 : 4;
			}).join('');
			out.github[githubUser(o.user) || 'example'] = { total: 1234, first: '2025-11-23', levels };
		}
		if (w.t === 'markets') {
			const base = marketBase(o.base);
			const syms = marketList(o.list);
			const eg: Record<string, [number, number | null, boolean]> = { USD: [0.65, null, false], EUR: [0.6, null, false], GBP: [0.51, null, false], JPY: [99.8, null, false], NZD: [1.11, null, false], BTC: [143210, 2.1, true], ETH: [5320, -1.4, true], SOL: [312, 4.2, true], DOGE: [0.52, 0.8, true] };
			out.markets[`${base}|${syms.join(',')}`] = { base, quotes: syms.filter((x) => eg[x]).map((x) => ({ sym: x, price: eg[x][0], change: eg[x][1], crypto: eg[x][2] })) };
		}
	}
	const day = Math.floor(nowLocal / 86400) * 86400;
	out.marine = { tides: [{ at: day + 15 * 3600 + 40 * 60, h: 0.9, high: true }, { at: day + 21 * 3600 + 52 * 60, h: 0.3, high: false }, { at: day + 86400 + 4 * 3600, h: 1.0, high: true }, { at: day + 86400 + 10 * 3600, h: 0.2, high: false }].filter((t) => t.at > nowLocal), waveNow: 0.8, waveMax: 1.2, sea: 21.4 };
	out.air = { uvNow: 6, uvMax: 11, uvMaxAt: day + 13 * 3600, aqi: 32 };
	return out;
}

// Example birthdays for the Birthdays widget's preview.
export function sampleBirthdays(nowLocal: number, lang?: string) {
	const day = Math.floor(nowLocal / 86400) * 86400;
	const ja = lang === 'ja';
	return [
		{ name: ja ? 'お母さん' : 'Mum', dayLocal: day + 86400 },
		{ name: ja ? '佐藤 健' : 'Sam Kowalski', dayLocal: day + 5 * 86400 },
		{ name: ja ? 'おじいちゃん' : 'Grandpa', dayLocal: day + 12 * 86400 },
		{ name: ja ? '由美' : 'Priya', dayLocal: day + 26 * 86400 },
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
// A school week (Night before, School week): classes with rooms, one room change, things to bring,
// and a test, from this week's Monday.
export function sampleSchool(nowLocal: number): CalEvent[] {
	const today = Math.floor(nowLocal / 86400);
	const wd = new Date(today * 86400000).getUTCDay();
	const monday = wd === 6 ? today + 2 : wd === 0 ? today + 1 : today - (wd - 1);
	const P: [number, number][] = [[8, 50], [9, 45], [11, 0], [11, 55], [13, 35]];
	const week = [
		['English', 'Maths Methods', 'Physics', 'Geography', 'PE'],
		['Chemistry', 'English', 'Building & Construction', 'Maths Methods', 'Physics'],
		['Maths Methods', 'Physics', 'English', 'Chemistry', 'Geography'],
		['Geography', 'Building & Construction', 'Maths Methods', 'English', 'Chemistry'],
		['Physics', 'Chemistry', 'PE', 'Maths Methods', 'English'],
	];
	const ROOM: Record<string, string> = { English: 'B12', 'Maths Methods': 'M4', Physics: 'Lab 2', Geography: 'HEC4', PE: 'Gym', Chemistry: 'Lab 1', 'Building & Construction': 'D1' };
	const BRING: Record<string, string> = { PE: 'Sports gear', Chemistry: 'Lab coat', 'Building & Construction': 'Safety boots' };
	const out: CalEvent[] = [];
	week.forEach((day, i) =>
		day.forEach((name, p) => {
			const start = (monday + i) * 86400 + P[p][0] * 3600 + P[p][1] * 60;
			const moved = i === 2 && name === 'Physics';
			const room = moved ? 'Lab 4' : ROOM[name];
			out.push({ title: `${name} · ${room}${moved ? ' (moved)' : ''}`, name, room, moved: moved || undefined, bring: BRING[name], startLocal: start, endLocal: start + 50 * 60, allDay: false });
		})
	);
	out.push({ title: 'Physics test', name: 'Physics test', startLocal: (monday + 3) * 86400 + 9 * 3600 + 45 * 60, endLocal: (monday + 3) * 86400 + 10 * 3600 + 35 * 60, allDay: false });
	out.push({ title: 'English essay due', name: 'English essay due', startLocal: (monday + 7) * 86400, endLocal: (monday + 8) * 86400, allDay: true });
	return out.sort((a, b) => a.startLocal - b.startLocal);
}

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
	lang?: 'en' | 'ja';
	wordLang?: 'en' | 'ja';
	unit?: 'c' | 'f';
	clock?: '12' | '24';
	hasWeather: boolean;
	vbat?: number | null;
	cornerImage?: Uint8Array | null;
	cornerSize?: { w: number; h: number } | null;
	refreshSec?: number;
	loc?: { lat: number; lon: number } | null; // where the calendar lives (Moon & Sun)
	countdown?: { title: string; date: string } | null;
	frameImage?: Uint8Array | null; // Photo frame
	frameDeco?: import('./festive').FrameDeco | null; // its festive border
	connect?: import('../connect').Connected | null; // real data for the connection widgets, if the page has it
	tasksState?: 'ok' | 'needs_permission'; // To-do: pretend we can / cannot read Google Tasks
	custom?: CustomLayout | null; // Your own design (layout builder)
	sign?: unknown; // Meeting room / Guest welcome / Desk name plate words
	messages?: { author: string; body: string; atLocal: number }[]; // message board, newest first
	reminders?: unknown; // repeating reminders (bin day...)
	habits?: unknown; // habits and the days they were done
}

export function drawListFor(o: PreviewOptions): string {
	let nowLocal = Math.floor(Date.now() / 1000) - new Date().getTimezoneOffset() * 60;
	const timeline = o.style === 'timeline';
	// The live Timeline preview pretends it is 9:00 am, so the moving bar is always on show.
	if ((timeline || o.style === 'timetable') && (o.refreshSec ?? 86400) < 86400) nowLocal = Math.floor(nowLocal / 86400) * 86400 + 9 * 3600;
	// The Waiting room preview pretends it is 9:55 am, so someone is being seen and others are waiting.
	// (and so does any design with a Now seeing widget, which shows example names, not "Team standup")
	const waiting = o.style === 'waiting' || (o.style === 'custom' && !!o.custom?.widgets?.some((w) => w.t === 'queue'));
	if (waiting) nowLocal = Math.floor(nowLocal / 86400) * 86400 + 9 * 3600 + 55 * 60;
	return renderLayout(
		o.style,
		{
			nowLocal,
			events: waiting ? sampleAppointments(nowLocal) : timeline ? sampleDay(nowLocal) : o.style === 'tomorrow' || o.style === 'timetable' ? sampleSchool(nowLocal) : sampleEvents(nowLocal),
			weather: o.hasWeather ? sampleWeather(nowLocal) : null,
			vbat: o.vbat ?? null,
			dark: o.dark,
			lang: o.lang ?? 'en',
			wordLang: o.wordLang,
			unit: o.unit ?? 'c',
			clock: o.clock ?? '24',
			cornerImage: o.cornerImage ?? null,
			cornerSize: o.cornerSize ?? null,
			refreshSec: o.refreshSec ?? 86400,
			// a preview with example weather gets an example place too, so sunrise and sunset show
			loc: o.loc ?? (o.hasWeather ? { lat: -31.95, lon: 115.86 } : null),
			utcOffsetSec: -new Date().getTimezoneOffset() * 60,
			countdown: o.countdown ?? null,
			frameImage: o.frameImage ?? null,
			frameDeco: o.frameDeco ?? null,
			birthdays: sampleBirthdays(nowLocal, o.lang),
			connect: o.connect ?? sampleConnect(builtinLayout(o.style, o.sign) ?? o.custom, nowLocal),
			tasks: o.tasksState === 'needs_permission' ? null : sampleTasks(nowLocal),
			tasksState: o.tasksState ?? 'ok',
			custom: o.custom ?? null,
			sign: o.sign ?? null,
			messages: o.messages ?? [],
			reminders: sanitizeReminders(o.reminders),
			habits: sanitizeHabits(o.habits),
		},
		o.font ?? undefined
	);
}

// The Japanese glyphs and the moon map are big, so a browser fetches them only for a preview that
// shows them (see jp.ts and moonImage.ts). This says which this preview needs, and waits for them.
const CJK = /[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]/;
export function needsFor(o: PreviewOptions): { jp: boolean; moon: boolean } {
	const types = new Set((o.custom?.widgets ?? []).map((w) => w.t));
	let text = '';
	try {
		text = JSON.stringify({ c: o.custom, e: o.events, m: (o as any).messages, r: o.reminders, h: o.habits, s: o.sign, cd: o.countdown }, (_k, v) => (v instanceof Uint8Array ? undefined : v));
	} catch {}
	return {
		jp: o.lang === 'ja' || o.style === 'word' || types.has('jpword') || CJK.test(text),
		moon: o.style === 'moon' || types.has('moon'),
	};
}
export async function loadAssetsFor(o: PreviewOptions) {
	const n = needsFor(o);
	await Promise.all([n.jp ? loadJp() : null, n.moon ? loadMoon() : null]);
}
export { loadJp, loadMoon };

export async function renderPreview(o: PreviewOptions): Promise<Rendered> {
	const [fonts] = await Promise.all([loadFonts(), loadAssetsFor(o)]);
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
export function paintScreen(canvas: HTMLCanvasElement, px: Uint8Array, opts: { mode?: 'screen' | 'device'; scale?: number; width?: number; bare?: boolean; tight?: boolean } = {}) {
	renderEink(canvas as any, px, { mode: opts.mode ?? 'screen', scale: opts.scale ?? 1, width: opts.width, texture: 1, bare: opts.bare, tight: opts.tight });
}
