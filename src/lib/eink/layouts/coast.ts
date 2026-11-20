// The "Beach" screen: the weather now, UV and air quality, the next tides with waves and sea
// temperature, and the next few days. Built from the builder's widgets, like Forecast.
import { renderCustom } from '../builder/render';
import { COAST_LAYOUT } from '../builder/model';
import { Draw, PAPER } from '../draw';
import { centred } from './centred';
import type { LayoutCtx } from '../context';

export function coast(ctx: LayoutCtx): string {
	if (!ctx.weather && !ctx.loc) {
		const d = new Draw(ctx.family, ctx.dark);
		d.fill(0, 0, 400, 30);
		d.text(10, 21, 'sb', 'BEACH', { color: PAPER });
		d.text(200, 140, 'mb', 'Where are you?', { align: 'center' });
		centred(d, ctx.family, 168, 's', 'Add your weather place in Settings on your dashboard, and the tides and surf show here.');
		return d.toString();
	}
	return renderCustom({ ...ctx, custom: COAST_LAYOUT });
}
