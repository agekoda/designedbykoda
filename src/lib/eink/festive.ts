// A festive border for the Photo frame: a white band round the photo with snowflakes, trees,
// baubles and little stars, a big snowflake in each corner, and a greeting along the bottom if there is one.
// Drawn on the server over the photo, so it can switch itself on for December only.
import { Draw, INK, PAPER } from './draw';
import { measure } from './measure';
import type { Family } from './fonts';

export type DecoWhen = 'off' | 'december' | 'always';
export interface FrameDeco { when: DecoWhen; text: string }
export const DECO_DEFAULT: FrameDeco = { when: 'off', text: 'Merry Christmas' };
export const DECO_TEXT_MAX = 30;

export function sanitizeDeco(raw: unknown): FrameDeco {
	let v: any = raw;
	if (typeof v === 'string') {
		try {
			v = JSON.parse(v);
		} catch {
			v = null;
		}
	}
	if (!v || typeof v !== 'object') return { ...DECO_DEFAULT };
	const when: DecoWhen = v.when === 'december' || v.when === 'always' ? v.when : 'off';
	const text = typeof v.text === 'string' ? v.text.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, DECO_TEXT_MAX) : DECO_DEFAULT.text;
	return { when, text };
}

// Is it on at this local time (seconds since 1970, in the calendar's own timezone)?
export function decoOn(deco: FrameDeco | null | undefined, nowLocal: number): boolean {
	if (!deco || deco.when === 'off') return false;
	if (deco.when === 'always') return true;
	return new Date(nowLocal * 1000).getUTCMonth() === 11;
}

// 11 x 11
const SNOW = [
	'.....#.....',
	'..#..#..#..',
	'...#.#.#...',
	'#...###...#',
	'.#...#...#.',
	'###########',
	'.#...#...#.',
	'#...###...#',
	'...#.#.#...',
	'..#..#..#..',
	'.....#.....',
];
// 7 x 7
const STAR = ['...#...', '...#...', '..###..', '#######', '..###..', '...#...', '...#...'];
// a Christmas tree, 11 x 12
const TREE = [
	'.....#.....',
	'....###....',
	'...#####...',
	'....###....',
	'...#####...',
	'..#######..',
	'....###....',
	'..#######..',
	'.#########.',
	'###########',
	'.....#.....',
	'....###....',
];
// a big snowflake for the corners: 8 spokes, each with a little V near the end
function bigFlake(r = 8): string[] {
	const n = r * 2 + 1;
	const g = Array.from({ length: n }, () => Array(n).fill('.'));
	const set = (x: number, y: number) => {
		if (x >= 0 && y >= 0 && x < n && y < n) g[y][x] = '#';
	};
	const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
	for (const [dx, dy] of dirs) {
		const len = dx && dy ? r - 2 : r;
		for (let i = 0; i <= len; i++) set(r + dx * i, r + dy * i);
		// the V: two short branches off the spoke, two thirds of the way out
		const k = Math.round(len * 0.62);
		const bx = r + dx * k, by = r + dy * k;
		for (let j = 1; j <= 2; j++) {
			if (dx && dy) {
				set(bx + dx * j, by);
				set(bx, by + dy * j);
			} else {
				set(bx + dy * j + dx * j, by + dx * j + dy * j);
				set(bx - dy * j + dx * j, by - dx * j + dy * j);
			}
		}
	}
	return g.map((row) => row.join(''));
}
const FLAKE = bigFlake();

const BAND = 18; // the white edge round the photo

export function drawFestive(d: Draw, family: Family, text: string) {
	// the white band, with a fine line where it meets the photo
	d.fill(0, 0, 400, BAND, PAPER);
	d.fill(0, 300 - BAND, 400, BAND, PAPER);
	d.fill(0, 0, BAND, 300, PAPER);
	d.fill(400 - BAND, 0, BAND, 300, PAPER);
	d.rect(BAND, BAND, 400 - 2 * BAND, 300 - 2 * BAND, INK);
	// snowflakes, trees, baubles and stars along each side, a gap at the corners for the big flakes
	const along = (from: number, to: number, each: (p: number, i: number) => void) => {
		let i = 0;
		for (let p = from; p <= to; p += 32, i++) each(p, i);
	};
	// a bauble: a ball with a cap and a white glint
	const bauble = (cx: number, cy: number) => {
		const x = Math.round(cx), y = Math.round(cy) + 1;
		d.fill(x - 1, y - 7, 3, 2).disc(x, y, 5).disc(x - 2, y - 2, 1, PAPER);
	};
	const put = (rows: string[], cx: number, cy: number) => d.bitmap(Math.round(cx - rows[0].length / 2), Math.round(cy - rows.length / 2), rows);
	const place = (i: number, cx: number, cy: number) => {
		const k = ((i % 4) + 4) % 4;
		if (k === 2) bauble(cx, cy);
		else put(k === 1 ? TREE : k === 3 ? STAR : SNOW, cx, cy);
	};
	along(40, 360, (x, i) => place(i, x, BAND / 2));
	along(46, 254, (y, i) => {
		place(i + 1, BAND / 2, y);
		place(i + 2, 400 - BAND / 2, y);
	});
	// the greeting sits in a tab on the bottom edge; the bottom row of shapes leaves room for it
	const t = text.trim();
	let gapFrom = 999;
	let gapTo = -999;
	if (t) {
		// the biggest size that fits on one line
		const role = (['mb', 'sb', 's'] as const).find((r) => measure(family, r, t).right <= 300) ?? 's';
		const m = measure(family, role, t);
		const big = role === 'mb';
		const w = Math.min(330, m.right + 30);
		const h = big ? 34 : 26;
		const x = Math.round(200 - w / 2);
		d.fillRound(x, 300 - BAND - h + 8, w, h, 9, PAPER);
		d.round(x, 300 - BAND - h + 8, w, h, 9, INK);
		d.fill(x + 1, 300 - BAND, w - 2, 10, PAPER); // open into the band, like a tab
		d.text(200, 300 - BAND + (big ? -4 : -3), role, t, { align: 'center', maxW: w - 16 });
		gapFrom = x - 8;
		gapTo = x + w + 8;
	}
	along(40, 360, (x, i) => {
		if (x > gapFrom && x < gapTo) return;
		place(i + 2, x, 300 - BAND / 2);
	});
	// a big snowflake in each corner, on its own patch of white so it shows over a dark photo
	const sz = FLAKE.length + 6;
	d.fillRound(0, 0, sz, sz, 8, PAPER).fillRound(400 - sz, 0, sz, sz, 8, PAPER).fillRound(0, 300 - sz, sz, sz, 8, PAPER).fillRound(400 - sz, 300 - sz, sz, sz, 8, PAPER);
	for (const [x, y] of [[3, 3], [400 - 3 - FLAKE.length, 3], [3, 300 - 3 - FLAKE.length], [400 - 3 - FLAKE.length, 300 - 3 - FLAKE.length]]) d.bitmap(x, y, FLAKE);
}

// The festive border on top of a screen that's already drawn (a draw list from any layout), e.g. the
// calendar pictured on the gift card.
export function addFestive(drawList: string, family: Family, text: string, dark = false): string {
	const d = new Draw(family, dark);
	drawFestive(d, family, text);
	const [head, ...rest] = drawList.split('\n');
	const extra = d.toString().split('\n').slice(1).filter(Boolean);
	const body = rest.filter(Boolean);
	const parts = head.split('\t');
	parts[1] = String(body.length + extra.length);
	return [parts.join('\t'), ...body, ...extra].join('\n') + '\n';
}
