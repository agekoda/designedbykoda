// Normalises text for city search: lower-case, accents stripped, anything
// that isn't a letter or digit becomes a single space. The seed script
// (scripts/build_cities.py) does exactly the same, so keys line up.
export function normalizeKey(s: string): string {
	return s
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}
