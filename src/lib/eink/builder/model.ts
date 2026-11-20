// The layout builder's data: what a custom layout is, which widgets exist, what options each
// one has, and the checking that keeps a saved layout safe. Pure data and maths (no DOM), so the
// server (to check and draw a saved layout) and the browser editor (to build one) share it.
import { cleanText } from '../draw';

export const SCREEN = { w: 400, h: 300 } as const;
export const MAX_WIDGETS = 30;
export const MAX_JSON = 9000; // characters of saved layout

export interface Widget {
	id: string;
	t: string; // a key of WIDGETS
	x: number;
	y: number;
	w: number;
	h: number;
	o: Record<string, string | boolean | number>;
}
export interface CustomLayout {
	v: 1;
	widgets: Widget[]; // drawn in order: the first is at the back
}

// ---- options the editor shows for a widget, and the server checks ----
export type OptDef =
	| { key: string; label: string; kind: 'choice'; choices: [string, string][]; def: string; show?: Record<string, string | boolean> }
	| { key: string; label: string; kind: 'toggle'; def: boolean; show?: Record<string, string | boolean> }
	| {
			key: string;
			label: string;
			kind: 'text';
			def: string;
			max: number;
			rows?: number;
			ph?: string; // placeholder shown in the empty box
			raw?: boolean; // keep the text exactly as typed (links, Wi-Fi names and passwords inside a QR code)
			multiline?: boolean; // keep line breaks (one item per line)
			show?: Record<string, string | boolean>;
	  };

const SIZE_CHOICES: [string, string][] = [
	['auto', 'Auto (fills the box)'],
	['s', 'Small'],
	['m', 'Medium'],
	['l', 'Large'],
	['xl', 'Extra large'],
	['xxl', 'Huge'],
	['xxxl', 'Giant'],
];
const SMALL_SIZES: [string, string][] = [
	['s', 'Small'],
	['m', 'Medium'],
];
const ALIGN: OptDef = { key: 'align', label: 'Align', kind: 'choice', choices: [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']], def: 'left' };
const VALIGN: OptDef = { key: 'valign', label: 'Vertical', kind: 'choice', choices: [['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']], def: 'middle' };
const SIZE: OptDef = { key: 'size', label: 'Text size', kind: 'choice', choices: SIZE_CHOICES, def: 'auto' };
const BOLD: OptDef = { key: 'bold', label: 'Bold', kind: 'toggle', def: false };
const INVERT: OptDef = { key: 'invert', label: 'White on black', kind: 'toggle', def: false };
const BORDER: OptDef = { key: 'border', label: 'Outline', kind: 'toggle', def: false };
const LIGHT: OptDef = { key: 'light', label: 'White text (over a black box)', kind: 'toggle', def: false };

// the shared look options for text-like widgets
const TEXTY: OptDef[] = [SIZE, BOLD, ALIGN, VALIGN, INVERT, LIGHT, BORDER];

export type Group = 'Text' | 'Date' | 'Calendar' | 'Weather & sky' | 'Extras' | 'Connections' | 'Shapes';

export interface WidgetDef {
	label: string;
	group: Group;
	blurb: string;
	w: number; // default size
	h: number;
	min: { w: number; h: number };
	fixed?: boolean; // the size is decided by the widget itself (the editor hides the resize handles)
	opts: OptDef[];
	def?: Record<string, string | boolean | number>; // option defaults that differ from the generic ones
}

export const WIDGETS: Record<string, WidgetDef> = {
	text: {
		label: 'Text',
		group: 'Text',
		blurb: 'Any words you like',
		w: 160,
		h: 44,
		min: { w: 20, h: 16 },
		opts: [{ key: 'text', label: 'Words', kind: 'text', def: 'Hello!', max: 120, rows: 3 }, ...TEXTY],
	},
	date_num: {
		label: 'Day number',
		group: 'Date',
		blurb: 'Today\'s date as a big number',
		w: 100,
		h: 90,
		min: { w: 20, h: 20 },
		opts: TEXTY,
		def: { align: 'center', bold: true },
	},
	weekday: {
		label: 'Weekday',
		group: 'Date',
		blurb: 'Wednesday',
		w: 150,
		h: 34,
		min: { w: 24, h: 16 },
		opts: [{ key: 'short', label: 'Short (Wed)', kind: 'toggle', def: false }, ...TEXTY],
		def: { bold: true },
	},
	month: {
		label: 'Month & year',
		group: 'Date',
		blurb: 'November 2026',
		w: 170,
		h: 30,
		min: { w: 24, h: 16 },
		opts: [
			{ key: 'year', label: 'Show the year', kind: 'toggle', def: true },
			{ key: 'short', label: 'Short (Nov)', kind: 'toggle', def: false },
			...TEXTY,
		],
	},
	updated: {
		label: 'Updated at',
		group: 'Date',
		blurb: 'When the screen last changed, e.g. "Updated 14:05"',
		w: 130,
		h: 20,
		min: { w: 40, h: 14 },
		opts: [{ key: 'prefix', label: 'Words before the time', kind: 'text', def: 'Updated', max: 20, rows: 1 }, ...TEXTY],
		def: { size: 's' },
	},
	date_full: {
		label: 'Full date',
		group: 'Date',
		blurb: 'Wed 4 Nov',
		w: 170,
		h: 30,
		min: { w: 24, h: 16 },
		opts: [
			{ key: 'fmt', label: 'Format', kind: 'choice', choices: [['long', 'Wednesday 4 November'], ['med', 'Wed 4 Nov'], ['num', '04/11/2026']], def: 'med' },
			...TEXTY,
		],
	},
	events: {
		label: 'Upcoming events',
		group: 'Calendar',
		blurb: 'A list of what\'s coming up',
		w: 380,
		h: 150,
		min: { w: 120, h: 28 },
		opts: [
			{ key: 'size', label: 'Text size', kind: 'choice', choices: SMALL_SIZES, def: 's' },
			{ key: 'when', label: 'Show', kind: 'choice', choices: [['time', 'Time'], ['daytime', 'Day and time'], ['none', 'Titles only']], def: 'daytime' },
			{ key: 'today', label: 'Today only', kind: 'toggle', def: false },
			{ key: 'dots', label: 'Dotted lines between', kind: 'toggle', def: true },
		],
	},
	next_event: {
		label: 'Next event',
		group: 'Calendar',
		blurb: 'Your very next event, big',
		w: 380,
		h: 110,
		min: { w: 80, h: 50 },
		opts: [
			{ key: 'label', label: '"Next up" label', kind: 'toggle', def: true },
			SIZE,
			ALIGN,
			INVERT,
			BORDER,
		],
		def: { size: 'auto' },
	},
	room_status: {
		label: 'Free or busy',
		group: 'Calendar',
		blurb: 'Says if you (or a room) are busy right now, and until when. Updates itself when a meeting starts or ends',
		w: 380,
		h: 110,
		min: { w: 100, h: 40 },
		opts: [
			{ key: 'free', label: 'When free', kind: 'text', def: 'Available', max: 24, rows: 1 },
			{ key: 'busy', label: 'When busy', kind: 'text', def: 'In use', max: 24, rows: 1 },
			{ key: 'detail', label: 'Show until when, and what\'s next', kind: 'toggle', def: true },
			{ key: 'title', label: 'Show the meeting name', kind: 'toggle', def: true },
			{ key: 'black', label: 'Black box when busy', kind: 'toggle', def: true },
			ALIGN,
			BORDER,
		],
		def: { align: 'center' },
	},
	queue: {
		label: 'Now seeing',
		group: 'Calendar',
		blurb: 'Who\'s being seen now and who\'s next, from today\'s appointments. For a waiting room. Updates itself when an appointment starts or ends',
		w: 380,
		h: 200,
		min: { w: 140, h: 70 },
		opts: [
			{ key: 'names', label: 'Names', kind: 'choice', choices: [['short', 'Sam K.'], ['first', 'First name'], ['full', 'Whole title']], def: 'short' },
			{ key: 'count', label: 'Show who\'s next', kind: 'choice', choices: [['0', 'Nobody'], ['1', '1 person'], ['2', '2 people'], ['3', '3 people'], ['4', '4 people']], def: '3' },
			{ key: 'times', label: 'Show their times', kind: 'toggle', def: true },
			{ key: 'now', label: 'Heading', kind: 'text', def: 'Now seeing', max: 24, rows: 1 },
			{ key: 'empty', label: 'When nobody\'s left today', kind: 'text', def: 'No more appointments today', max: 40, rows: 1 },
			ALIGN,
		],
		def: { align: 'center' },
	},
	event_count: {
		label: 'Event count',
		group: 'Calendar',
		blurb: '3 events today',
		w: 170,
		h: 30,
		min: { w: 24, h: 16 },
		opts: TEXTY,
	},
	mini_month: {
		label: 'Month grid',
		group: 'Calendar',
		blurb: 'A small calendar with today ringed',
		w: 190,
		h: 170,
		min: { w: 140, h: 130 },
		opts: [
			{ key: 'title', label: 'Month name on top', kind: 'toggle', def: true },
			{ key: 'dots', label: 'Mark busy days', kind: 'toggle', def: true },
			{ key: 'start', label: 'Week starts', kind: 'choice', choices: [['mon', 'Monday'], ['sun', 'Sunday']], def: 'mon' },
		],
	},
	week_strip: {
		label: 'Week strip',
		group: 'Calendar',
		blurb: 'Seven days in a row',
		w: 380,
		h: 70,
		min: { w: 140, h: 50 },
		opts: [
			{ key: 'dots', label: 'Mark busy days', kind: 'toggle', def: true },
			{ key: 'start', label: 'Week starts', kind: 'choice', choices: [['mon', 'Monday'], ['sun', 'Sunday'], ['today', 'Today']], def: 'mon' },
		],
	},
	weather: {
		label: 'Weather',
		group: 'Weather & sky',
		blurb: 'High and low for the day',
		w: 190,
		h: 30,
		min: { w: 24, h: 16 },
		opts: [{ key: 'show', label: 'Show', kind: 'choice', choices: [['both', 'High and low'], ['high', 'High only'], ['low', 'Low only']], def: 'both' }, ...TEXTY],
	},
	weather_icon: {
		label: 'Weather picture',
		group: 'Weather & sky',
		blurb: 'Sun, cloud, rain... for today',
		w: 90,
		h: 90,
		min: { w: 20, h: 20 },
		opts: [],
	},
	weather_summary: {
		label: 'Conditions',
		group: 'Weather & sky',
		blurb: 'Partly cloudy, 20% chance of rain',
		w: 190,
		h: 44,
		min: { w: 60, h: 20 },
		opts: [
			{ key: 'rain', label: 'Show chance of rain', kind: 'toggle', def: true },
			{ key: 'wind', label: 'Show wind', kind: 'toggle', def: false },
			SIZE, BOLD, ALIGN, VALIGN, INVERT, LIGHT, BORDER,
		],
	},
	forecast: {
		label: 'Forecast',
		group: 'Weather & sky',
		blurb: 'The next few days, with pictures',
		w: 380,
		h: 96,
		min: { w: 90, h: 60 },
		opts: [
			{ key: 'days', label: 'Days', kind: 'choice', choices: [['3', '3 days'], ['4', '4 days'], ['5', '5 days']], def: '5' },
			{ key: 'from', label: 'Start with', kind: 'choice', choices: [['today', 'Today'], ['tomorrow', 'Tomorrow']], def: 'today' },
			{ key: 'temps', label: 'Temperatures', kind: 'choice', choices: [['both', 'High and low'], ['high', 'High only']], def: 'both' },
			INVERT, BORDER,
		],
	},
	moon: {
		label: 'Moon',
		group: 'Weather & sky',
		blurb: 'Tonight\'s moon, drawn as it really looks',
		w: 130,
		h: 130,
		min: { w: 40, h: 40 },
		opts: [],
	},
	moon_text: {
		label: 'Moon phase',
		group: 'Weather & sky',
		blurb: 'Waxing Gibbous, 74% lit',
		w: 170,
		h: 60,
		min: { w: 60, h: 24 },
		opts: [{ key: 'lit', label: 'Show % lit', kind: 'toggle', def: true }, BOLD, ALIGN, INVERT, BORDER],
	},
	sun_times: {
		label: 'Sunrise & sunset',
		group: 'Weather & sky',
		blurb: 'The two times, side by side',
		w: 190,
		h: 56,
		min: { w: 110, h: 46 },
		opts: [{ key: 'daylight', label: 'Show length of day', kind: 'toggle', def: false }, INVERT, BORDER],
	},
	sun_arc: {
		label: 'Sun arc',
		group: 'Weather & sky',
		blurb: 'The sun\'s path across the sky',
		w: 190,
		h: 90,
		min: { w: 100, h: 60 },
		opts: [],
	},
	quote: {
		label: 'Quote of the day',
		group: 'Extras',
		blurb: 'A new one every day',
		w: 380,
		h: 130,
		min: { w: 100, h: 50 },
		opts: [
			{ key: 'author', label: 'Show who said it', kind: 'toggle', def: true },
			{ key: 'size', label: 'Biggest text', kind: 'choice', choices: SIZE_CHOICES.slice(0, 4), def: 'auto' },
			ALIGN,
			INVERT,
			BORDER,
		],
		def: { align: 'center' },
	},
	countdown: {
		label: 'Countdown',
		group: 'Extras',
		blurb: 'Days until your event. Set its name and date on the right',
		w: 170,
		h: 120,
		min: { w: 80, h: 60 },
		opts: [{ key: 'title', label: 'Show its name', kind: 'toggle', def: true }, INVERT, BORDER],
	},
	tasks: {
		label: 'To-do list',
		group: 'Extras',
		blurb: 'Your Google Tasks, with tick boxes',
		w: 250,
		h: 150,
		min: { w: 120, h: 34 },
		opts: [{ key: 'dots', label: 'Dotted lines between', kind: 'toggle', def: true }, { key: 'done', label: 'Show finished tasks', kind: 'toggle', def: true }],
	},
	messages: {
		label: 'Messages',
		group: 'Extras',
		blurb: 'Notes sent from your dashboard or your message link',
		w: 380,
		h: 140,
		min: { w: 100, h: 30 },
		opts: [
			{ key: 'big', label: 'Newest one big', kind: 'toggle', def: true },
			{ key: 'author', label: 'Who sent it', kind: 'toggle', def: true },
			{ key: 'time', label: 'When', kind: 'toggle', def: true },
		],
	},
	reminders: {
		label: 'Reminders',
		group: 'Extras',
		blurb: 'Bin day and other things that repeat. Set them in Customize display',
		w: 250,
		h: 120,
		min: { w: 100, h: 30 },
		opts: [
			{ key: 'big', label: 'Today\u2019s in a dark box', kind: 'toggle', def: false },
			{ key: 'days', label: 'Looks ahead', kind: 'choice', choices: [['1', 'Today'], ['2', '2 days'], ['7', 'A week'], ['14', '2 weeks']], def: '7' },
		],
	},
	youtube: {
		label: 'YouTube subscribers',
		group: 'Connections',
		blurb: 'Your subscriber count, big, for any YouTube channel. Paste its @handle or link',
		w: 260,
		h: 110,
		min: { w: 100, h: 40 },
		opts: [
			{ key: 'channel', label: 'Channel', kind: 'text', def: '@designedbykoda', max: 120, rows: 1, ph: '@yourchannel or a youtube.com link' },
			{ key: 'short', label: 'Short number (12.4K)', kind: 'toggle', def: false },
			{ key: 'name', label: 'Channel name', kind: 'toggle', def: true },
			ALIGN,
		],
		def: { align: 'center' },
	},
	github: {
		label: 'GitHub contributions',
		group: 'Connections',
		blurb: 'The green squares from a GitHub profile, in black and white. Any public profile, no sign-in',
		w: 380,
		h: 90,
		min: { w: 120, h: 40 },
		opts: [
			{ key: 'user', label: 'GitHub username', kind: 'text', def: 'agekoda', max: 80, rows: 1, ph: 'username or github.com link' },
			{ key: 'total', label: 'Contributions this year', kind: 'toggle', def: true },
		],
	},
	rss: {
		label: 'Headlines',
		group: 'Connections',
		blurb: 'The latest headlines from any news site, blog or podcast with an RSS feed',
		w: 380,
		h: 130,
		min: { w: 120, h: 40 },
		opts: [
			{ key: 'url', label: 'Feed link', kind: 'text', def: 'https://www.abc.net.au/news/feed/51120/rss.xml', max: 400, rows: 2, ph: 'https://… (RSS or Atom)' },
			{ key: 'count', label: 'How many', kind: 'choice', choices: [['2', '2'], ['3', '3'], ['4', '4'], ['5', '5']], def: '3' },
			{ key: 'title', label: 'Feed name', kind: 'toggle', def: true },
			{ key: 'look', label: 'Look', kind: 'choice', choices: [['list', 'List'], ['paper', 'Newspaper']], def: 'list' },
		],
	},
	markets: {
		label: 'Money and crypto',
		group: 'Connections',
		blurb: 'Exchange rates and crypto prices: USD, EUR, JPY, BTC, ETH and more. Crypto shows its change over the last day',
		w: 220,
		h: 120,
		min: { w: 110, h: 30 },
		opts: [
			{ key: 'list', label: 'Show', kind: 'text', def: 'USD, EUR, BTC, ETH', max: 60, rows: 1, ph: 'USD, EUR, BTC, ETH' },
			{ key: 'base', label: 'In', kind: 'text', def: 'AUD', max: 3, rows: 1, ph: 'AUD' },
			{ key: 'change', label: 'Crypto change (24 h)', kind: 'toggle', def: true },
			{ key: 'label', label: 'Heading', kind: 'toggle', def: false },
		],
	},
	tides: {
		label: 'Tides and surf',
		group: 'Weather & sky',
		blurb: 'The next high and low tides, wave height and sea temperature at your weather place',
		w: 200,
		h: 110,
		min: { w: 100, h: 40 },
		opts: [
			{ key: 'tides', label: 'Tides', kind: 'toggle', def: true },
			{ key: 'waves', label: 'Waves', kind: 'toggle', def: true },
			{ key: 'sea', label: 'Sea temperature', kind: 'toggle', def: true },
			{ key: 'label', label: 'Heading', kind: 'toggle', def: true },
		],
	},
	uvair: {
		label: 'UV and air',
		group: 'Weather & sky',
		blurb: 'Today\'s UV (and when it peaks) and the air quality at your weather place',
		w: 200,
		h: 80,
		min: { w: 100, h: 30 },
		opts: [
			{ key: 'uv', label: 'UV', kind: 'toggle', def: true },
			{ key: 'air', label: 'Air quality', kind: 'toggle', def: true },
		],
	},
	jpword: {
		label: 'Japanese word',
		group: 'Extras',
		blurb: 'A Japanese word of the day: the kanji, how to read it, and what it means. A new one each day',
		w: 220,
		h: 150,
		min: { w: 90, h: 60 },
		opts: [
			{ key: 'label', label: 'Heading', kind: 'toggle', def: true },
			{ key: 'romaji', label: 'Romaji (mizu)', kind: 'toggle', def: true },
			{ key: 'meaning', label: 'Meaning', kind: 'toggle', def: true },
			ALIGN,
		],
		def: { align: 'center' },
	},
	birthdays: {
		label: 'Birthdays',
		group: 'Extras',
		blurb: 'The next few birthdays, from your Google contacts and any birthday on your calendars',
		w: 250,
		h: 110,
		min: { w: 110, h: 30 },
		opts: [
			{ key: 'count', label: 'How many', kind: 'choice', choices: [['2', '2'], ['3', '3'], ['4', '4'], ['6', '6']], def: '4' },
			{ key: 'days', label: 'Looks ahead', kind: 'choice', choices: [['7', 'A week'], ['31', 'A month'], ['60', '2 months']], def: '31' },
			{ key: 'label', label: 'Heading', kind: 'toggle', def: true },
		],
	},
	habits: {
		label: 'Habits',
		group: 'Extras',
		blurb: 'Streaks and a grid of the days you did them. Tick them off in Customize display',
		w: 380,
		h: 120,
		min: { w: 100, h: 30 },
		opts: [
			{ key: 'days', label: 'Days shown', kind: 'choice', choices: [['0', 'As many as fit'], ['7', 'A week'], ['14', '2 weeks'], ['21', '3 weeks'], ['28', '4 weeks']], def: '0' },
			{ key: 'streak', label: 'Streak', kind: 'toggle', def: true },
			{ key: 'letters', label: 'Weekday letters', kind: 'toggle', def: false },
		],
	},
	qr: {
		label: 'QR code',
		group: 'Extras',
		blurb: 'A link, your Wi-Fi or any text, with your own words under it',
		w: 150,
		h: 172,
		min: { w: 50, h: 50 },
		opts: [
			{ key: 'mode', label: 'Opens', kind: 'choice', choices: [['link', 'A link'], ['wifi', 'Wi-Fi'], ['text', 'Text']], def: 'link' },
			{ key: 'url', label: 'Link', kind: 'text', def: 'designedbykoda.com', max: 300, rows: 2, ph: 'example.com', raw: true, show: { mode: 'link' } },
			{ key: 'ssid', label: 'Network name', kind: 'text', def: '', max: 32, rows: 1, ph: 'My Wi-Fi', raw: true, show: { mode: 'wifi' } },
			{ key: 'pass', label: 'Password', kind: 'text', def: '', max: 63, rows: 1, raw: true, show: { mode: 'wifi' } },
			{ key: 'sec', label: 'Security', kind: 'choice', choices: [['WPA', 'WPA'], ['WEP', 'WEP'], ['nopass', 'None']], def: 'WPA', show: { mode: 'wifi' } },
			{ key: 'hidden', label: 'Hidden network', kind: 'toggle', def: false, show: { mode: 'wifi' } },
			{ key: 'details', label: 'Write the name and password too', kind: 'toggle', def: true, show: { mode: 'wifi' } },
			{ key: 'data', label: 'Text inside the code', kind: 'text', def: '', max: 300, rows: 3, raw: true, show: { mode: 'text' } },
			{ key: 'caption', label: 'Your words', kind: 'text', def: 'Scan me', max: 60, rows: 2, ph: 'Leave empty for none' },
			{ key: 'pos', label: 'Words go', kind: 'choice', choices: [['below', 'Below'], ['right', 'Beside']], def: 'below' },
			BOLD,
			BORDER,
		],
		def: { bold: true },
	},
	list: {
		label: 'List',
		group: 'Text',
		blurb: 'One line per item: house rules, an agenda, a shopping list',
		w: 240,
		h: 120,
		min: { w: 60, h: 20 },
		opts: [
			{ key: 'items', label: 'Items (one per line)', kind: 'text', def: 'Check-out by 10am\nNo smoking inside\nQuiet after 10pm', max: 500, rows: 6, multiline: true },
			{ key: 'bullet', label: 'Bullets', kind: 'choice', choices: [['dot', 'Dots'], ['dash', 'Dashes'], ['num', '1. 2. 3.'], ['box', 'Tick boxes'], ['none', 'None']], def: 'dot' },
			{ key: 'size', label: 'Text size', kind: 'choice', choices: [['auto', 'Auto (fills the box)'], ['s', 'Small'], ['m', 'Medium'], ['l', 'Large']], def: 'auto' },
			BOLD,
			INVERT,
			BORDER,
		],
	},
	progress: {
		label: 'Progress bar',
		group: 'Extras',
		blurb: 'How far through the day, week, month or year',
		w: 250,
		h: 40,
		min: { w: 60, h: 18 },
		opts: [
			{ key: 'span', label: 'Measure', kind: 'choice', choices: [['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['year', 'Year']], def: 'year' },
			{ key: 'label', label: 'Label', kind: 'toggle', def: true },
		],
	},
	battery: {
		label: 'Battery',
		group: 'Extras',
		blurb: 'Battery level',
		w: 56,
		h: 22,
		min: { w: 30, h: 22 },
		fixed: true,
		opts: [
			{ key: 'align', label: 'Anchor', kind: 'choice', choices: [['left', 'Left'], ['center', 'Middle'], ['right', 'Right']], def: 'left' },
			{ key: 'invert', label: 'White (for use on black)', kind: 'toggle', def: false },
		],
	},
	picture: {
		label: 'Picture',
		group: 'Extras',
		blurb: 'Your own photo, turned into black and white dots',
		w: 184,
		h: 140,
		min: { w: 40, h: 30 },
		opts: [],
	},
	box: {
		label: 'Box',
		group: 'Shapes',
		blurb: 'An outlined or filled rectangle',
		w: 120,
		h: 70,
		min: { w: 6, h: 6 },
		opts: [
			{ key: 'fill', label: 'Style', kind: 'choice', choices: [['outline', 'Outline'], ['solid', 'Solid black'], ['light', 'Dotted fill']], def: 'outline' },
			{ key: 'round', label: 'Rounded corners', kind: 'toggle', def: false },
			{ key: 'thick', label: 'Line thickness', kind: 'choice', choices: [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4']], def: '2', show: { fill: 'outline' } },
		],
	},
	line: {
		label: 'Line',
		group: 'Shapes',
		blurb: 'A divider (wide box = across, tall = down)',
		w: 200,
		h: 4,
		min: { w: 1, h: 1 },
		opts: [
			{ key: 'thick', label: 'Thickness', kind: 'choice', choices: [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4']], def: '2' },
			{ key: 'dotted', label: 'Dotted', kind: 'toggle', def: false },
		],
	},
};

export const GROUPS: Group[] = ['Text', 'Date', 'Calendar', 'Weather & sky', 'Extras', 'Connections', 'Shapes'];

export const isWidgetType = (t: unknown): t is string => typeof t === 'string' && Object.prototype.hasOwnProperty.call(WIDGETS, t);

// The value an option has when nothing was chosen.
export function optDefault(type: string, def: OptDef): string | boolean | number {
	const d = WIDGETS[type]?.def?.[def.key];
	return d !== undefined ? d : def.def;
}

export function defaultOpts(type: string): Widget['o'] {
	const o: Widget['o'] = {};
	for (const def of WIDGETS[type]?.opts ?? []) o[def.key] = optDefault(type, def);
	return o;
}

// The options of a widget with every missing one filled in.
export function withDefaults(w: Widget): Record<string, string | boolean | number> {
	const o = defaultOpts(w.t);
	for (const [k, v] of Object.entries(w.o ?? {})) if (k in o) o[k] = v;
	return o;
}

let counter = 0;
export function newId(): string {
	counter++;
	return 'w' + Date.now().toString(36).slice(-5) + counter.toString(36);
}

export function makeWidget(type: string, x: number, y: number): Widget {
	const d = WIDGETS[type];
	return clampWidget({ id: newId(), t: type, x, y, w: d.w, h: d.h, o: defaultOpts(type) });
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const int = (v: unknown, def = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : def);

// Keeps a widget on the screen and at least as big as its type allows.
export function clampWidget(w: Widget): Widget {
	const d = WIDGETS[w.t];
	const mw = d.min.w;
	const mh = d.min.h;
	const width = d.fixed ? d.w : clamp(int(w.w, d.w), mw, SCREEN.w);
	const height = d.fixed ? d.h : clamp(int(w.h, d.h), mh, SCREEN.h);
	return { ...w, w: width, h: height, x: clamp(int(w.x), 0, SCREEN.w - Math.min(width, SCREEN.w)), y: clamp(int(w.y), 0, SCREEN.h - Math.min(height, SCREEN.h)) };
}

// A text option as it may be saved: links and Wi-Fi details exactly as typed (no control
// characters), lists one line per item, everything else as one tidy line.
function cleanOpt(def: Extract<OptDef, { kind: 'text' }>, v: string): string {
	if (def.raw) return v.replace(/[\x00-\x1f\x7f]/g, '').slice(0, def.max);
	if (def.multiline)
		return v
			.split(/\r?\n/)
			.slice(0, 15)
			.map((ln) => cleanText(ln, false).replace(/ +/g, ' ').trim())
			.join('\n')
			.slice(0, def.max);
	return cleanText(v, false).replace(/ +/g, ' ').slice(0, def.max);
}

// Turns whatever came in (the database, or a request) into a layout that is safe to draw.
// Unknown widgets and options are dropped, numbers are clamped, text is made plain ASCII.
export function sanitizeLayout(input: unknown): CustomLayout {
	const out: CustomLayout = { v: 1, widgets: [] };
	let raw: any = input;
	if (typeof raw === 'string') {
		try {
			raw = JSON.parse(raw);
		} catch {
			return out;
		}
	}
	if (!raw || typeof raw !== 'object' || !Array.isArray(raw.widgets)) return out;
	const seen = new Set<string>();
	for (const w of raw.widgets.slice(0, MAX_WIDGETS)) {
		if (!w || !isWidgetType(w.t)) continue;
		let id = typeof w.id === 'string' && /^[A-Za-z0-9_-]{1,16}$/.test(w.id) ? w.id : newId();
		if (seen.has(id)) id = newId();
		seen.add(id);
		const o = defaultOpts(w.t);
		for (const def of WIDGETS[w.t].opts) {
			const v = w.o?.[def.key];
			if (v === undefined) continue;
			if (def.kind === 'toggle') o[def.key] = v === true;
			else if (def.kind === 'choice') {
				if (typeof v === 'string' && def.choices.some((c) => c[0] === v)) o[def.key] = v;
			} else if (typeof v === 'string') o[def.key] = cleanOpt(def, v);
		}
		out.widgets.push(clampWidget({ id, t: w.t, x: w.x, y: w.y, w: w.w, h: w.h, o }));
	}
	return out;
}

export function layoutNeeds(layout: CustomLayout | null | undefined) {
	const types = new Set((layout?.widgets ?? []).map((w) => w.t));
	return {
		tasks: types.has('tasks'),
		countdown: types.has('countdown'),
		picture: types.has('picture'),
		// redraw when a meeting starts or ends, not just at midnight
		live: types.has('room_status') || types.has('queue'),
		reminders: types.has('reminders'),
		habits: types.has('habits'),
		birthdays: types.has('birthdays'),
		jpword: types.has('jpword'),
		connect: ['youtube', 'rss', 'github', 'markets', 'tides', 'uvair'].some((t) => types.has(t)),
	};
}

// ---- starting points ----
const W = (t: string, x: number, y: number, w: number, h: number, o: Widget['o'] = {}): Widget => ({ id: newId(), t, x, y, w, h, o });

export interface Template {
	id: string;
	label: string;
	note: string;
	build: () => CustomLayout;
}

export const TEMPLATES: Template[] = [
	{
		id: 'blank',
		label: 'Blank',
		note: 'Start from nothing',
		build: () => ({ v: 1, widgets: [] }),
	},
	{
		id: 'agenda',
		label: 'Classic',
		note: 'Date, month grid and your events',
		build: () => ({
			v: 1,
			widgets: [
				W('date_num', 8, 2, 110, 100, { bold: true, align: 'center' }),
				W('weekday', 8, 102, 180, 22, { align: 'left', size: 'm', bold: true }),
				W('month', 8, 124, 180, 18, { align: 'left', size: 's' }),
				W('mini_month', 204, 4, 190, 142, { title: false }),
				W('line', 0, 146, 400, 2),
				W('events', 8, 154, 384, 140, { when: 'time', dots: true }),
			],
		}),
	},
	{
		id: 'focus',
		label: 'Focus',
		note: 'Your next event, big, with the day on top',
		build: () => ({
			v: 1,
			widgets: [
				W('box', 0, 0, 400, 38, { fill: 'solid' }),
				W('date_full', 10, 4, 250, 30, { fmt: 'long', light: true, size: 'm', bold: true, valign: 'middle' }),
				W('battery', 334, 8, 56, 22, { align: 'left', invert: true }),
				W('next_event', 10, 50, 380, 130, { label: true, size: 'auto', align: 'left' }),
				W('line', 10, 190, 380, 2, { dotted: true }),
				W('events', 10, 200, 380, 94, { when: 'time', dots: false }),
			],
		}),
	},
	{
		id: 'forecast',
		label: 'Forecast',
		note: 'Today\'s weather, the next 5 days and your next event',
		build: () => ({
			v: 1,
			widgets: [
				W('weather_icon', 10, 8, 100, 100),
				W('date_full', 124, 10, 266, 26, { fmt: 'long', bold: true, size: 'm' }),
				W('weather', 124, 40, 266, 34),
				W('weather_summary', 124, 78, 266, 34),
				W('line', 0, 118, 400, 2),
				W('forecast', 10, 126, 380, 96, { days: '5' }),
				W('line', 10, 230, 380, 2, { dotted: true }),
				W('next_event', 10, 238, 380, 54, { label: true, size: 'auto' }),
			],
		}),
	},
	{
		id: 'sky',
		label: 'Sky',
		note: 'Moon, sun and the weather',
		build: () => ({
			v: 1,
			widgets: [
				W('moon', 10, 10, 170, 170),
				W('moon_text', 196, 14, 194, 52, { align: 'left', lit: true, bold: false }),
				W('weather', 196, 72, 194, 26, { show: 'both', size: 's', align: 'left' }),
				W('line', 196, 108, 194, 2),
				W('sun_arc', 196, 116, 194, 92),
				W('sun_times', 10, 214, 380, 48, { daylight: false }),
				W('date_full', 10, 266, 300, 26, { fmt: 'long', size: 's', align: 'left' }),
				W('battery', 334, 270, 56, 22, { align: 'right' }),
			],
		}),
	},
	{
		id: 'planner',
		label: 'Planner',
		note: 'Week strip, events and your to-do list',
		build: () => ({
			v: 1,
			widgets: [
				W('week_strip', 10, 8, 380, 72),
				W('events', 10, 92, 190, 198, { size: 's', when: 'time', dots: true }),
				W('line', 205, 94, 2, 196),
				W('tasks', 214, 92, 180, 198, { dots: true, done: true }),
			],
		}),
	},
	{
		id: 'quote',
		label: 'Quote board',
		note: 'A quote, the date and a countdown',
		build: () => ({
			v: 1,
			widgets: [
				W('box', 6, 6, 388, 288, { fill: 'outline', thick: '2', round: true }),
				W('quote', 22, 18, 356, 160, { author: true, size: 'auto', align: 'center' }),
				W('line', 120, 190, 160, 1),
				W('date_full', 22, 202, 180, 28, { fmt: 'med', size: 's', align: 'left' }),
				W('countdown', 214, 196, 168, 92, { title: false }),
				W('battery', 22, 252, 56, 22, { align: 'left' }),
			],
		}),
	},
	{
		id: 'home',
		label: 'Home board',
		note: 'Reminders like bin day, the weather and today\'s events',
		build: () => ({
			v: 1,
			widgets: [
				W('date_num', 8, 4, 80, 64, { bold: true, align: 'left' }),
				W('weekday', 92, 10, 170, 24, { align: 'left', size: 'm', bold: true }),
				W('month', 92, 36, 170, 20, { align: 'left', size: 's' }),
				W('weather', 262, 12, 130, 24, { show: 'both', size: 's', align: 'right' }),
				W('battery', 336, 42, 56, 22, { align: 'right' }),
				W('line', 0, 72, 400, 2),
				W('reminders', 10, 84, 200, 206, { big: true, days: '7' }),
				W('line', 218, 84, 2, 206),
				W('events', 228, 84, 166, 206, { size: 's', when: 'time', dots: true }),
			],
		}),
	},
	{ id: 'room', label: 'Meeting room', note: 'Room name, free or in use, and today\'s bookings', build: () => signLayout('room', SIGN_DEFAULTS) },
	{ id: 'guest', label: 'Guest welcome', note: 'Wi-Fi QR code, house rules and check-out time', build: () => signLayout('guest', SIGN_DEFAULTS) },
	{ id: 'nameplate', label: 'Desk name plate', note: 'Your name, your role, and whether you\'re free', build: () => signLayout('nameplate', SIGN_DEFAULTS) },
	{ id: 'waiting', label: 'Waiting room', note: 'Who\'s being seen now, and who\'s next', build: () => signLayout('waiting', SIGN_DEFAULTS) },
	{ id: 'youtube', label: 'YouTube', note: 'Your subscriber count, big', build: () => signLayout('youtube', SIGN_DEFAULTS) },
	{ id: 'github', label: 'GitHub', note: 'Your contributions graph, with what\'s next and the weather', build: () => signLayout('github', SIGN_DEFAULTS) },
	{ id: 'headlines', label: 'Headlines', note: 'The latest from any news site or blog', build: () => signLayout('headlines', SIGN_DEFAULTS) },
	{ id: 'markets', label: 'Money & crypto', note: 'Exchange rates and crypto prices, with the day\'s change', build: () => signLayout('markets', SIGN_DEFAULTS) },
	{ id: 'coast', label: 'Beach', note: 'Tides, surf, UV and the weather', build: () => COAST_LAYOUT },
];

export function templateById(id: string): Template {
	return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}

// ---- signs: Meeting room, Guest welcome and Desk name plate ----
// These are ready-made layouts (pick one, fill in a few boxes on Customize display) and also
// builder templates. Both are built here from the same few words, so they always match.
export type SignStyle = 'room' | 'guest' | 'nameplate' | 'waiting' | 'youtube' | 'github' | 'headlines' | 'markets';
export const SIGN_STYLES: SignStyle[] = ['room', 'guest', 'nameplate', 'waiting', 'youtube', 'github', 'headlines', 'markets'];
// ready-made screens built from the connection widgets (they pick their data, like a sign's words)
export const CONNECT_SIGNS = ['youtube', 'github', 'headlines', 'markets'];
// signs that redraw when an appointment or meeting starts or ends
export const LIVE_SIGNS = ['room', 'nameplate', 'waiting'];
export const isSignStyle = (s: unknown): s is SignStyle => SIGN_STYLES.includes(s as SignStyle);

export interface SignCfg {
	room: { name: string; cals: string[] };
	guest: { title: string; ssid: string; pass: string; rules: string; checkout: string; contact: string };
	nameplate: { name: string; role: string };
	waiting: { title: string; note: string; cals: string[] };
	youtube: { channel: string };
	github: { user: string };
	headlines: { url: string };
	markets: { list: string; base: string };
}
export const SIGN_DEFAULTS: SignCfg = {
	room: { name: 'Boardroom', cals: [] },
	guest: {
		title: 'Welcome, Sam!',
		ssid: 'Guest Wi-Fi',
		pass: 'change-me',
		rules: 'No smoking inside\nQuiet after 10pm\nBins go out on Tuesday\nLeave keys on the table',
		checkout: 'Check-out 10am',
		contact: 'Questions? Text Koda on 0400 000 000',
	},
	nameplate: { name: 'Alex Koda', role: 'Hardware Engineer' },
	waiting: { title: 'Riverside Physio', note: 'Please let reception know you\'re here', cals: [] },
	youtube: { channel: '@designedbykoda' },
	github: { user: 'agekoda' },
	headlines: { url: 'https://www.abc.net.au/news/feed/51120/rss.xml' },
	markets: { list: 'USD, EUR, GBP, BTC, ETH, SOL', base: 'AUD' },
};
// How long each box may be, and which ones are kept exactly as typed (Wi-Fi details).
const SIGN_LIMITS: Record<string, { max: number; raw?: boolean; multiline?: boolean }> = {
	name: { max: 40 }, title: { max: 40 }, role: { max: 40 }, checkout: { max: 30 }, contact: { max: 60 }, note: { max: 60 },
	ssid: { max: 32, raw: true }, pass: { max: 63, raw: true }, rules: { max: 300, multiline: true },
	channel: { max: 120, raw: true }, user: { max: 80, raw: true }, url: { max: 400, raw: true }, list: { max: 60 }, base: { max: 3 },
};

// The calendars a Meeting room or Waiting room reads, instead of the ones picked in Calendars and
// timetables: Google calendar ids, and "feed:<id>" for timetables and other calendar links or files.
// Empty means "the usual ones". So a sign carried between home and work keeps its own calendar.
export const CAL_SIGNS = ['room', 'waiting'] as const;
export function signCals(v: unknown): string[] {
	if (!Array.isArray(v)) return [];
	return [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 300))].slice(0, 10);
}

export function sanitizeSign(input: unknown): SignCfg {
	let raw: any = input;
	if (typeof raw === 'string') {
		try {
			raw = JSON.parse(raw);
		} catch {
			raw = null;
		}
	}
	const out = JSON.parse(JSON.stringify(SIGN_DEFAULTS)) as SignCfg;
	for (const sign of SIGN_STYLES) {
		const src = raw?.[sign];
		if (!src || typeof src !== 'object') continue;
		for (const key of Object.keys(out[sign]) as (keyof SignCfg[typeof sign])[]) {
			const v = src[key];
			if (key === 'cals') {
				(out[sign] as any).cals = signCals(v);
				continue;
			}
			if (typeof v !== 'string') continue;
			const lim = SIGN_LIMITS[key as string];
			(out[sign] as any)[key] = cleanOpt({ key: String(key), label: '', kind: 'text', def: '', max: lim.max, raw: lim.raw, multiline: lim.multiline }, v);
		}
	}
	return out;
}

const githubUserText = (u: string) => (String(u || '').trim().replace(/^@/, '').replace(/^https?:\/\/github\.com\//i, '').split('/')[0] || 'GITHUB').toUpperCase();

export function signLayout(sign: SignStyle, cfg: SignCfg): CustomLayout {
	if (sign === 'youtube') {
		return {
			v: 1,
			widgets: [
				W('box', 0, 0, 400, 30, { fill: 'solid' }),
				W('text', 10, 2, 180, 26, { text: 'YOUTUBE', light: true, bold: true, size: 's', valign: 'middle' }),
				W('date_full', 190, 2, 200, 26, { fmt: 'med', light: true, size: 's', align: 'right', valign: 'middle' }),
				W('youtube', 14, 44, 372, 214, { channel: cfg.youtube.channel, name: true, align: 'center' }),
				W('updated', 10, 270, 380, 22, { align: 'center', size: 's' }),
			],
		};
	}
	if (sign === 'github') {
		return {
			v: 1,
			widgets: [
				W('box', 0, 0, 400, 30, { fill: 'solid' }),
				W('text', 10, 2, 200, 26, { text: githubUserText(cfg.github.user), light: true, bold: true, size: 's', valign: 'middle' }),
				W('date_full', 190, 2, 200, 26, { fmt: 'med', light: true, size: 's', align: 'right', valign: 'middle' }),
				W('github', 10, 40, 380, 108, { user: cfg.github.user, total: true }),
				W('line', 10, 156, 380, 2),
				W('events', 10, 166, 250, 126, { size: 's', when: 'daytime', dots: true }),
				W('line', 270, 166, 1, 122),
				W('weather_icon', 296, 168, 72, 72),
				W('weather', 280, 244, 110, 44, { size: 'm', bold: true, align: 'center', valign: 'middle' }),
			],
		};
	}
	if (sign === 'headlines') {
		// a front page: the feed's name as the masthead, the top story big, then as many more as fit in two columns
		return { v: 1, widgets: [W('rss', 12, 8, 376, 286, { url: cfg.headlines.url, count: '5', title: true, look: 'paper' })] };
	}
	if (sign === 'markets') {
		return {
			v: 1,
			widgets: [
				W('box', 0, 0, 400, 30, { fill: 'solid' }),
				W('text', 10, 2, 180, 26, { text: `MARKETS IN ${(cfg.markets.base || 'AUD').toUpperCase()}`, light: true, bold: true, size: 's', valign: 'middle' }),
				W('updated', 190, 2, 200, 26, { light: true, size: 's', align: 'right', valign: 'middle' }),
				W('markets', 20, 44, 360, 246, { list: cfg.markets.list, base: cfg.markets.base, change: true, label: false }),
			],
		};
	}
	if (sign === 'room') {
		const c = cfg.room;
		return {
			v: 1,
			widgets: [
				W('box', 0, 0, 400, 44, { fill: 'solid' }),
				W('text', 12, 4, 220, 36, { text: c.name, light: true, bold: true, size: 'auto', valign: 'middle' }),
				W('updated', 232, 12, 158, 20, { light: true, align: 'right', size: 's' }),
				W('room_status', 10, 54, 380, 124, { free: 'Available', busy: 'In use', black: true, title: true, detail: true }),
				W('text', 10, 188, 200, 20, { text: 'Today', bold: true, size: 's', valign: 'top' }),
				W('events', 10, 210, 380, 84, { today: true, when: 'time', dots: true }),
			],
		};
	}
	if (sign === 'guest') {
		const c = cfg.guest;
		return {
			v: 1,
			widgets: [
				W('text', 10, 6, 380, 46, { text: c.title, bold: true, size: 'auto' }),
				W('line', 10, 54, 380, 2),
				W('qr', 10, 64, 150, 214, { mode: 'wifi', ssid: c.ssid, pass: c.pass, sec: c.pass ? 'WPA' : 'nopass', details: true, caption: 'Scan to join Wi-Fi', bold: true }),
				W('text', 176, 64, 214, 20, { text: 'House rules', bold: true, size: 's', valign: 'top' }),
				W('list', 176, 88, 214, 134, { items: c.rules, bullet: 'dot', size: 'auto' }),
				W('text', 176, 230, 214, 40, { text: c.checkout, invert: true, bold: true, size: 'auto', align: 'center' }),
				W('text', 10, 280, 380, 18, { text: c.contact, size: 's', align: 'center' }),
			],
		};
	}
	if (sign === 'waiting') {
		const c = cfg.waiting;
		return {
			v: 1,
			widgets: [
				W('box', 0, 0, 400, 44, { fill: 'solid' }),
				W('text', 12, 4, 260, 36, { text: c.title, light: true, bold: true, size: 'auto', valign: 'middle' }),
				W('updated', 272, 12, 118, 20, { light: true, align: 'right', size: 's' }),
				W('queue', 10, 54, 380, 206, { names: 'short', count: '3', times: true, now: 'Now seeing', empty: 'No more appointments today', align: 'center' }),
				W('text', 10, 270, 380, 24, { text: c.note, size: 's', align: 'center', valign: 'middle' }),
			],
		};
	}
	const c = cfg.nameplate;
	return {
		v: 1,
		widgets: [
			W('text', 10, 24, 380, 104, { text: c.name, bold: true, size: 'auto', align: 'center' }),
			W('text', 10, 130, 380, 30, { text: c.role, size: 'm', align: 'center' }),
			W('line', 120, 176, 160, 2),
			W('room_status', 50, 192, 300, 92, { free: 'Available', busy: 'In a meeting', black: true, title: false, detail: true }),
		],
	};
}

// ---- Beach: the ready-made tides, surf, UV and weather screen (layouts/coast.ts draws it) ----
let coastN = 0;
const CW = (t: string, x: number, y: number, w: number, h: number, o: Record<string, unknown> = {}) => ({ id: `c${coastN++}`, t, x, y, w, h, o });

export const COAST_LAYOUT = sanitizeLayout({
	v: 1,
	widgets: [
		CW('box', 0, 0, 400, 30, { fill: 'solid' }),
		CW('text', 10, 2, 180, 26, { text: 'BEACH', light: true, bold: true, size: 's', valign: 'middle' }),
		CW('date_full', 190, 2, 200, 26, { fmt: 'med', light: true, size: 's', align: 'right', valign: 'middle' }),
		CW('weather_icon', 10, 38, 76, 76),
		CW('weather', 94, 40, 150, 42, { size: 'auto', bold: true, valign: 'middle' }),
		CW('weather_summary', 94, 84, 150, 36, { rain: false, wind: true, size: 's', valign: 'top' }),
		CW('line', 252, 40, 1, 80),
		CW('uvair', 262, 40, 130, 82, { uv: true, air: true }),
		CW('line', 10, 128, 380, 2),
		CW('tides', 10, 138, 190, 156, { tides: true, waves: true, sea: true, label: true }),
		CW('line', 206, 138, 1, 152),
		CW('forecast', 214, 138, 180, 154, { days: '3', from: 'tomorrow' }),
	],
});


// The widgets a ready-made connections screen draws, so the device and the preview know which
// YouTube channel, feed, GitHub user, prices or tides to fetch for it.
export function builtinLayout(style: string, signRaw: unknown): CustomLayout | null {
	if (style === 'coast') return COAST_LAYOUT;
	if (CONNECT_SIGNS.includes(style)) return signLayout(style as SignStyle, sanitizeSign(signRaw));
	return null;
}
