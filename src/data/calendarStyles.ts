// The e-ink calendar layouts a person can choose between. `view` is the
// number the firmware switches on (see eink_calendar.ino), so keep the two
// in sync if you ever add a layout.
export interface CalendarStyle {
	id: string;
	label: string;
	note: string;
	image: string;
	view: number;
}

export const DEFAULT_STYLE = 'agenda';

export const CALENDAR_STYLES: CalendarStyle[] = [
	{ id: 'agenda', label: 'Agenda', note: 'Today, a mini month and your next events', image: '/images/polls/eink-styles/agenda.png', view: 3 },
	{ id: 'month', label: 'Month', note: 'The whole month, with marks on busy days', image: '/images/polls/eink-styles/month.png', view: 4 },
	{ id: 'bigdate', label: 'Big date', note: 'A huge date beside an upcoming list', image: '/images/polls/eink-styles/bigdate.png', view: 5 },
	{ id: 'week', label: 'Week', note: 'This week, day by day', image: '/images/polls/eink-styles/week.png', view: 6 },
	{ id: 'nextup', label: 'Next up', note: 'Your very next event, big and clear', image: '/images/polls/eink-styles/nextup.png', view: 7 },
];

export function viewForStyle(id: unknown): number {
	return CALENDAR_STYLES.find((s) => s.id === id)?.view ?? 3;
}

export function isStyleId(id: unknown): id is string {
	return typeof id === 'string' && CALENDAR_STYLES.some((s) => s.id === id);
}
