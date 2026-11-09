// The message board on the screen:
//   - messages(): the "Message board" layout, newest message big, older ones listed below
//   - messageList(): the same list, drawn into any box (the layout builder's Messages widget)
import { Draw, INK, PAPER, type Color } from '../draw';
import { timeText } from '../clock';
import { fontId, type Family, type Role } from '../fonts';
import { measure, wrapText } from '../measure';
import { VMETRICS } from '../vmetrics';
import { batteryIcon } from '../batteryIcon';
import { dateShort, dayIdx, dayShort, tmOf, type LayoutCtx, type ScreenMsg } from '../context';
import { tr } from '../i18n';

const pad2 = (n: number) => String(n).padStart(2, '0');
// "14:05", "Yesterday 18:02", "Mon 09:15", "3 Nov"
export function msgWhen(atLocal: number, nowLocal: number): string {
	const t = tmOf(atLocal);
	const hm = timeText(t.hour, t.min);
	const days = dayIdx(nowLocal) - dayIdx(atLocal);
	if (days <= 0) return hm;
	if (days === 1) return `${tr('Yesterday')} ${hm}`;
	if (days < 7) return `${dayShort(t)} ${hm}`;
	return `${t.mday}/${t.mon + 1}`;
}

function vm(fam: Family, role: Role, scale = 1) {
	const v = VMETRICS[fontId(fam, role)] ?? VMETRICS[fontId('sans', role)];
	return { asc: v[0] * scale, desc: v[3] * scale, lh: v[4] * scale };
}

// The biggest size at which `text` fits w x h (wrapping), from the given faces, biggest first.
function fit(fam: Family, text: string, w: number, h: number, faces: [Role, number][]) {
	for (const [role, scale] of faces) {
		const lines = wrapText(fam, role, text, w, scale);
		const v = vm(fam, role, scale);
		if (lines.every((l) => measure(fam, role, l, scale).w <= w) && (lines.length - 1) * v.lh + v.asc + v.desc <= h) return { role, scale, lines, v };
	}
	const [role, scale] = faces[faces.length - 1];
	const v = vm(fam, role, scale);
	const lines = wrapText(fam, role, text, w, scale).slice(0, Math.max(1, Math.floor((h - v.asc - v.desc) / v.lh) + 1));
	return { role, scale, lines, v };
}

// A list of messages in a box: the first one as big as `bigFaces` allow (if given), the rest small.
export function messageList(d: Draw, ctx: LayoutCtx, box: { x: number; y: number; w: number; h: number }, o: { big?: boolean; author?: boolean; time?: boolean; color?: Color } = {}) {
	const fam = ctx.family;
	const color = o.color ?? INK;
	const msgs = ctx.messages ?? [];
	const sv = vm(fam, 's');
	if (!msgs.length) {
		d.text(box.x + box.w / 2, box.y + box.h / 2, 's', 'No messages', { align: 'center', color, maxW: box.w });
		return;
	}
	const meta = (m: ScreenMsg) => [o.author !== false ? m.author : '', o.time !== false ? msgWhen(m.atLocal, ctx.nowLocal) : ''].filter(Boolean).join('  ');
	let y = box.y;
	const bottom = box.y + box.h;
	let rest = msgs;
	if (o.big) {
		const first = msgs[0];
		rest = msgs.slice(1);
		const metaH = meta(first) ? sv.lh + 4 : 0;
		// leave room for a couple of older messages under it when there are any
		const room = rest.length ? Math.max(60, Math.min(box.h * 0.62, box.h - 2 * (sv.lh + 6))) : box.h;
		const f = fit(fam, first.body, box.w, room - metaH, [['mb', 2], ['mb', 1], ['m', 1], ['s', 1]]);
		f.lines.forEach((ln, i) => d.text(box.x, y + f.v.asc + i * f.v.lh, f.role, ln, { scale: f.scale, color, maxW: box.w }));
		y += (f.lines.length - 1) * f.v.lh + f.v.asc + f.v.desc + 4;
		if (metaH) {
			d.text(box.x, y + sv.asc, 's', meta(first), { color, maxW: box.w });
			y += sv.lh + 4;
		}
		if (rest.length) {
			y += 4;
			d.hline(box.x, y, box.w, color);
			y += 8;
		}
	}
	for (const m of rest) {
		const head = meta(m);
		const headW = head ? measure(fam, 'sb', head).w + 8 : 0;
		const lines = wrapText(fam, 's', m.body, Math.max(40, box.w - headW));
		const shown = lines.slice(0, 2);
		if (lines.length > 2) shown[1] = lines.slice(1).join(' '); // cut with ".." by the firmware
		const need = (shown.length - 1) * sv.lh + sv.asc + sv.desc;
		if (y + need > bottom) break;
		if (head) d.text(box.x, y + sv.asc, 'sb', head, { color });
		shown.forEach((ln, i) => d.text(box.x + headW, y + sv.asc + i * sv.lh, 's', ln, { color, maxW: box.w - headW }));
		y += need + 6;
		if (y + 4 < bottom) d.dots(box.x, y - 3, box.w, 4, color);
	}
}

// The "Message board" layout.
export function messages(ctx: LayoutCtx): string {
	const d = new Draw(ctx.family, ctx.dark);
	d.fill(0, 0, 400, 30);
	d.text(10, 21, 'sb', 'MESSAGES', { color: PAPER });
	d.text(392, 21, 's', dateShort(tmOf(ctx.nowLocal)), { align: 'right', color: PAPER });
	batteryIcon(d, ctx, 200, 4, 'center', PAPER);
	if (!ctx.messages?.length) {
		d.text(200, 140, 'mb', 'No messages yet', { align: 'center' });
		d.text(200, 168, 's', 'Send one from your dashboard,', { align: 'center' });
		d.text(200, 186, 's', "or share your calendar's message link.", { align: 'center' });
		return d.toString();
	}
	messageList(d, ctx, { x: 12, y: 42, w: 376, h: 250 }, { big: true });
	return d.toString();
}
