// Moon phase, and sunrise / sunset, worked out from the date and a place.
// Low-precision formulas from the Astronomical Almanac and the NOAA solar
// calculator: accurate to about a minute for sun times, and to well under an
// hour for the moon's phase. Plenty for a wall display, and no web service
// to call.
const RAD = Math.PI / 180;
const wrap360 = (x: number) => ((x % 360) + 360) % 360;
const jdOf = (ms: number) => ms / 86400000 + 2440587.5;

// How far the Moon is ahead of the Sun in the sky, in degrees (0 = new moon, 180 = full).
export function moonElongation(ms: number): number {
	const T = (jdOf(ms) - 2451545.0) / 36525;
	const moon =
		218.32 +
		481267.881 * T +
		6.29 * Math.sin((135.0 + 477198.87 * T) * RAD) -
		1.27 * Math.sin((259.3 - 413335.36 * T) * RAD) +
		0.66 * Math.sin((235.7 + 890534.22 * T) * RAD) +
		0.21 * Math.sin((269.9 + 954397.74 * T) * RAD) -
		0.19 * Math.sin((357.5 + 35999.05 * T) * RAD) -
		0.11 * Math.sin((186.5 + 966404.03 * T) * RAD);
	const d = jdOf(ms) - 2451545.0;
	const g = 357.528 + 0.9856003 * d;
	const sun = 280.46 + 0.9856474 * d + 1.915 * Math.sin(g * RAD) + 0.02 * Math.sin(2 * g * RAD);
	return wrap360(moon - sun);
}

export interface MoonInfo {
	elong: number; // 0..360
	illum: number; // 0..1, fraction of the disc that is lit
	name: string;
	waxing: boolean;
}

export function moonInfo(ms: number): MoonInfo {
	const D = moonElongation(ms);
	const illum = (1 - Math.cos(D * RAD)) / 2;
	let name: string;
	if (D < 8 || D >= 352) name = 'New Moon';
	else if (D < 82) name = 'Waxing Crescent';
	else if (D < 98) name = 'First Quarter';
	else if (D < 172) name = 'Waxing Gibbous';
	else if (D < 188) name = 'Full Moon';
	else if (D < 262) name = 'Waning Gibbous';
	else if (D < 278) name = 'Last Quarter';
	else name = 'Waning Crescent';
	return { elong: D, illum, name, waxing: D < 180 };
}

// The next moment (ms) the Moon reaches `target` degrees of elongation (0 = new, 180 = full), after `fromMs`.
export function nextPhase(fromMs: number, target: 0 | 180): number {
	const off = (t: number) => ((moonElongation(t) - target + 540) % 360) - 180; // -180..180, 0 at the phase
	const step = 6 * 3600 * 1000;
	let a = fromMs;
	let fa = off(a);
	for (let i = 0; i < 130; i++) {
		const b = a + step;
		const fb = off(b);
		if (fa < 0 && fb >= 0 && fb - fa < 90) {
			let lo = a;
			let hi = b;
			for (let k = 0; k < 24; k++) {
				const mid = (lo + hi) / 2;
				if (off(mid) < 0) lo = mid;
				else hi = mid;
			}
			return (lo + hi) / 2;
		}
		a = b;
		fa = fb;
	}
	return fromMs;
}

export interface SunTimes {
	rise: number | null; // ms (UTC instant); null when the sun doesn't rise/set that day
	noon: number;
	set: number | null;
	polar: 'day' | 'night' | null;
}

// Sunrise, solar noon and sunset for the calendar date y-m-d (month 0-11) at lat/lon (degrees, east positive).
export function sunTimes(y: number, m: number, day: number, lat: number, lon: number): SunTimes {
	const n = jdOf(Date.UTC(y, m, day, 12)) - 2451545.0;
	const Jstar = n - lon / 360;
	const M = wrap360(357.5291 + 0.98560028 * Jstar);
	const C = 1.9148 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 0.0003 * Math.sin(3 * M * RAD);
	const lam = wrap360(M + C + 180 + 102.9372);
	const Jt = 2451545.0 + Jstar + 0.0053 * Math.sin(M * RAD) - 0.0069 * Math.sin(2 * lam * RAD);
	const sinDec = Math.sin(lam * RAD) * Math.sin(23.4397 * RAD);
	const dec = Math.asin(sinDec);
	const cosW = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * sinDec) / (Math.cos(lat * RAD) * Math.cos(dec));
	const toMs = (jd: number) => (jd - 2440587.5) * 86400000;
	if (cosW > 1) return { rise: null, noon: toMs(Jt), set: null, polar: 'night' };
	if (cosW < -1) return { rise: null, noon: toMs(Jt), set: null, polar: 'day' };
	const w0 = Math.acos(cosW) / RAD / 360;
	return { rise: toMs(Jt - w0), noon: toMs(Jt), set: toMs(Jt + w0), polar: null };
}
