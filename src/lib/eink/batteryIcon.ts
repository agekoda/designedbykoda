// A small battery icon with the percentage inside it, drawn like a phone's:
// a hollow outline with a nub on the right. Once the battery is low (15% or
// less) the body fills in solid, so it stands out from across the room.
import { PAPER, INK, type Color, type Draw } from './draw';
import { batteryPercent } from './battery';
import { measure } from './measure';
import type { LayoutCtx } from './context';

export const BATTERY_H = 16;
const NUB = 3;

function sizeOf(ctx: LayoutCtx): { text: string; body: number; total: number; low: boolean } | null {
	if (ctx.vbat === null || ctx.vbat === undefined) return null;
	const pct = batteryPercent(ctx.vbat);
	const text = `${pct}%`;
	const body = Math.max(32, measure(ctx.family, 's', text).w + 12);
	return { text, body, total: body + NUB, low: pct <= 15 };
}

// How wide the icon is (0 when the device hasn't reported a battery reading).
export function batteryIconWidth(ctx: LayoutCtx): number {
	return sizeOf(ctx)?.total ?? 0;
}

// Draws the icon with its top at y. x is the left edge, the right edge or the
// middle, depending on `align`. `color` is the colour of the icon itself (PAPER
// on a black header bar).
export function batteryIcon(d: Draw, ctx: LayoutCtx, x: number, y: number, align: 'left' | 'right' | 'center' = 'left', color: Color = INK): void {
	const s = sizeOf(ctx);
	if (!s) return;
	const left = align === 'left' ? x : align === 'right' ? x - s.total : x - s.total / 2;
	const other: Color = color === INK ? PAPER : INK;
	if (s.low) {
		d.fillRound(left, y, s.body, BATTERY_H, 3, color);
	} else {
		d.round(left, y, s.body, BATTERY_H, 3, color);
		d.round(left + 1, y + 1, s.body - 2, BATTERY_H - 2, 2, color);
	}
	d.fill(left + s.body, y + 4, NUB, BATTERY_H - 8, color);
	d.text(left + s.body / 2, y + 12, 's', s.text, { align: 'center', color: s.low ? other : color });
}
