// The registry of layouts. To add a new one:
//   1. write src/lib/eink/layouts/<name>.ts (copy a small one such as nextup.ts)
//   2. add a line below, choosing the font family it draws with
//   3. add the same id to CALENDAR_STYLES in src/data/calendarStyles.ts so it
//      shows up in the setup page and dashboard
// No firmware change is needed, devices pick it up the next time they wake.
import { DEFAULT_FAMILY, isFamily, type Family } from '../fonts';
import type { LayoutCtx } from '../context';
import { cleanText, cleanTitle, toAscii } from '../draw';
import { getLang, isLang, setLang } from '../i18n';
import { agenda } from './agenda';
import { month } from './month';
import { bigdate } from './bigdate';
import { week } from './week';
import { nextup } from './nextup';
import { timeline } from './timeline';
import { moon } from './moon';
import { quote } from './quote';
import { countdown } from './countdown';
import { frame } from './frame';
import { todo } from './todo';
import { custom } from './custom';
import { planner } from './planner';

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
	timeline: { render: timeline, font: 'sans' },
	moon: { render: moon, font: 'sans' },
	quote: { render: quote, font: 'lora' },
	countdown: { render: countdown, font: 'sans' },
	frame: { render: frame, font: 'sans' },
	todo: { render: todo, font: 'sans' },
	custom: { render: custom, font: 'sans' },
	planner: { render: planner, font: 'sans' },
};

// The font a layout uses when nothing else is chosen.
export function defaultFontFor(styleId: string): Family {
	const f = (LAYOUTS[styleId] ?? LAYOUTS.agenda).font;
	return isFamily(f) ? f : DEFAULT_FAMILY;
}

// Event and task titles are always plain ASCII (the server only draws Japanese for the screen's own words
// and for text typed into the dashboard). Flip this to let Japanese titles through as well; the
// layouts already cope, it just hasn't been asked for.
const JAPANESE_EVENT_TITLES = false;

export function renderLayout(styleId: string, ctx: Omit<LayoutCtx, 'family'>, familyOverride?: unknown): string {
	const entry = LAYOUTS[styleId] ?? LAYOUTS.agenda;
	const family = isFamily(familyOverride) ? familyOverride : isFamily(entry.font) ? entry.font : DEFAULT_FAMILY;
	const events = ctx.events.map((e) => ({ ...e, title: JAPANESE_EVENT_TITLES ? cleanText(e.title, true) || '(event)' : cleanTitle(e.title) }));
	const tasks = ctx.tasks ? ctx.tasks.map((t) => ({ ...t, title: JAPANESE_EVENT_TITLES ? cleanText(t.title, true) : toAscii(t.title, true) })) : ctx.tasks;
	const before = getLang();
	setLang(isLang(ctx.lang) ? ctx.lang : 'en');
	try {
		return entry.render({ ...ctx, events, tasks, family });
	} finally {
		setLang(before);
	}
}
