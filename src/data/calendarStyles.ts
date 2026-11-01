// The e-ink calendar layouts a person can choose between. `view` is the
// number the firmware switches on (see eink_calendar.ino), so keep the two
// in sync if you ever add a layout.
export interface CalendarStyle {
	id: string;
	label: string;
	note: string;
	image: string;
	imageDark: string; // dark-mode screenshot, same name + "-dark"
	view: number;
	corner?: boolean; // has a spot that can show a picture instead of the mini calendar
}

export const DEFAULT_STYLE = 'agenda';

export const CALENDAR_STYLES: CalendarStyle[] = [
	{ id: 'agenda', label: 'Agenda', note: 'Today, a mini month and your next events', image: '/images/polls/eink-styles/agenda.png', imageDark: '/images/polls/eink-styles/agenda-dark.png', view: 3, corner: true },
	{ id: 'month', label: 'Month', note: 'The whole month, with marks on busy days', image: '/images/polls/eink-styles/month.png', imageDark: '/images/polls/eink-styles/month-dark.png', view: 4 },
	{ id: 'bigdate', label: 'Big date', note: 'A huge date beside an upcoming list', image: '/images/polls/eink-styles/bigdate.png', imageDark: '/images/polls/eink-styles/bigdate-dark.png', view: 5 },
	{ id: 'week', label: 'Week', note: 'This week, day by day', image: '/images/polls/eink-styles/week.png', imageDark: '/images/polls/eink-styles/week-dark.png', view: 6 },
	{ id: 'nextup', label: 'Next up', note: 'Your very next event, big and clear', image: '/images/polls/eink-styles/nextup.png', imageDark: '/images/polls/eink-styles/nextup-dark.png', view: 7 },
	{ id: 'timeline', label: 'Timeline', note: 'Your day as hour blocks, with a moving "now" bar', image: '/images/polls/eink-styles/timeline.png', imageDark: '/images/polls/eink-styles/timeline-dark.png', view: 8 },
];

// Layouts that can wake more than once a day (Timeline moves a "now" bar). Everything else refreshes daily.
export const REFRESH_CHOICES = [
	{ sec: 86400, label: 'Once a day' },
	{ sec: 43200, label: 'Every 12 hours' },
	{ sec: 14400, label: 'Every 4 hours' },
	{ sec: 7200, label: 'Every 2 hours' },
	{ sec: 3600, label: 'Hourly' },
];
export const isRefreshSec = (v: unknown): v is number => REFRESH_CHOICES.some((c) => c.sec === v);
export const LIVE_STYLES = ['timeline'];

export function viewForStyle(id: unknown): number {
	return CALENDAR_STYLES.find((s) => s.id === id)?.view ?? 3;
}

export function isStyleId(id: unknown): id is string {
	return typeof id === 'string' && CALENDAR_STYLES.some((s) => s.id === id);
}
