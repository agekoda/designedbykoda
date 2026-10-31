// Agenda: today's date and weather on the left, a mini month on the right,
// then the next events grouped by day underneath.
import { Draw } from '../draw';
import { CORNER, CORNER_BYTES } from '../image';
import { firstThatFits, measure } from '../measure';
import { batteryText, daysInMonth, dayName, evTimeStr, monthName, monthShort, round0, tmOf, type LayoutCtx } from '../context';

export function agenda(ctx: LayoutCtx): string {
	const d = new Draw(ctx.family, ctx.dark);
	const now = tmOf(ctx.nowLocal);

	// ---- left block: weather, big date, weekday, month and year ----
	// Each is centred in a 40px box that starts at x = 80 (so it centres on x = 100).
	// (each is centred on x = 100, so the widest it may be is about 190 before it touches the right-hand block)
	const hi = ctx.weather ? round0(ctx.weather.high) : '';
	const lo = ctx.weather ? round0(ctx.weather.low) : '';
	const weatherText = ctx.weather
		? firstThatFits(ctx.family, 's', [`High:${hi}C   Low:${lo}C`, `High:${hi}C Low:${lo}C`, `H:${hi}C  L:${lo}C`, `${hi}C / ${lo}C`], 188)
		: '---';
	d.text(80, 15, 's', weatherText, { align: 'box', maxW: 40 });
	d.text(80, 70, 'bb', String(now.mday), { align: 'box', maxW: 40 });
	d.text(80, 98, 'mb', dayName(now), { align: 'box', maxW: 40 });
	d.text(80, 118, 's', firstThatFits(ctx.family, 's', [`${monthName(now)} ${now.year}`, `${monthShort(now)} ${now.year}`], 188), { align: 'box', maxW: 40 });

	// ---- top right: a picture if one was set up, otherwise the mini month ----
	if (ctx.cornerImage && ctx.cornerImage.length === CORNER_BYTES) {
		// Stored as dark dots; on a dark screen the ink is white, so flip it to keep the picture the right way round.
		let bytes = ctx.cornerImage;
		if (ctx.dark) bytes = bytes.map((b) => ~b & 0xff);
		d.bitmapBytes(CORNER.x, CORNER.y, CORNER.w, CORNER.h, bytes);
	} else {
		// ---- mini month ----
		const cellW = 27;
		const cellH = 21;
		const startX = 400 - 7 * cellW - 5;
		const miniY = 7;
		d.text(startX + Math.floor((7 * cellW) / 2), miniY + 5, 's', monthShort(now), { align: 'rawC' });
		['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach((l, i) => d.text(startX + i * cellW + Math.floor(cellW / 2) - 4, miniY + 28, 's', l));

		const firstWday = (((now.wday - (now.mday - 1)) % 7) + 7) % 7;
		const offset = (firstWday + 6) % 7; // Monday first
		const dim = daysInMonth(now.year, now.mon);
		for (let day = 1; day <= dim; day++) {
			const col = (day + offset - 1) % 7;
			const row = Math.floor((day + offset - 1) / 7);
			const x = startX + col * cellW;
			const y = miniY + 45 + row * cellH;
			if (y > miniY + 145) break;
			const cx = x + (day < 10 ? Math.floor(cellW / 2) - 4 : Math.floor(cellW / 2) - 7);
			d.text(cx, y, 's', String(day), day === now.mday ? { ring: true } : {});
		}
	}

	d.line(0, 147, 400, 147);
	const bat = batteryText(ctx.vbat);
	if (bat) d.text(5, 140, 's', bat);

	// ---- upcoming events, grouped by day ----
	let yPos = 165;
	const maxEvents = 7;
	let shown = 0;
	const ev = ctx.events;
	const sameDay = (a: number, b: number) => {
		const ta = tmOf(a);
		const tb = tmOf(b);
		return ta.mday === tb.mday && ta.mon === tb.mon && ta.year === tb.year;
	};

	for (let i = 0; i < ev.length && shown < maxEvents; i++) {
		if (ev[i].startLocal < ctx.nowLocal) continue;
		let j = i;
		while (j < ev.length && ev[j].startLocal >= ctx.nowLocal) {
			if (sameDay(ev[j].startLocal, ev[i].startLocal)) j++;
			else break;
		}
		const count = j - i;
		if (count === 0) continue;

		if (yPos > 290) break; // no room left on the screen for another day
		const room = Math.min(count, Math.floor((290 - yPos) / 24) + 1, maxEvents - shown);
		d.text(5, yPos + 10, 'mb', String(tmOf(ev[i].startLocal).mday));
		const lineStart = yPos - 2;
		const lineEnd = yPos + room * 24 - 2;
		d.vline(40, lineStart, lineEnd - lineStart + 1);

		for (let k = i; k < j && shown < maxEvents; k++) {
			if (yPos > 290) break;
			const timeText = evTimeStr(ev[k]);
			const tm = measure(ctx.family, 'mb', timeText);
			// the title gets whatever the time leaves free (never more than the original 262px)
			const titleRoom = Math.min(262, 390 - tm.right - 10 - 48);
			d.text(48, yPos + 8, 's', ev[k].title, { maxW: titleRoom });
			d.text(390, yPos + 8, 'mb', timeText, { align: 'rawR' });
			yPos += 24;
			shown++;
		}
		i = j - 1;
	}
	if (shown === 0) d.text(20, yPos, 's', 'No upcoming events');

	return d.toString();
}
