// What's new, newest first. Add an entry whenever something worth telling people ships.
// kind: 'calendar' = firmware on the calendar itself, 'dashboard' = the website and dashboard,
// 'screens' = new or changed screens (these reach every calendar on its next update).
export type Kind = 'calendar' | 'dashboard' | 'screens';
export interface Change {
	kind: Kind;
	title: string;
	text: string;
}
export interface Month {
	month: string; // e.g. "November 2026"
	changes: Change[];
}

export const CHANGELOG: Month[] = [
	{
		month: 'November 2026',
		changes: [
			{ kind: 'dashboard', title: 'Email alerts', text: 'Get an email when a calendar’s battery is low or it stops checking in, and optionally when it updates. Turn each one on or off from your dashboard.' },
			{ kind: 'dashboard', title: 'Track your order', text: 'Pre-orders show on your dashboard with where they’re up to, from being made to delivered, with tracking once they ship.' },
			{ kind: 'dashboard', title: 'Share your designs', text: 'Share a screen you made in the layout builder as a link. Anyone who opens it can preview it and add a copy to their own calendar.' },
			{ kind: 'calendar', title: 'Updates over Wi-Fi', text: 'Calendars now update themselves, showing a progress bar while they do. If an update ever has a problem, the calendar goes back to the version before by itself.' },
			{ kind: 'calendar', title: 'New setup screens', text: 'A welcome screen out of the box, clearer Wi-Fi and pairing screens, and a menu to reset Wi-Fi by holding the button for 5 seconds.' },
			{ kind: 'screens', title: 'Repeating reminders', text: 'A reminders widget and a Home board template for things like bin night, bills and birthdays, repeating weekly or monthly.' },
			{ kind: 'screens', title: 'Japanese quotes', text: 'The Quote screen shows Japanese proverbs when your calendar is set to Japanese.' },
			{ kind: 'screens', title: 'Every date fits', text: 'The Agenda’s month view now shows every date, even in months that need a sixth row.' },
			{ kind: 'screens', title: 'Degree signs and a 12-hour clock', text: 'Temperatures show a proper ° sign, and times can be shown in 12-hour format (Language and units).' },
			{ kind: 'dashboard', title: 'Battery history', text: 'See how your calendar’s battery has gone over time, with a better estimate of how long a charge lasts.' },
			{ kind: 'dashboard', title: 'Copy settings', text: 'Copy one calendar’s screens, schedule and designs to another in one go.' },
			{ kind: 'dashboard', title: 'A new Customize display', text: 'Choose a screen from one picker, set a schedule and what the button does, and see a bigger preview.' },
			{ kind: 'dashboard', title: 'Help page', text: 'Answers for setup, Wi-Fi, the button and what each screen means.' },
		],
	},
];
