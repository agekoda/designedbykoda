// A short paragraph, centred and wrapped to fit in any font, from baseline y. Translated first,
// so a Japanese screen gets the whole sentence. Returns the baseline after it.
import type { Draw } from '../draw';
import type { Family, Role } from '../fonts';
import { wrapText } from '../measure';
import { tr } from '../i18n';

export function centred(d: Draw, fam: Family, y: number, role: Role, text: string, maxW = 360, lh = 18): number {
	const t = tr(text);
	for (const ln of t !== text ? [t] : wrapText(fam, role, text, maxW)) {
		d.text(200, y, role, ln, { align: 'center', maxW: 384 });
		y += lh;
	}
	return y;
}
