// Night before: tomorrow's day (or today's, before noon), so you can pack your bag. Classes with
// their rooms on the left, the weather, what to bring and what's due soon on the right.
// Meant for the screen schedule: "Night before from 6 pm to 7 am".
import { Draw, INK, PAPER } from '../draw';
import { fontId, type Family, type Role } from '../fonts';
import { VMETRICS } from '../vmetrics';
import { batteryIcon } from '../batteryIcon';
import { measure } from '../measure';
import { dateShort, dayAbbr, dayIdx, round0, timeTextOf, tmFromDayIdx, type LayoutCtx } from '../context';
import { deg } from '../units';
import { weatherBits, wxKind } from '../weatherIcon';
import { dueSoon, eventsOn, whenShort } from '../school';

function vm(fam: Family, role: Role) {
	const v = VMETRICS[fontId(fam, role)] ?? VMETRICS[fontId('sans', role)];
	return { asc: v[0], desc: v[3], lh: v[4] };
}

export function tomorrow(ctx: LayoutCtx): string {
	const d = new Draw(ctx.family, ctx.dark);
	const fam = ctx.family;
	const today = dayIdx(ctx.nowLocal);
	const evening = ((ctx.nowLocal % 86400) + 86400) % 86400 >= 12 * 3600;
	const day = evening ? today + 1 : today;
	d.fill(0, 0, 400, 30);
	d.text(10, 21, 'sb', evening ? 'TOMORROW' : 'TODAY', { color: PAPER });
	d.text(392, 21, 's', dateShort(tmFromDayIdx(day)), { align: 'right', color: PAPER });
	batteryIcon(d, ctx, 200, 4, 'center', PAPER);

	const { allDay, timed } = eventsOn(ctx.events, day);
	const sv = vm(fam, 's');
	const bv = vm(fam, 'sb');
	const L = 10, R = 262; // the list
	let y = 40;
	if (allDay.length) {
		const t = allDay.map((e) => e.name ?? e.title).join(', ');
		d.fillRound(L, y, R - L, 20, 4);
		d.text(L + 6, y + 14, 'sb', t, { color: PAPER, maxW: R - L - 12 });
		y += 26;
	}
	if (!timed.length) {
		d.text((L + R) / 2, y + 70, 'mb', 'Nothing on', { align: 'center' });
		d.text((L + R) / 2, y + 94, 's', allDay.length ? 'Just the above' : 'A free day', { align: 'center' });
	} else {
		const rowH = Math.max(bv.lh + 3, Math.min(26, Math.floor((292 - y) / timed.length)));
		const timeW = Math.max(...timed.map((e) => measure(fam, 'sb', timeTextOf(e.startLocal)).w)) + 8;
		for (const e of timed) {
			if (y + rowH > 296) break;
			const base = y + Math.round((rowH + bv.asc - bv.desc) / 2);
			d.text(L, base, 'sb', timeTextOf(e.startLocal));
			let right = R;
			if (e.room) {
				const w = measure(fam, 's', e.room).w;
				if (e.moved) {
					// a room change: the new room in a black box
					d.fillRound(R - w - 8, base - sv.asc - 2, w + 8, sv.asc + sv.desc + 4, 3);
					d.text(R - 4, base, 's', e.room, { align: 'right', color: PAPER });
				} else d.text(R, base, 's', e.room, { align: 'right' });
				right = R - w - 14;
			}
			d.text(L + timeW, base, 's', e.name ?? e.title, { maxW: right - L - timeW });
			d.dots(L + timeW, y + rowH - 1, R - L - timeW, 3);
			y += rowH;
		}
	}

	// right column
	const X = 274, W = 116;
	d.vline(268, 40, 252);
	let ry = 42;
	const wx = ctx.weather?.days?.find((w) => w.date === new Date(day * 86400000).toISOString().slice(0, 10)) ?? (day === today && ctx.weather ? { code: ctx.weather.code ?? 0, high: ctx.weather.high, low: ctx.weather.low, rain: ctx.weather.rain ?? null } : null);
	if (wx) {
		d.bitmapBytes(X, ry, 32, 32, weatherBits(wxKind(wx.code), 32));
		d.text(X + W, ry + 14, 'sb', `${round0(wx.high)}${deg()}`, { align: 'right' });
		d.text(X + W, ry + 30, 's', `${round0(wx.low)}${deg()}${wx.rain != null && wx.rain >= 20 ? ` · ${Math.round(wx.rain)}%` : ''}`, { align: 'right' });
		ry += 44;
	}
	const head = (t: string) => {
		d.text(X, ry + sv.asc, 's', t);
		d.hline(X, ry + sv.asc + sv.desc + 2, W);
		ry += sv.asc + sv.desc + 7;
	};
	const bring = [...new Set(timed.map((e) => e.bring).filter((b): b is string => !!b))];
	if (bring.length) {
		head('BRING');
		for (const b of bring.slice(0, 4)) {
			if (ry + bv.lh > 200) break;
			d.fillRound(X, ry + 3, 5, 5, 1);
			d.text(X + 10, ry + bv.asc, 'sb', b, { maxW: W - 10 });
			ry += bv.lh + 1;
		}
		ry += 6;
	}
	const due = (ctx.due ?? dueSoon(ctx.events, ctx.nowLocal)).slice(0, 4);
	if (due.length && ry < 250) {
		head('DUE SOON');
		for (const e of due) {
			if (ry + bv.lh + sv.lh > 298) break;
			d.text(X, ry + bv.asc, 'sb', e.name ?? e.title, { maxW: W });
			ry += bv.lh;
			d.text(X, ry + sv.asc - 2, 's', whenShort(dayIdx(e.startLocal), today, dayAbbr), { maxW: W });
			ry += sv.lh + 2;
		}
	}
	return d.toString();
}
