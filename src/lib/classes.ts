// Class names for school timetables. Compass calls classes by codes ("GEBCN1"), so each code can
// be given a proper name ("Building & Construction") and something to bring ("Safety boots"),
// once, on the dashboard. The room comes from the timetable (LOCATION); when a class is somewhere
// other than its usual room, the screen says so.
//
// Table device_classes, made the first time someone saves names (no migration to run). The row
// with code '*' holds the options.
import type { IcsEvent } from './ics';

export const MAX_CLASS_NAME = 40;
export const MAX_BRING = 40;
export const MAX_CLASSES = 40;

export interface ClassName {
	name: string;
	bring: string;
}
export interface ClassOpts {
	rooms: boolean; // show the room after the name
	moves: boolean; // say when a class isn't in its usual room
}
export const DEFAULT_OPTS: ClassOpts = { rooms: true, moves: true };

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max) : '');
export const cleanCode = (v: unknown) => clean(v, 120);

export async function ensureTable(db: any) {
	await db.prepare('CREATE TABLE IF NOT EXISTS device_classes (device_id TEXT NOT NULL, code TEXT NOT NULL, name TEXT, bring TEXT, PRIMARY KEY (device_id, code))').run();
}

export async function loadClasses(db: any, deviceId: string): Promise<{ names: Map<string, ClassName>; opts: ClassOpts }> {
	const names = new Map<string, ClassName>();
	let opts = { ...DEFAULT_OPTS };
	try {
		const r = await db.prepare('SELECT code, name, bring FROM device_classes WHERE device_id = ?').bind(deviceId).all();
		for (const x of r.results ?? []) {
			if (x.code === '*') {
				try {
					const o = JSON.parse(x.name || '{}');
					opts = { rooms: o.rooms !== false, moves: o.moves !== false };
				} catch {}
			} else names.set(x.code, { name: x.name || '', bring: x.bring || '' });
		}
	} catch {} // nobody has named a class yet
	return { names, opts };
}

export async function saveClasses(db: any, deviceId: string, list: unknown, optsIn: unknown) {
	await ensureTable(db);
	const rows: { code: string; name: string; bring: string }[] = [];
	for (const x of Array.isArray(list) ? list.slice(0, MAX_CLASSES) : []) {
		const code = cleanCode(x?.code);
		if (!code || code === '*') continue;
		const name = clean(x?.name, MAX_CLASS_NAME);
		const bring = clean(x?.bring, MAX_BRING);
		if (name || bring) rows.push({ code, name, bring });
	}
	const o = (optsIn ?? {}) as any;
	const opts: ClassOpts = { rooms: o.rooms !== false, moves: o.moves !== false };
	const stmts = [db.prepare('DELETE FROM device_classes WHERE device_id = ?').bind(deviceId)];
	stmts.push(db.prepare('INSERT INTO device_classes (device_id, code, name, bring) VALUES (?, ?, ?, NULL)').bind(deviceId, '*', JSON.stringify(opts)));
	for (const r of rows) stmts.push(db.prepare('INSERT INTO device_classes (device_id, code, name, bring) VALUES (?, ?, ?, ?)').bind(deviceId, r.code, r.name || null, r.bring || null));
	await db.batch(stmts);
	return { rows, opts };
}

// The classes in a timetable: titles that repeat (one-off events aren't classes), most common first,
// each with its usual room.
export function classCodes(events: IcsEvent[]): { code: string; count: number; room: string }[] {
	const by = new Map<string, { count: number; rooms: Map<string, number> }>();
	for (const e of events) {
		if (e.allDay) continue;
		let c = by.get(e.title);
		if (!c) by.set(e.title, (c = { count: 0, rooms: new Map() }));
		c.count++;
		if (e.location) c.rooms.set(e.location, (c.rooms.get(e.location) ?? 0) + 1);
	}
	const out: { code: string; count: number; room: string }[] = [];
	for (const [code, c] of by) {
		if (c.count < 2) continue;
		out.push({ code, count: c.count, room: usual(c.rooms, c.count) ?? '' });
	}
	return out.sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)).slice(0, MAX_CLASSES);
}

// The room a class is in most of the time (at least 3 times, and over half of them).
function usual(rooms: Map<string, number>, total: number): string | null {
	let best: string | null = null;
	let n = 0;
	for (const [r, k] of rooms) if (k > n) (best = r), (n = k);
	return best && n >= 3 && n * 2 > total ? best : null;
}

export interface NamedEvent extends IcsEvent {
	name?: string; // the class name (or the code), without the room
	room?: string;
	moved?: boolean; // not in its usual room
	bring?: string;
}

// Puts names, rooms and room changes on a timetable's events.
export function applyClasses(events: IcsEvent[], names: Map<string, ClassName>, opts: ClassOpts): NamedEvent[] {
	const rooms = new Map<string, Map<string, number>>();
	const totals = new Map<string, number>();
	for (const e of events) {
		if (e.allDay) continue;
		totals.set(e.title, (totals.get(e.title) ?? 0) + 1);
		if (!e.location) continue;
		let m = rooms.get(e.title);
		if (!m) rooms.set(e.title, (m = new Map()));
		m.set(e.location, (m.get(e.location) ?? 0) + 1);
	}
	return events.map((e) => {
		const n = names.get(e.title);
		const name = n?.name || e.title;
		const isClass = !e.allDay && (totals.get(e.title) ?? 0) >= 2; // rooms only for repeating classes, not a one-off's "Zoom"
		const room = isClass ? e.location || '' : '';
		const home = rooms.get(e.title) ? usual(rooms.get(e.title)!, totals.get(e.title) ?? 0) : null;
		const moved = isClass && opts.moves && !!home && !!room && room !== home;
		let title = name;
		if (room && (opts.rooms || moved)) title += ` · ${room}`;
		if (moved) title += ' (moved)';
		return { ...e, title, name, room: room || undefined, moved: moved || undefined, bring: n?.bring || undefined };
	});
}
