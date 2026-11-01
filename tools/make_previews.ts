/**
 * Regenerates the static layout pictures in public/images/polls/eink-styles/
 * from the real layout code, drawn by the same renderer the site uses.
 *
 *   npm i --no-save @napi-rs/canvas
 *   npx tsx tools/make_previews.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
import { renderLayout } from '../src/lib/eink/layouts/index';
import { loadFontPack, renderDrawList } from '../src/lib/eink/preview';
import { renderEink } from '../src/lib/eink/render';

const fonts = loadFontPack(JSON.parse(readFileSync('public/eink/fonts.json', 'utf8')));
const D = (m: number, d: number, h = 0, mi = 0) => Date.UTC(2026, m - 1, d, h, mi) / 1000;
const events = [
	{ title: 'Begin Next Project', startLocal: D(8, 8, 15, 15), allDay: false },
	{ title: 'Print Calendar Case v2', startLocal: D(8, 8, 21), allDay: false },
	{ title: 'Interview', startLocal: D(8, 9, 13, 30), allDay: false },
	{ title: 'Concert', startLocal: D(8, 11), allDay: true },
	{ title: 'Exams Begin', startLocal: D(8, 18, 8, 30), allDay: false },
	{ title: 'Milahs Birthday', startLocal: D(8, 29), allDay: true },
];
// A working day for the Timeline picture (it needs several events today, with end times).
const E = (title: string, h1: number, m1: number, h2: number, m2: number) => ({ title, startLocal: D(8, 7, h1, m1), endLocal: D(8, 7, h2, m2), allDay: false });
const dayEvents = [E('Team standup', 9, 30, 10, 0), E('Design review', 11, 0, 12, 30), E('Lunch with Sam', 13, 0, 14, 0), E('Project review', 15, 15, 16, 15)];
for (const style of ['agenda', 'month', 'bigdate', 'week', 'nextup', 'timeline']) {
	for (const dark of [false, true]) {
		const tl = style === 'timeline';
		const list = renderLayout(style, { nowLocal: tl ? D(8, 7, 11, 15) : D(8, 7, 9), events: tl ? dayEvents : events, weather: { high: 19, low: 12 }, vbat: 4.18, dark, refreshSec: tl ? 3600 : 86400 }, 'sans');
		const { px } = renderDrawList(list, fonts);
		const c = createCanvas(1, 1);
		renderEink(c as any, px, { mode: 'screen', scale: 2 });
		writeFileSync(`public/images/polls/eink-styles/${style}${dark ? '-dark' : ''}.png`, c.toBuffer('image/png'));
		console.log(style, dark ? 'dark' : 'light');
	}
}
