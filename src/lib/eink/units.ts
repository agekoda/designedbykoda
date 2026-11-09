// Celsius or Fahrenheit. Like the language (i18n.ts), it is a module-level setting that
// renderLayout() switches on for one (synchronous) render, so layouts just call deg().
// Forecasts always arrive in Celsius and km/h; renderLayout() converts them before a
// layout sees them, so layouts never do maths on units.
export type TempUnit = 'c' | 'f';
export const isTempUnit = (v: unknown): v is TempUnit => v === 'c' || v === 'f';

let current: TempUnit = 'c';
export const getUnit = (): TempUnit => current;
export function setUnit(u: TempUnit): void {
	current = u;
}

// The letter drawn after a temperature ("19C" / "66F"). The screen fonts have no degree sign.
export const deg = (): string => (current === 'f' ? '°F' : '°C');

export const cToF = (c: number): number => (c * 9) / 5 + 32;
export const kmhToMph = (k: number): number => Math.round(k * 0.621371);

// "Wind 14 km/h" or "Wind 9 mph"
export const windText = (kmh: number): string => (current === 'f' ? `Wind ${kmhToMph(kmh)} mph` : `Wind ${Math.round(kmh)} km/h`);

// A copy of a forecast in the chosen unit (temperatures to F, wind to mph).
export function convertWeather<T extends { high: number; low: number; wind?: number | null; days?: { high: number; low: number; wind: number | null }[] }>(w: T | null, u: TempUnit): T | null {
	if (!w || u === 'c') return w;
	return {
		...w,
		high: cToF(w.high),
		low: cToF(w.low),
		days: w.days?.map((d) => ({ ...d, high: cToF(d.high), low: cToF(d.low) })),
	};
}
