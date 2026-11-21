// The registry of layouts. To add a new one:
//   1. write src/lib/eink/layouts/<name>.ts (copy a small one such as nextup.ts)
//   2. add a line below, choosing the font family it draws with
//   3. add the same id to CALENDAR_STYLES in src/data/calendarStyles.ts so it
//      shows up in the setup page and dashboard
// No firmware change is needed, devices pick it up the next time they wake.
import { DEFAULT_FAMILY, isFamily, type Family } from '../fonts';
import { getClock, isClock, setClock } from '../clock';
import type { CalEvent, LayoutCtx } from '../context';
import { cleanText, cleanTitle, toAscii } from '../draw';
import { getLang, isLang, setLang } from '../i18n';
import { convertWeather, getUnit, isTempUnit, setUnit } from '../units';
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
import { messages } from './messages';
import { reminders } from './reminders';
import { habits } from './habits';
import { notes } from './notes';
import { tomorrow } from './tomorrow';
import { timetable } from './timetable';
import { away } from './away';
import { renderCustom } from '../builder/render';
import { forecast } from './forecast';
import { coast } from './coast';
import { sanitizeLayout, sanitizeSign, signLayout, localSign, type SignStyle, WORD_LAYOUT, BIRTHDAYS_LAYOUT } from '../builder/model';

// Meeting room, Guest welcome and Desk name plate: a builder design filled in from a few words.
// (a sign still on its example wording shows it in Japanese when the screen is in Japanese)
const sign = (s: SignStyle) => (ctx: LayoutCtx) => renderCustom({ ...ctx, custom: sanitizeLayout(signLayout(s, localSign(sanitizeSign(ctx.sign), ctx.lang))) });

interface LayoutEntry {
	render: (ctx: LayoutCtx) => string;
	font: Family; // font family this layout draws with
}

export const LAYOUTS: Record<string, LayoutEntry> = {
	agenda: { render: agenda, font: 'sans' },
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
	room: { render: sign('room'), font: 'sans' },
	guest: { render: sign('guest'), font: 'sans' },
	nameplate: { render: sign('nameplate'), font: 'sans' },
	waiting: { render: sign('waiting'), font: 'sans' },
	forecast: { render: forecast, font: 'sans' },
	coast: { render: coast, font: 'sans' },
	word: { render: (ctx: LayoutCtx) => renderCustom({ ...ctx, custom: WORD_LAYOUT }), font: 'sans' },
	birthdays: { render: (ctx: LayoutCtx) => renderCustom({ ...ctx, custom: BIRTHDAYS_LAYOUT }), font: 'sans' },
	youtube: { render: sign('youtube'), font: 'sans' },
	github: { render: sign('github'), font: 'sans' },
	headlines: { render: sign('headlines'), font: 'lora' },
	markets: { render: sign('markets'), font: 'sans' },
	potd: { render: sign('potd'), font: 'sans' },
	messages: { render: messages, font: 'sans' },
	reminders: { render: reminders, font: 'sans' },
	habits: { render: habits, font: 'sans' },
	notes: { render: notes, font: 'sans' },
	tomorrow: { render: tomorrow, font: 'sans' },
	timetable: { render: timetable, font: 'sans' },
	away: { render: away, font: 'sans' },
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
	const ct = (t: string) => (JAPANESE_EVENT_TITLES ? cleanText(t, true) || '(event)' : cleanTitle(t));
	const cleanEv = (e: CalEvent): CalEvent => ({ ...e, title: ct(e.title), ...(e.name ? { name: ct(e.name) } : {}), ...(e.room ? { room: ct(e.room) } : {}), ...(e.bring ? { bring: ct(e.bring) } : {}) });
	const events = ctx.events.map(cleanEv);
	const due = ctx.due ? ctx.due.map(cleanEv) : ctx.due;
	const tasks = ctx.tasks ? ctx.tasks.map((t) => ({ ...t, title: JAPANESE_EVENT_TITLES ? cleanText(t.title, true) : toAscii(t.title, true) })) : ctx.tasks;
	const before = getLang();
	const beforeUnit = getUnit();
	const beforeClock = getClock();
	const unit = isTempUnit(ctx.unit) ? ctx.unit : 'c';
	setLang(isLang(ctx.lang) ? ctx.lang : 'en');
	setUnit(unit);
	setClock(isClock(ctx.clock) ? ctx.clock : '24');
	try {
		return entry.render({ ...ctx, events, due, tasks, family, weather: convertWeather(ctx.weather, unit) });
	} finally {
		setLang(before);
		setUnit(beforeUnit);
		setClock(beforeClock);
	}
}
