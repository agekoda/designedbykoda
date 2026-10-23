// Poll definitions. To add a poll: add an entry here, put its images under
// /public/images/polls/<id>/, and it's live at /poll/<id>. The API only
// accepts the option ids listed here.
export interface PollOption {
	id: string;
	label: string;
	note: string;
	image: string;
}
export interface Poll {
	title: string;
	intro: string;
	maxPicks: number;
	options: PollOption[];
}

export const POLLS: Record<string, Poll> = {
	'eink-styles': {
		title: 'Pick the E-Ink Calendar layout',
		intro:
			'The E-Ink Calendar can show your day in five different layouts. Tap your favourite first, then (if you like) your second and third. You can vote for just one.',
		maxPicks: 3,
		options: [
			{ id: 'month', label: 'Month', note: 'The whole month, with dots on busy days', image: '/images/polls/eink-styles/month.png' },
			{ id: 'agenda', label: 'Agenda', note: 'Today, a mini month and your next events', image: '/images/polls/eink-styles/agenda.png' },
			{ id: 'bigdate', label: 'Big date', note: 'A huge date beside an upcoming list', image: '/images/polls/eink-styles/bigdate.png' },
			{ id: 'week', label: 'Week', note: 'This week, day by day', image: '/images/polls/eink-styles/week.png' },
			{ id: 'nextup', label: 'Next up', note: 'Your very next event, big and clear', image: '/images/polls/eink-styles/nextup.png' },
		],
	},
};
