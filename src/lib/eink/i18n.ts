// Which language the screen is drawn in, and the small English -> Japanese phrase table.
//
// Layouts are written in English. When a device is set to Japanese, text goes through tr() on its way
// to being drawn (and measured, so the layout leaves the right amount of room). Dates and weekdays are
// handled by the helpers in context.ts instead, because Japanese puts them in a different order.
//
// The language is a module-level setting that renderLayout() switches on for the duration of one
// (synchronous) render and then puts back, so layouts never have to pass it around.
export type Lang = 'en' | 'ja';
export const LANGS: Lang[] = ['en', 'ja'];
export const LANG_LABELS: Record<Lang, string> = { en: 'English', ja: '日本語 (Japanese)' };

export function isLang(v: unknown): v is Lang {
	return v === 'en' || v === 'ja';
}

let current: Lang = 'en';
export const getLang = (): Lang => current;
export function setLang(l: Lang): void {
	current = l;
}
export const isJa = (): boolean => current === 'ja';

// Whole-phrase translations (the whole drawn string has to match).
const JA: Record<string, string> = {
	// headers
	'UPCOMING': '今後の予定',
	'NEXT UP': '次の予定',
	'COUNTDOWN': 'カウントダウン',
	'TO-DO': 'やること',
	'PHOTO FRAME': 'フォトフレーム',
	'QUOTE OF THE DAY': '今日の名言',
	'MOON & SUN': '月と太陽',
	'TODAY': '今日',
	'NOW': '今',
	'NEXT': '次',
	'Next': '次',
	'Later': '今後',
	// events
	'No upcoming events': '今後の予定はありません',
	'Nothing coming up': '予定はありません',
	'No events today': '今日の予定はありません',
	'Nothing on today': '今日の予定はありません',
	'All day': '終日',
	'Free day': '予定なし',
	'All done': '完了',
	'Today': '今日',
	'Yesterday': '昨日',
	// your own design, before anything is added
	'Design your own screen': '自分だけの画面をデザイン',
	'Open Customize display on your dashboard': 'ダッシュボードの「表示のカスタマイズ」で',
	'and choose "Edit this design".': '「このデザインを編集」を選んでください。',
	// layout builder widgets and the sign layouts (the default words; words people type stay as typed)
	'Next up': '次の予定',
	'Available': '空き',
	'In use': '使用中',
	'In a meeting': '会議中',
	'Busy': '予定あり',
	'Free': '空き',
	'for the rest of the day': '今日はこの後空いています',
	'House rules': 'ハウスルール',
	'Scan to join Wi-Fi': 'Wi-Fiに接続',
	'Scan me': 'スキャンしてください',
	'Password:': 'パスワード:',
	'Make this bigger': 'もう少し大きくすると',
	'to fit the code': 'コードが入ります',
	'Type your Wi-Fi name': 'Wi-Fi名を入力してください',
	'Type a link or some text': 'リンクか文字を入力してください',
	'Too much text for a QR code': 'QRコードに入りきりません',
	'MESSAGES': 'メッセージ',
	'REMINDERS': 'リマインダー',
	'No reminders': 'リマインダーなし',
	'HABITS': '習慣',
	'Add them in Settings on your dashboard.': 'ダッシュボードの「設定」から追加してください。',
	"Send one from your dashboard, or share your calendar's message link.": 'ダッシュボードから送るか、メッセージ用リンクを共有してください。',
	'Open Settings on your dashboard, then give it a name and a date.': 'ダッシュボードの「設定」で名前と日付を設定してください。',
	'Open Settings on your dashboard, then add your photo.': 'ダッシュボードの「設定」で写真を追加してください。',
	'TOMORROW': '明日',
	'THIS WEEK': '今週',
	'NEXT WEEK': '来週',
	'BRING': '持ち物',
	'DUE SOON': 'もうすぐ',
	'Nothing on': '予定なし',
	'A free day': '予定のない日',
	'Just the above': '上の予定だけ',
	'AWAY': '不在',
	'Away': '不在',
	'Tomorrow': '明日',
	'NOTES': 'メモ',
	'No notes yet': 'メモはまだありません',
	'No habits yet': '習慣はまだありません',
	'Add your habits': '習慣を追加',
	'Reading, the gym, water: things to do every day.': '読書や運動など、毎日やりたいことを。',
	'Start today': '今日から',
	'1 day': '1日連続',
	'Add your reminders': 'リマインダーを追加',
	'Bin day, recycling, rent: things that repeat.': 'ゴミの日や家賃など、繰り返す予定を。',
	'Open Customize display on your dashboard.': 'ダッシュボードの「表示のカスタマイズ」から。',
	'No messages': 'メッセージなし',
	'No messages yet': 'メッセージはまだありません',
	'Send one from your dashboard,': 'ダッシュボードから送るか、',
	"or share your calendar's message link.": 'メッセージ用リンクを共有してください。',
	'Tomorrow': '明日',
	'Overdue': '期限切れ',
	// countdown
	'Set up your countdown': 'カウントダウンを設定',
	'Open your dashboard, choose Customize,': 'ダッシュボードの「カスタマイズ」から',
	'then give it a name and a date.': '名前と日付を設定してください。',
	'then add your photo.': '写真を追加してください。',
	'Add your photo': '写真を追加',
	'day to go': '日後',
	'days to go': '日後',
	'day ago': '日前',
	'days ago': '日前',
	'Today!': '今日！',
	// to-do
	'Connect Google Tasks': 'Googleタスクを連携',
	'Open your dashboard, choose Customize, then press "Connect Google Tasks".': 'ダッシュボードの「カスタマイズ」で「Googleタスクを連携」を押してください。',
	'Connect Google Tasks in Customize display': 'カスタマイズでGoogleタスクを連携してください',
	"Couldn't load your tasks": 'タスクを読み込めませんでした',
	'It will try again at the next update.': '次の更新でもう一度試します。',
	'All done!': 'すべて完了！',
	'Nothing on your list.': 'リストは空です。',
	'Nothing to do': 'やることはありません',
	// moon and sun
	'Sunrise': '日の出',
	'Sunset': '日の入り',
	'New moon': '新月',
	'Full moon': '満月',
	'New Moon': '新月',
	'Waxing Crescent': '三日月',
	'First Quarter': '上弦の月',
	'Waxing Gibbous': '十三夜',
	'Full Moon': '満月',
	'Waning Gibbous': '寝待月',
	'Last Quarter': '下弦の月',
	'Waning Crescent': '有明月',
	'Add a weather location in setup to see sunrise and sunset times.': '設定で天気の場所を追加すると、日の出と日の入りの時刻が表示されます。',
	'The sun stays up all day today.': '今日は一日中、日が沈みません。',
	'The sun stays down all day today.': '今日は一日中、日が昇りません。',
	// weather
	'No weather': '天気なし',
	'Clear': '快晴', 'Mostly clear': '晴れ', 'Partly cloudy': '晴れ時々曇り', 'Cloudy': '曇り', 'Fog': '霧',
	'Light drizzle': '弱い霧雨', 'Drizzle': '霧雨', 'Heavy drizzle': '強い霧雨', 'Freezing drizzle': '凍る霧雨',
	'Light rain': '小雨', 'Rain': '雨', 'Heavy rain': '大雨', 'Freezing rain': '凍雨',
	'Light snow': '小雪', 'Snow': '雪', 'Heavy snow': '大雪', 'Snow grains': '雪あられ',
	'Light showers': 'にわか雨(弱)', 'Showers': 'にわか雨', 'Heavy showers': 'にわか雨(強)', 'Snow showers': 'にわか雪',
	'Thunderstorm': '雷雨', 'Thunder and hail': '雷とひょう',
	// builder progress bars
	'Day': '今日', 'Week': '今週',
};

// Pattern translations, for strings with numbers in them.
const PATTERNS: [RegExp, (...m: string[]) => string][] = [
	[/^High:? ?(-?\d+)(°?[CF])( +)Low:? ?(-?\d+)°?[CF]$/, (_a, h, u, sp, l) => `最高${h}${u}${sp}最低${l}${u}`],
	[/^H:(-?\d+)(°?[CF])( +)L:(-?\d+)°?[CF]$/, (_a, h, u, sp, l) => `高${h}${u}${sp}低${l}${u}`],
	[/^H (-?\d+)(°?[CF])$/, (_a, h, u) => `高 ${h}${u}`],
	[/^L (-?\d+)(°?[CF])$/, (_a, l, u) => `低 ${l}${u}`],
	[/^High +(-?\d+)(°?[CF])$/, (_a, h, u) => `最高${h}${u}`],
	[/^Low +(-?\d+)(°?[CF])$/, (_a, l, u) => `最低${l}${u}`],
	[/^Low (\d+)%$/, (_a, p) => `低 ${p}%`],
	[/^(\d+)% lit$/, (_a, p) => `輝面 ${p}%`],
	[/^Rain (\d+)%$/, (_a, p) => `降水 ${p}%`],
	[/^Wind (\d+) (km\/h|mph)$/, (_a, p, u) => `風 ${p}${u}`],
	[/^in (\d+) days$/, (_a, n) => `${n}日後`],
	[/^(\d+) days$/, (_a, n) => `${n}日連続`],
	[/^(\d+) to do(?: {3}\+(\d+) more)?$/, (_a, n, m) => `あと${n}件` + (m ? `   他${m}件` : '')],
	[/^1 events? today$/, () => '今日は1件'],
	[/^(\d+) events? today$/, (_a, n) => `今日は${n}件`],
	[/^(\d+) events?$/, (_a, n) => `${n}件`],
	[/^until (\S+)$/, (_a, t) => `${t}まで`],
	[/^Next (\S+)  (.+)$/, (_a, t, rest) => `次 ${t}  ${rest}`],
	[/^Updated (\S+)$/, (_a, t) => `更新 ${t}`],
	[/^Password: (.+)$/, (_a, p) => `パスワード: ${p}`],
	[/^to (\d\d:\d\d)$/, (_a, t) => `${t}まで`],
	[/^at (\d\d:\d\d)$/, (_a, t) => `${t}から`],
	[/^Next (\d\d:\d\d)$/, (_a, t) => `次 ${t}`],
	[/^(\d+)h (\d\d)m of daylight$/, (_a, h, m) => `日照 ${h}時間${m}分`],
	[/^(\d+)h (\d\d)m daylight$/, (_a, h, m) => `日照 ${h}時間${m}分`],
	[/^(Today|Tomorrow), all day$/, (_a, w) => `${w === 'Today' ? '今日' : '明日'}・終日`],
	[/^(Today|Tomorrow), (\d\d:\d\d)$/, (_a, w, t) => `${w === 'Today' ? '今日' : '明日'} ${t}`],
	[/^All day: (.*)$/, (_a, rest) => `終日: ${rest}`],
];

export function tr(s: string): string {
	if (current !== 'ja' || !s) return s;
	const whole = JA[s];
	if (whole !== undefined) return whole;
	for (const [re, f] of PATTERNS) {
		const m = re.exec(s);
		if (m) return f(...(m as unknown as string[]));
	}
	return s;
}
