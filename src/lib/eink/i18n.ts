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
	'Tomorrow': '明日',
	'Overdue': '期限切れ',
	// countdown
	'Set up your countdown': 'カウントダウンを設定',
	'Open your dashboard, choose Customize,': 'ダッシュボードの「カスタマイズ」から',
	'then give it a name and a date.': '名前と日付を設定してください。',
	'then the Picture tab.': '「画像」タブを開いてください。',
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
	[/^High:? ?(-?\d+)C( +)Low:? ?(-?\d+)C$/, (_a, h, sp, l) => `最高${h}C${sp}最低${l}C`],
	[/^H:(-?\d+)C( +)L:(-?\d+)C$/, (_a, h, sp, l) => `高${h}C${sp}低${l}C`],
	[/^H (-?\d+)C$/, (_a, h) => `高 ${h}C`],
	[/^L (-?\d+)C$/, (_a, l) => `低 ${l}C`],
	[/^High +(-?\d+)C$/, (_a, h) => `最高${h}C`],
	[/^Low +(-?\d+)C$/, (_a, l) => `最低${l}C`],
	[/^Low (\d+)%$/, (_a, p) => `低 ${p}%`],
	[/^(\d+)% lit$/, (_a, p) => `輝面 ${p}%`],
	[/^Rain (\d+)%$/, (_a, p) => `降水 ${p}%`],
	[/^Wind (\d+) km\/h$/, (_a, p) => `風 ${p}km/h`],
	[/^in (\d+) days$/, (_a, n) => `${n}日後`],
	[/^(\d+) to do(?: {3}\+(\d+) more)?$/, (_a, n, m) => `あと${n}件` + (m ? `   他${m}件` : '')],
	[/^1 events? today$/, () => '今日は1件'],
	[/^(\d+) events? today$/, (_a, n) => `今日は${n}件`],
	[/^(\d+) events?$/, (_a, n) => `${n}件`],
	[/^until (\d\d:\d\d)$/, (_a, t) => `${t}まで`],
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
