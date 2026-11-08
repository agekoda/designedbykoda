// Your designs: each calendar can keep several layout-builder designs, each with a name. A design
// is used like any other layout under the id "design:<id>" (calendar_style, schedules, the button).
// Table from schema-designs.sql. Until that's run, every read here returns nothing and the old
// single design (devices.custom_layout, layout id "custom") keeps working.
import { sanitizeLayout, type CustomLayout } from './eink/builder/model';
import { isDesignStyle } from '../data/calendarStyles';

export const MAX_DESIGNS = 20;
export const MAX_NAME = 30;

export interface Design {
	id: string; // without the "design:" prefix
	name: string;
	layout: CustomLayout;
	updatedAt: number;
}

export const designStyle = (id: string) => 'design:' + id;
export const designIdOf = (style: unknown): string | null => (isDesignStyle(style) ? style.slice(7) : null);
export const cleanName = (s: unknown) => String(s ?? '').replace(/[\x00-\x1f\x7f]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) || 'Untitled design';

export async function listDesigns(db: any, deviceId: string): Promise<Design[] | null> {
	try {
		const r = await db.prepare('SELECT id, name, layout, updated_at FROM designs WHERE device_id = ? ORDER BY created_at').bind(deviceId).all();
		return (r.results ?? []).map((d: any) => ({ id: d.id, name: d.name, layout: sanitizeLayout(d.layout), updatedAt: d.updated_at }));
	} catch {
		return null; // schema-designs.sql not run yet
	}
}

export async function getDesign(db: any, deviceId: string, id: string): Promise<Design | null> {
	try {
		const d = await db.prepare('SELECT id, name, layout, updated_at FROM designs WHERE id = ? AND device_id = ?').bind(id, deviceId).first();
		return d ? { id: d.id, name: d.name, layout: sanitizeLayout(d.layout), updatedAt: d.updated_at } : null;
	} catch {
		return null;
	}
}

export function newDesignId(): string {
	const b = crypto.getRandomValues(new Uint8Array(8));
	return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// Does this layout id show the message board (the Message board itself, or a design with a Messages widget)?
export function showsMessages(style: string, designs: { id: string; layout: CustomLayout }[] | null, legacy?: CustomLayout | null): boolean {
	if (style === 'messages') return true;
	const id = designIdOf(style);
	const layout = id ? designs?.find((d) => d.id === id)?.layout : style === 'custom' ? legacy : null;
	return !!layout?.widgets.some((w) => w.t === 'messages');
}
