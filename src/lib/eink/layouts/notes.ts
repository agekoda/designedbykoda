// Notes: the newest messages (src/lib/messages.ts) as little paper notes pinned to a board.
// One note fills the screen, two sit side by side, three put the newest big on the left,
// four make a 2 x 2 grid. The newest note is the black one.
import { Draw, INK, PAPER, type Color } from '../draw';
import { fontId, type Family, type Role } from '../fonts';
import { measure, wrapText } from '../measure';
import { VMETRICS } from '../vmetrics';
import { tr } from '../i18n';
import { batteryIcon } from '../batteryIcon';
import { dateShort, tmOf, type LayoutCtx, type ScreenMsg } from '../context';
import { msgWhen } from './messages';
import { centred } from './centred';

function vm(fam: Family, role: Role, scale = 1) {
	const v = VMETRICS[fontId(fam, role)] ?? VMETRICS[fontId('sans', role)];
	return { asc: v[0] * scale, desc: v[3] * scale, lh: v[4] * scale };
}

// The biggest face at which `text` fits w x h, wrapping. Falls back to the smallest, cut to fit.
function fit(fam: Family, text: string, w: number, h: number) {
	const faces: [Role, number][] = [['bb', 2], ['mb', 2], ['bb', 1], ['mb', 1], ['m', 1], ['s', 1]];
	for (const [role, scale] of faces) {
		const lines = wrapText(fam, role, text, w, scale);
		const v = vm(fam, role, scale);
		if (lines.length <= 6 && lines.every((l) => measure(fam, role, l, scale).w <= w) && (lines.length - 1) * v.lh + v.asc + v.desc <= h) return { role, scale, lines, v };
	}
	const v = vm(fam, 's');
	const lines = wrapText(fam, 's', text, w).slice(0, Math.max(1, Math.floor((h - v.asc - v.desc) / v.lh) + 1));
	return { role: 's' as Role, scale: 1, lines, v };
}


type Box = { x: number; y: number; w: number; h: number };

function note(d: Draw, ctx: LayoutCtx, m: ScreenMsg, b: Box, dark: boolean) {
	const fam = ctx.family;
	const fg: Color = dark ? PAPER : INK;
	if (dark) d.fillRound(b.x, b.y, b.w, b.h, 6, INK);
	else {
		d.round(b.x, b.y, b.w, b.h, 6, INK);
		d.round(b.x + 1, b.y + 1, b.w - 2, b.h - 2, 5, INK);
	}
	// a strip of tape holding it up
	const tw = Math.min(44, b.w / 3);
	d.fill(b.x + b.w / 2 - tw / 2, b.y - 5, tw, 10, INK);
	if (dark) d.rect(b.x + b.w / 2 - tw / 2, b.y - 5, tw, 10, PAPER);
	else d.dots(b.x + b.w / 2 - tw / 2 + 3, b.y, tw - 6, 3, PAPER);
	const sv = vm(fam, 's');
	const pad = 12;
	const foot = sv.lh + 6;
	// a little slack: the screen draws big text slightly wider than it measures
	const f = fit(fam, m.body, b.w - pad * 2 - 12, b.h - pad * 2 - foot - 2);
	const blockH = (f.lines.length - 1) * f.v.lh + f.v.asc + f.v.desc;
	const top = b.y + pad + Math.max(0, (b.h - pad * 2 - foot - blockH) / 2);
	f.lines.forEach((ln, i) => d.text(b.x + pad, top + f.v.asc + i * f.v.lh, f.role, ln, { scale: f.scale, color: fg, maxW: b.w - pad * 2 }));
	const fy = b.y + b.h - pad + 2 - sv.desc;
	const inner = b.w - pad * 2;
	const authorW = m.author ? measure(fam, 'sb', m.author).w + 4 : 0;
	let when = msgWhen(m.atLocal, ctx.nowLocal);
	// "Yesterday 22:46" -> "Yesterday" when the name needs the room
	if (measure(fam, 's', when).w + authorW + 14 > inner && when.includes(' ')) when = when.slice(0, when.lastIndexOf(' '));
	const whenW = measure(fam, 's', when).w;
	if (whenW + authorW + 14 <= inner || !m.author) d.text(b.x + pad, fy, 's', when, { color: fg });
	if (m.author) d.text(b.x + b.w - pad, fy, 'sb', m.author, { align: 'right', color: fg, maxW: whenW + authorW + 14 <= inner ? inner - whenW - 10 : inner });
}

// The "Notes" layout.
export function notes(ctx: LayoutCtx): string {
	const d = new Draw(ctx.family, ctx.dark);
	d.fill(0, 0, 400, 30);
	d.text(10, 21, 'sb', 'NOTES', { color: PAPER });
	d.text(392, 21, 's', dateShort(tmOf(ctx.nowLocal)), { align: 'right', color: PAPER });
	batteryIcon(d, ctx, 200, 4, 'center', PAPER);
	const msgs = (ctx.messages ?? []).slice(0, 4);
	if (!msgs.length) {
		const y = centred(d, ctx.family, 132, 'mb', 'No notes yet', 360, 26);
		centred(d, ctx.family, y + 6, 's', "Send one from your dashboard, or share your calendar's message link.");
		return d.toString();
	}
	const X = 10, Y = 44, W = 380, H = 248, G = 12;
	const halfW = (W - G) / 2;
	const halfH = (H - G) / 2;
	let boxes: Box[];
	if (msgs.length === 1) boxes = [{ x: X, y: Y, w: W, h: H }];
	else if (msgs.length === 2) boxes = [{ x: X, y: Y, w: halfW, h: H }, { x: X + halfW + G, y: Y, w: halfW, h: H }];
	else if (msgs.length === 3)
		boxes = [
			{ x: X, y: Y, w: halfW + 20, h: H },
			{ x: X + halfW + 20 + G, y: Y, w: halfW - 20, h: halfH },
			{ x: X + halfW + 20 + G, y: Y + halfH + G, w: halfW - 20, h: halfH },
		];
	else
		boxes = [
			{ x: X, y: Y, w: halfW, h: halfH },
			{ x: X + halfW + G, y: Y, w: halfW, h: halfH },
			{ x: X, y: Y + halfH + G, w: halfW, h: halfH },
			{ x: X + halfW + G, y: Y + halfH + G, w: halfW, h: halfH },
		];
	msgs.forEach((m, i) => note(d, ctx, m, boxes[i], i === 0));
	return d.toString();
}
