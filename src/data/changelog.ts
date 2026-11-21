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
			{ kind: 'dashboard', title: 'Bigger previews, roomier builder', text: 'Choose a screen now always shows three screens to a row, so you can actually read them at any zoom, and the preview of your calendar is closer up. In the layout builder the widgets and settings fill the space beside the screen, and every widget card is bigger and sharper, so even the pixel fonts are easy to read.' },
			{ kind: 'screens', title: 'Headlines like a newspaper', text: 'The Headlines screen now looks like a front page, with the news site’s name as the masthead, the top story in big type and the next ones in two columns. The headlines widget in the layout builder has the same Newspaper look as an option.' },
			{ kind: 'screens', title: 'Five new ready-made screens', text: 'YouTube, GitHub, Headlines, Money & crypto and Beach are now in Choose a screen under At a glance, so you can show your subscriber count, your contributions, the news, prices or the tides and surf without building anything. Just pick one and fill in your channel, username, feed or currencies.' },
			{ kind: 'screens', title: 'Connections', text: 'New widgets for the layout builder: your YouTube subscriber count, your GitHub contributions graph, headlines from any news site or blog, and exchange rates and crypto prices in your own currency.' },
			{ kind: 'screens', title: 'Tides, surf and UV', text: 'See the next high and low tides, wave height and sea temperature, plus today’s peak UV and the air quality, all for your weather place.' },
			{ kind: 'dashboard', title: 'Faster on iPhone', text: 'Tapping between pages in Safari is now instant, and every page downloads less.' },
			{ kind: 'dashboard', title: 'Switch calendars on and off', text: 'Every calendar and timetable has an on/off switch, so you can hide one without removing it. You can also use a calendar with no Google calendars at all, just a timetable or an Outlook link.' },
			{ kind: 'screens', title: 'Forecast', text: 'A new screen with today’s weather up big, the next few days, and sunrise and sunset.' },
			{ kind: 'screens', title: 'Waiting room', text: 'A sign for the front of a clinic or studio: who’s being seen now and who’s next, with only first names and an initial showing. Meeting room and Waiting room can each use their own calendars, so work never mixes with home.' },
			{ kind: 'dashboard', title: 'Desk status from your phone', text: 'Set your desk name plate to In a meeting, Back soon or anything you like from a private link on your phone, or with an iPhone Shortcut.' },
			{ kind: 'screens', title: 'Festive photo frame', text: 'Put a border of snowflakes, trees and baubles round your photo, with a greeting along the bottom. Set it to In December and it comes and goes by itself.' },
			{ kind: 'screens', title: 'Birthdays and a Japanese word', text: 'A Birthdays widget for the next few birthdays from your Google contacts and calendars, and a Japanese word of the day with its reading and meaning.' },
			{ kind: 'dashboard', title: 'Settings, all in one place', text: 'Customize display is now Settings: calendars and timetables, weather, away mode and your calendar’s details sit in one menu, with the preview always beside you.' },
			{ kind: 'dashboard', title: 'Type in the builder', text: 'Click a text box again to type straight onto it, in the screen’s own font.' },
			{ kind: 'screens', title: 'School day and School week', text: 'School day shows today’s classes until 6pm, then tomorrow’s, with what to bring and what’s due soon. School week lays out your whole timetable.' },
			{ kind: 'dashboard', title: 'School timetables', text: 'Add your Compass or SEQTA timetable, an Outlook calendar or any calendar link. Give your classes proper names and rooms, and hide the all-day clutter.' },
			{ kind: 'dashboard', title: 'Away mode and quiet hours', text: 'Pause the calendar while you’re away, and keep it from updating overnight to save battery.' },
			{ kind: 'screens', title: 'Habits and Notes', text: 'Tick off habits and watch your streak grow, or pin a few notes to the screen.' },
			{ kind: 'dashboard', title: 'Give it as a gift', text: 'Pre-order a calendar as a gift, with a card to print and give on the day, festive or plain. Nothing in the box shows the price.' },
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
