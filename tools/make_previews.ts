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
for (const style of ['agenda', 'month', 'bigdate', 'week', 'nextup']) {
	for (const dark of [false, true]) {
		const list = renderLayout(style, { nowLocal: D(8, 7, 9), events, weather: { high: 19, low: 12 }, vbat: 4.18, dark }, 'sans');
		const { px } = renderDrawList(list, fonts);
		const c = createCanvas(1, 1);
		renderEink(c as any, px, { mode: 'screen', scale: 2 });
		writeFileSync(`public/images/polls/eink-styles/${style}${dark ? '-dark' : ''}.png`, c.toBuffer('image/png'));
		console.log(style, dark ? 'dark' : 'light');
	}
}
