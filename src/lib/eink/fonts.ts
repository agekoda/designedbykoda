// Fonts the calendar can draw with.
//
// The glyph data itself lives in the firmware (fonts.h in the Arduino sketch),
// because that's what actually draws the text. This file is the server's
// list of what the firmware has, so a layout can ask for "the bold heading
// font" and get the right number on the wire.
//
// A font id is  family index * 8 + role index.
//   - FAMILIES: keep the ORDER identical to FONT_FAMILIES in fonts.h.
//   - ROLES:    the five sizes every family provides.
//
// A device whose firmware doesn't have a family yet draws that role in the
// default family (sans) instead, so asking for a font a device lacks never
// breaks anything, it just looks like the default.
export const ROLES = ['s', 'sb', 'm', 'mb', 'bb'] as const;
export type Role = (typeof ROLES)[number];

// What each role is used for:
//   s   body text, regular      (9pt)
//   sb  body text, bold         (9pt)
//   m   medium text, regular    (12pt)
//   mb  headings, bold          (12pt)
//   bb  big numbers, bold       (24pt)
export const FAMILIES = ['sans', 'atkinson', 'inter', 'lora', 'jbmono', 'spacemono'] as const;
export type Family = (typeof FAMILIES)[number];

export const DEFAULT_FAMILY: Family = 'sans';

export function isFamily(v: unknown): v is Family {
	return typeof v === 'string' && (FAMILIES as readonly string[]).includes(v);
}

export function fontId(family: string, role: Role): number {
	const fi = Math.max(0, (FAMILIES as readonly string[]).indexOf(family));
	return fi * 8 + ROLES.indexOf(role);
}

// Names shown in the dashboard's font picker.
export const FAMILY_LABELS: Record<Family, string> = {
	sans: 'Classic',
	atkinson: 'Atkinson',
	inter: 'Inter',
	lora: 'Lora',
	jbmono: 'JetBrains Mono',
	spacemono: 'Space Mono',
};
