// The registry of layouts. To add a new one:
//   1. write src/lib/eink/layouts/<name>.ts (copy a small one such as nextup.ts)
//   2. add a line below, choosing the font family it draws with
//   3. add the same id to CALENDAR_STYLES in src/data/calendarStyles.ts so it
//      shows up in the setup page and dashboard
// No firmware change is needed, devices pick it up the next time they wake.
import { DEFAULT_FAMILY, isFamily, type Family } from '../fonts';
import type { LayoutCtx } from '../context';
import { cleanTitle } from '../draw';
import { agenda } from './agenda';
import { month } from './month';
import { bigdate } from './bigdate';
import { week } from './week';
import { nextup } from './nextup';

interface LayoutEntry {
	render: (ctx: LayoutCtx) => string;
	font: Family; // font family this layout draws with
}

export const LAYOUTS: Record<string, LayoutEntry> = {
	agenda: { render: agenda, font: 'jbmono' },
	month: { render: month, font: 'sans' },
	bigdate: { render: bigdate, font: 'sans' },
	week: { render: week, font: 'sans' },
	nextup: { render: nextup, font: 'sans' },
};

export function renderLayout(styleId: string, ctx: Omit<LayoutCtx, 'family'>, familyOverride?: unknown): string {
	const entry = LAYOUTS[styleId] ?? LAYOUTS.agenda;
	const family = isFamily(familyOverride) ? familyOverride : isFamily(entry.font) ? entry.font : DEFAULT_FAMILY;
	const events = ctx.events.map((e) => ({ ...e, title: cleanTitle(e.title) }));
	return entry.render({ ...ctx, events, family });
}
