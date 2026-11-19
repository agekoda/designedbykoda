// The "Forecast" screen: today's weather big, the next five days under it, and sunrise and sunset.
// Built from the layout builder's widgets, like the signs, so it looks the same as they do there.
import { renderCustom } from '../builder/render';
import { sanitizeLayout } from '../builder/model';
import { Draw, PAPER } from '../draw';
import { centred } from './centred';
import type { LayoutCtx } from '../context';

let n = 0;
const W = (t: string, x: number, y: number, w: number, h: number, o: Record<string, unknown> = {}) => ({ id: `f${n++}`, t, x, y, w, h, o });

export const FORECAST_LAYOUT = sanitizeLayout({
	v: 1,
	widgets: [
		W('box', 0, 0, 400, 30, { fill: 'solid' }),
		W('text', 10, 2, 180, 26, { text: 'FORECAST', light: true, bold: true, size: 's', valign: 'middle' }),
		W('date_full', 190, 2, 200, 26, { fmt: 'med', light: true, size: 's', align: 'right', valign: 'middle' }),
		W('weather_icon', 14, 40, 100, 100),
		W('weather', 128, 42, 262, 52, { size: 'auto', bold: true, valign: 'middle' }),
		W('weather_summary', 128, 96, 262, 42, { rain: true, wind: true, size: 's', valign: 'top' }),
		W('line', 10, 148, 380, 2),
		W('forecast', 10, 156, 380, 88, { days: '5', from: 'tomorrow' }),
		W('line', 10, 250, 380, 2, { dotted: true }),
		W('sun_times', 100, 254, 200, 46),
	],
});

export function forecast(ctx: LayoutCtx): string {
	if (!ctx.weather) {
		const d = new Draw(ctx.family, ctx.dark);
		d.fill(0, 0, 400, 30);
		d.text(10, 21, 'sb', 'FORECAST', { color: PAPER });
		d.text(200, 140, 'mb', 'Where are you?', { align: 'center' });
		centred(d, ctx.family, 168, 's', 'Add your weather place in Settings on your dashboard, and the forecast shows here.');
		return d.toString();
	}
	return renderCustom({ ...ctx, custom: FORECAST_LAYOUT });
}
