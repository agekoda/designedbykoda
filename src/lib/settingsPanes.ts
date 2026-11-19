// The parts of a calendar's Settings page that save straight away (no Save button): its Google
// calendars, school timetables and other calendar links, class names, weather, away dates and
// quiet hours, and the device itself (name, firmware update, unpair). Used by
// src/pages/dashboard/settings.astro; styles in that page.
import { ask } from './dialog';
import { createCitySearch } from './citySearch';

export const esc = (v: string) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export async function post(url: string, body: unknown): Promise<{ ok: boolean; error?: string; data: any }> {
	try {
		const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
		const data = await res.json().catch(() => ({}));
		return { ok: res.ok && !!data.ok, error: data.error as string | undefined, data };
	} catch {
		return { ok: false, error: undefined, data: {} };
	}
}

export type Toast = (msg: string, bad?: boolean) => void;

// Subject names to pick from when naming classes (WA senior school, plus general ones). Any name can be typed too.
const SUBJECTS = ['English', 'Literature', 'English as an Additional Language', 'Mathematics', 'Mathematics Methods', 'Mathematics Applications', 'Mathematics Specialist', 'Mathematics Essential', 'Science', 'Physics', 'Chemistry', 'Biology', 'Human Biology', 'Psychology', 'Earth and Environmental Science', 'Integrated Science', 'Marine and Maritime Studies', 'HASS', 'Geography', 'Modern History', 'Ancient History', 'Economics', 'Accounting and Finance', 'Business Management and Enterprise', 'Politics and Law', 'Philosophy and Ethics', 'Religion and Life', 'Career and Enterprise', 'Building & Construction', 'Engineering Studies', 'Design', 'Materials Design and Technology', 'Computer Science', 'Applied Information Technology', 'Digital Technologies', 'Automotive Engineering and Technology', 'Food Science and Technology', 'Hospitality', 'Children, Family and the Community', 'Health and PE', 'Physical Education Studies', 'PE', 'Health Studies', 'Outdoor Education', 'Sport and Recreation', 'Visual Arts', 'Drama', 'Music', 'Dance', 'Media Production and Analysis', 'Japanese', 'French', 'Italian', 'Chinese', 'Indonesian', 'German', 'Spanish', 'Workplace Learning', 'Tutor group', 'Form', 'Assembly', 'Study period'];

// A name box with suggestions, in the same style as the city search (CitySearchStyles.astro).
// Any text is allowed; the list just helps. The list is fixed-position so a scrolling box can't clip it.
export function subjectBox(value: string, placeholder: string): HTMLElement {
	const wrap = document.createElement('div');
	wrap.className = 'citysearch subj';
	wrap.innerHTML = `<input type="text" class="cs-input" role="combobox" aria-expanded="false" aria-autocomplete="list" autocomplete="off" spellcheck="false" maxlength="40" aria-label="Name on the screen" /><ul class="cs-list" role="listbox" hidden></ul>`;
	const input = wrap.querySelector('.cs-input') as HTMLInputElement;
	const list = wrap.querySelector('.cs-list') as HTMLUListElement;
	input.value = value;
	input.placeholder = placeholder;
	let items: string[] = [];
	let active = -1;
	const close = () => {
		list.hidden = true;
		input.setAttribute('aria-expanded', 'false');
		active = -1;
	};
	const open = () => {
		const q = input.value.trim().toLowerCase();
		items = q ? SUBJECTS.filter((s) => s.toLowerCase().startsWith(q)).concat(SUBJECTS.filter((s) => !s.toLowerCase().startsWith(q) && s.toLowerCase().includes(q))) : SUBJECTS.slice();
		items = items.filter((s) => s !== input.value.trim()).slice(0, 40);
		if (!items.length) return close();
		list.innerHTML = items.map((s, i) => `<li role="option" data-i="${i}" class="${i === active ? 'on' : ''}">${esc(s)}</li>`).join('');
		const r = input.getBoundingClientRect();
		Object.assign(list.style, { position: 'fixed', left: r.left + 'px', width: Math.max(r.width, 220) + 'px', top: r.bottom + 6 + 'px', right: 'auto', maxHeight: Math.max(140, Math.min(280, innerHeight - r.bottom - 16)) + 'px', zIndex: '1000' });
		list.hidden = false;
		input.setAttribute('aria-expanded', 'true');
		const onScroll = (ev: Event) => {
			if (list.contains(ev.target as Node)) return addEventListener('scroll', onScroll, { capture: true, once: true });
			close();
		};
		addEventListener('scroll', onScroll, { capture: true, once: true });
	};
	const pick = (s: string) => {
		input.value = s;
		close();
		input.dispatchEvent(new Event('input', { bubbles: true }));
		close();
	};
	input.addEventListener('focus', open);
	input.addEventListener('input', (e) => {
		if (!(e as InputEvent).inputType && list.hidden) return; // our own event from pick()
		active = -1;
		open();
	});
	input.addEventListener('keydown', (ev) => {
		if (list.hidden || !items.length) return;
		if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
			ev.preventDefault();
			active = (active + (ev.key === 'ArrowDown' ? 1 : items.length - 1) + (active < 0 && ev.key === 'ArrowUp' ? 1 : 0)) % items.length;
			open();
			list.querySelector('li.on')?.scrollIntoView({ block: 'nearest' });
		} else if (ev.key === 'Enter' && active >= 0) {
			ev.preventDefault();
			ev.stopPropagation();
			pick(items[active]);
		} else if (ev.key === 'Escape') {
			ev.stopPropagation();
			close();
		}
	});
	list.addEventListener('mousedown', (ev) => {
		ev.preventDefault();
		const li = (ev.target as HTMLElement).closest('li[data-i]') as HTMLElement | null;
		if (li) pick(items[+li.dataset.i!]);
	});
	input.addEventListener('blur', close);
	return wrap;
}

// ---------------------------------------------------------------- Google calendars
export function mountCalendars(box: HTMLElement, d: any, all: any[] | null, toast: Toast) {
	if (!all) {
		box.innerHTML = '<p class="muted small">Couldn’t load your Google calendars right now. Try again in a moment.</p>';
		return;
	}
	const sel: string[] = d.calendarIds?.length ? d.calendarIds : all.filter((c) => c.primary).map((c) => c.id);
	box.innerHTML = `<div class="sp-list">${all
		.map((c) => `<label class="sp-row sp-check"><input type="checkbox" value="${esc(c.id)}" ${sel.includes(c.id) ? 'checked' : ''} /><span class="sp-box" aria-hidden="true"></span><span class="sp-t">${esc(c.summary)}${c.primary ? ' <span class="sp-tag">Primary</span>' : ''}</span></label>`)
		.join('')}</div>`;
	let timer: any;
	box.addEventListener('change', (e) => {
		const cb = e.target as HTMLInputElement;
		const ids = Array.from(box.querySelectorAll<HTMLInputElement>('input:checked')).map((x) => x.value);
		if (!ids.length) {
			cb.checked = true;
			return toast('Keep at least one calendar selected.', true);
		}
		clearTimeout(timer);
		timer = setTimeout(async () => {
			const r = await post('/api/dashboard/devices', { deviceId: d.id, calendarIds: ids });
			if (r.ok) {
				d.calendarIds = ids;
				toast('Saved');
			} else toast(r.error || 'Could not save.', true);
		}, 500);
	});
}

// ---------------------------------------------------------------- timetables and other calendar links
export function mountFeeds(box: HTMLElement, d: any, toast: Toast, hooks: { onAdded: () => void; onNames: () => void; onChange?: (feeds: any[]) => void }) {
	box.innerHTML = `<div class="sp-list" data-feeds></div><button type="button" class="btn ghost small sp-add" data-add>+ Add a school timetable or calendar</button><p class="muted small sp-hint">Works with Compass, SEQTA (as a file), Outlook, iCloud and any iCal link.</p>`;
	const listEl = box.querySelector('[data-feeds]') as HTMLElement;
	const addBtn = box.querySelector('[data-add]') as HTMLButtonElement;
	let feeds: any[] = [];
	let max = 4;
	const line = (f: any) => {
		if (f.error) return `<span class="sp-err">${esc(f.error)}</span>`;
		if (!f.count) return f.kind === 'file' ? 'Nothing coming up in this file. Upload a new one.' : 'Nothing coming up';
		const n = f.next;
		const when = n ? (n.allDay ? new Date(n.ms).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : new Date(n.ms).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })) : '';
		return `${f.count} coming up${n ? ` · next: ${esc(n.title)}, ${esc(when)}` : ''}`;
	};
	const draw = () => {
		listEl.innerHTML = feeds
			.map(
				(f) => `<div class="sp-row sp-item" data-id="${esc(f.id)}"><span class="sp-ico" aria-hidden="true">${f.kind === 'file' ? '▤' : '↻'}</span><span class="sp-t"><b>${esc(f.name)}</b><span class="sp-sub">${f.kind === 'file' ? 'File' : esc(f.host || 'Link')} · ${line(f)}</span><span class="sp-acts"><button type="button" class="sp-pill" data-names>Name classes</button>${f.kind === 'link' ? '<button type="button" class="sp-pill" data-refresh>Refresh</button>' : ''}</span></span><button type="button" class="sp-x" data-del aria-label="Remove ${esc(f.name)}">&times;</button></div>`
			)
			.join('');
		addBtn.hidden = feeds.length >= max;
		hooks.onChange?.(feeds);
	};
	fetch('/api/dashboard/feeds?deviceId=' + encodeURIComponent(d.id))
		.then((r) => r.json())
		.then((j) => {
			feeds = Array.isArray(j.feeds) ? j.feeds : [];
			max = j.max || 4;
			draw();
		})
		.catch(() => {});
	listEl.addEventListener('click', async (e) => {
		const t = e.target as HTMLElement;
		const row = t.closest<HTMLElement>('.sp-item');
		if (!row) return;
		const f = feeds.find((x) => x.id === row.dataset.id);
		if (!f) return;
		if (t.closest('[data-names]')) return hooks.onNames();
		if (t.closest('[data-refresh]')) {
			toast('Reading it again…');
			const r = await post('/api/dashboard/feeds', { deviceId: d.id, action: 'refresh', id: f.id });
			if (r.ok && r.data.feed) {
				Object.assign(f, r.data.feed);
				draw();
				toast(f.error ? f.error : 'Up to date. Press the button on the calendar to see it now.', !!f.error);
			} else toast(r.error || 'Could not refresh it.', true);
			return;
		}
		if (t.closest('[data-del]')) {
			if (!(await ask(`${f.name} will stop showing on this calendar.`, { title: 'Remove this calendar?', ok: 'Remove', danger: true }))) return;
			const r = await post('/api/dashboard/feeds', { deviceId: d.id, action: 'remove', id: f.id });
			if (r.ok) {
				feeds = feeds.filter((x) => x.id !== f.id);
				draw();
				toast('Removed');
			} else toast(r.error || 'Could not remove it.', true);
		}
	});
	addBtn.addEventListener('click', async () => {
		const body = document.createElement('div');
		body.className = 'feed-dlg';
		body.innerHTML = `
			<div class="fd-tabs" role="tablist">
				<button type="button" class="fd-tab on" data-k="compass">Compass</button>
				<button type="button" class="fd-tab" data-k="seqta">SEQTA</button>
				<button type="button" class="fd-tab" data-k="other">Another calendar</button>
			</div>
			<div class="fd-how" data-how="compass"><ol>
				<li>Sign in to Compass in a web browser.</li>
				<li>Open the menu (the gear or your profile, top right) and choose <b>Sync My Schedule</b>.</li>
				<li>If it asks, click to turn on private schedule access.</li>
				<li>Copy the calendar link at the bottom of that page and paste it below.</li>
			</ol></div>
			<div class="fd-how" data-how="seqta" hidden>
				<p>SEQTA doesn't give out a calendar link, so use a timetable file instead.</p>
				<ol>
					<li>Export your timetable as an <b>.ics</b> file. The free DesQTA app can: open Timetable, then Export, then Export as ICS.</li>
					<li>Choose that file below.</li>
				</ol>
				<p class="fd-fine">A file doesn't update itself, so add a new one when your timetable changes (each term, say). If your school's SEQTA does show a calendar link, use Another calendar.</p>
			</div>
			<div class="fd-how" data-how="other" hidden>
				<p>Paste any calendar link (iCal, .ics or webcal://): Outlook, iCloud, a sports club, your school's events. Or choose an .ics file.</p>
			</div>
			<label class="fd-field"><span>Name</span><input class="x-dlg-field" data-name maxlength="30" placeholder="Compass" autocomplete="off" /></label>
			<label class="fd-field" data-linkrow><span>Calendar link</span><input class="x-dlg-field" data-url placeholder="https://…" autocomplete="off" spellcheck="false" /></label>
			<label class="fd-field" data-filerow hidden><span>Timetable file</span><input type="file" data-file accept=".ics,text/calendar" /></label>
			<p class="fd-fine">The link is private to you. It's only used to read your timetable for this calendar.</p>`;
		let kind = 'compass';
		const $b = <T extends HTMLElement>(s: string) => body.querySelector(s) as T;
		const setKind = (k: string) => {
			kind = k;
			body.querySelectorAll<HTMLElement>('.fd-tab').forEach((t) => t.classList.toggle('on', t.dataset.k === k));
			body.querySelectorAll<HTMLElement>('.fd-how').forEach((h) => (h.hidden = h.dataset.how !== k));
			$b<HTMLElement>('[data-linkrow]').hidden = k === 'seqta';
			$b<HTMLElement>('[data-filerow]').hidden = k === 'compass';
			$b<HTMLInputElement>('[data-name]').placeholder = k === 'compass' ? 'Compass' : k === 'seqta' ? 'SEQTA timetable' : 'Calendar';
		};
		body.querySelectorAll<HTMLElement>('.fd-tab').forEach((t) => t.addEventListener('click', () => setKind(t.dataset.k!)));
		setKind('compass');
		if (!(await ask('Shows your classes and school events on this calendar, with your Google ones.', { title: 'Add a timetable or calendar', ok: 'Add it', body }))) return;
		const name = $b<HTMLInputElement>('[data-name]').value.trim() || $b<HTMLInputElement>('[data-name]').placeholder;
		const url = $b<HTMLInputElement>('[data-url]').value.trim();
		const file = $b<HTMLInputElement>('[data-file]').files?.[0] ?? null;
		let req: any;
		if (file && (kind === 'seqta' || !url)) {
			if (file.size > 4_000_000) return toast('That file is too big.', true);
			req = { deviceId: d.id, action: 'file', name, ics: await file.text() };
		} else if (url && kind !== 'seqta') req = { deviceId: d.id, action: 'link', name, url };
		else return toast(kind === 'seqta' ? 'Choose your timetable file first.' : 'Paste the calendar link first.', true);
		toast('Adding…');
		const r = await post('/api/dashboard/feeds', req);
		if (!r.ok) return toast(r.error || 'Could not add it.', true);
		feeds.push(r.data.feed);
		draw();
		toast('Added. It shows on the screen at the next update, or press the button.');
		hooks.onAdded();
	});
}

// ---------------------------------------------------------------- class names
async function loadClasses(d: any) {
	const j = await (await fetch('/api/dashboard/classes?deviceId=' + encodeURIComponent(d.id))).json();
	return { list: (Array.isArray(j.classes) ? j.classes : []) as any[], opts: j.opts ?? { rooms: true, moves: true } };
}
function classTable(list: any[], opts: any): { el: HTMLElement; read: () => { classes: any[]; opts: any } } {
	const el = document.createElement('div');
	el.className = 'cls-dlg';
	el.innerHTML = `
		<div class="cls-head"><span>Code</span><span>Name on the screen</span><span>Bring</span></div>
		<div class="cls-list">${list
			.map(
				(c) => `<div class="cls-row" data-code="${esc(c.code)}">
					<div class="cls-code"><b>${esc(c.code)}</b><span>${c.room ? esc(c.room) + ' · ' : ''}${c.count ? c.count + '×' : 'not on now'}</span></div>
					<div data-nslot></div>
					<input class="x-dlg-field" data-b maxlength="40" placeholder="Nothing" value="${esc(c.bring)}" autocomplete="off" />
				</div>`
			)
			.join('')}</div>
		<label class="cls-opt"><input type="checkbox" data-rooms ${opts?.rooms !== false ? 'checked' : ''} /> Show the room after the name</label>
		<label class="cls-opt"><input type="checkbox" data-moves ${opts?.moves !== false ? 'checked' : ''} /> Point out room changes</label>`;
	el.querySelectorAll<HTMLElement>('.cls-row').forEach((r, i) => r.querySelector('[data-nslot]')!.replaceWith(subjectBox(list[i].name || '', list[i].code)));
	return {
		el,
		read: () => ({
			classes: [...el.querySelectorAll<HTMLElement>('.cls-row')].map((r) => ({ code: r.dataset.code, name: (r.querySelector('.cs-input') as HTMLInputElement).value.trim(), bring: (r.querySelector('[data-b]') as HTMLInputElement).value.trim() })),
			opts: { rooms: (el.querySelector('[data-rooms]') as HTMLInputElement).checked, moves: (el.querySelector('[data-moves]') as HTMLInputElement).checked },
		}),
	};
}
// Straight after adding a timetable: a pop-up with Skip. Says nothing when there are no classes.
export async function classesPrompt(d: any, toast: Toast, after: () => void) {
	let data;
	try {
		data = await loadClasses(d);
	} catch {
		return;
	}
	if (!data.list.length) return;
	const t = classTable(data.list, data.opts);
	if (!(await ask('Your timetable calls classes by codes. Give them proper names now, or skip and do it later under Class names.', { title: 'Name your classes', ok: 'Save', cancel: 'Skip', body: t.el }))) return;
	const r = await post('/api/dashboard/classes', { deviceId: d.id, ...t.read() });
	toast(r.ok ? 'Saved. Your calendar uses the names from its next update.' : r.error || 'Could not save.', !r.ok);
	after();
}
// The Class names section itself.
export async function mountClasses(box: HTMLElement, d: any, toast: Toast) {
	box.innerHTML = '<p class="muted small">Loading your classes…</p>';
	let data;
	try {
		data = await loadClasses(d);
	} catch {
		box.innerHTML = '<p class="muted small">Couldn’t load your classes right now.</p>';
		return;
	}
	if (!data.list.length) {
		box.innerHTML = '<div class="sp-empty"><b>No classes yet</b><p class="muted small">Add your school timetable under Calendars and timetables. Its classes show up here, ready to name.</p><button type="button" class="btn small" data-go="calendars">Add a timetable</button></div>';
		return;
	}
	const t = classTable(data.list, data.opts);
	box.innerHTML = '';
	box.appendChild(t.el);
	const save = document.createElement('div');
	save.className = 'sp-save';
	save.innerHTML = '<button type="button" class="btn small" data-save>Save class names</button>';
	box.appendChild(save);
	save.querySelector('[data-save]')!.addEventListener('click', async () => {
		const r = await post('/api/dashboard/classes', { deviceId: d.id, ...t.read() });
		toast(r.ok ? 'Saved. Your calendar uses the names from its next update.' : r.error || 'Could not save.', !r.ok);
	});
}

// ---------------------------------------------------------------- weather
export function mountWeather(box: HTMLElement, d: any, toast: Toast) {
	box.innerHTML = '';
	box.appendChild(
		createCitySearch({
			value: d.location?.name || '',
			placeholder: 'Search for a city…',
			onSelect: async (c) => {
				const r = await post('/api/dashboard/devices', { deviceId: d.id, location: c ? { name: c.label, lat: c.lat, lon: c.lon } : null });
				if (r.ok) {
					d.location = c ? { name: c.label } : null;
					toast(c ? 'Saved. Weather appears on the next update.' : 'Weather removed.');
				} else toast(r.error || 'Could not save the location.', true);
			},
		})
	);
	const p = document.createElement('p');
	p.className = 'muted small sp-hint';
	p.textContent = "Today's high and low, the forecast on screens that show it, and sunrise and sunset for Moon & Sun. Leave it empty for no weather.";
	box.appendChild(p);
}

// ---------------------------------------------------------------- away dates and quiet hours
export function mountAway(box: HTMLElement, d: any, toast: Toast, onChange?: (cfg: any) => void) {
	let cfg: any = d.dayCfg ?? { away: null, quiet: { on: false, from: 1320, to: 360 } };
	box.innerHTML = `<div class="sp-list" data-list></div><div class="sp-adds"><button type="button" class="btn ghost small" data-away>+ Add away dates</button><button type="button" class="btn ghost small" data-quiet>+ Add quiet hours</button></div>`;
	const listEl = box.querySelector('[data-list]') as HTMLElement;
	const awayBtn = box.querySelector('[data-away]') as HTMLButtonElement;
	const quietBtn = box.querySelector('[data-quiet]') as HTMLButtonElement;
	const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
	const mOf = (v: string) => {
		const [h, m] = v.split(':').map(Number);
		return (h || 0) * 60 + (m || 0);
	};
	const clock = (m: number) => new Date(2000, 0, 1, Math.floor(m / 60), m % 60).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
	const todayIso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
	const awayOn = () => !!cfg.away && cfg.away.until > todayIso();
	const draw = () => {
		const rows: string[] = [];
		if (awayOn()) {
			const when = new Date(cfg.away.until + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
			rows.push(`<div class="sp-row sp-item" data-k="away"><span class="sp-ico" aria-hidden="true">✈</span><span class="sp-t"><b>Away until ${esc(when)}</b><span class="sp-sub">${cfg.away.note ? esc(cfg.away.note) : 'No note'} · checks in every two days</span><span class="sp-acts"><button type="button" class="sp-pill" data-edit>Edit</button></span></span><button type="button" class="sp-x" data-del aria-label="Remove away dates">&times;</button></div>`);
		}
		if (cfg.quiet?.on) rows.push(`<div class="sp-row sp-item" data-k="quiet"><span class="sp-ico" aria-hidden="true">☾</span><span class="sp-t"><b>Quiet ${esc(clock(cfg.quiet.from))} to ${esc(clock(cfg.quiet.to))}</b><span class="sp-sub">No timed updates. The button still works.</span><span class="sp-acts"><button type="button" class="sp-pill" data-edit>Edit</button></span></span><button type="button" class="sp-x" data-del aria-label="Remove quiet hours">&times;</button></div>`);
		listEl.innerHTML = rows.join('');
		awayBtn.hidden = awayOn();
		quietBtn.hidden = !!cfg.quiet?.on;
		onChange?.(cfg);
	};
	const save = async (next: any, msg: string) => {
		const r = await post('/api/dashboard/daycfg', { deviceId: d.id, cfg: next });
		if (!r.ok) return toast(r.error || 'Could not save.', true);
		cfg = next;
		d.dayCfg = next;
		draw();
		toast(msg);
	};
	const field = (label: string, input: string) => `<label class="dc-f"><span>${label}</span>${input}</label>`;
	async function editAway() {
		const body = document.createElement('div');
		body.className = 'dc-dlg';
		const cur = awayOn() ? cfg.away : { until: '', note: '' };
		body.innerHTML = field('Back on', `<input type="date" class="x-dlg-field" data-until min="${todayIso()}" value="${esc(cur.until)}" />`) + field('Note on the screen (optional)', `<input class="x-dlg-field" data-awaynote maxlength="60" placeholder="Camping at Margaret River" value="${esc(cur.note || '')}" autocomplete="off" />`);
		if (!(await ask('The screen says "Away until…" and the calendar only checks in every two days, which saves battery. It goes back to normal on the day you choose.', { title: 'Away dates', ok: 'Save', body }))) return;
		const until = (body.querySelector('[data-until]') as HTMLInputElement).value;
		if (!until || until <= todayIso()) return toast('Pick the day you’re back.', true);
		save({ ...cfg, away: { until, note: (body.querySelector('[data-awaynote]') as HTMLInputElement).value.trim() } }, 'Away dates saved. The screen changes at its next update, or press the button.');
	}
	async function editQuiet() {
		const body = document.createElement('div');
		body.className = 'dc-dlg';
		const q = cfg.quiet ?? { from: 1320, to: 360 };
		body.innerHTML = `<div class="dc-two">${field('From', `<input type="time" class="x-dlg-field" data-from value="${hm(q.from)}" />`)}${field('To', `<input type="time" class="x-dlg-field" data-to value="${hm(q.to)}" />`)}</div>`;
		if (!(await ask('No timed updates between these times, every day. Pressing the button still updates the screen.', { title: 'Quiet hours', ok: 'Save', body }))) return;
		const from = mOf((body.querySelector('[data-from]') as HTMLInputElement).value);
		const to = mOf((body.querySelector('[data-to]') as HTMLInputElement).value);
		if (from === to) return toast('Pick two different times.', true);
		save({ ...cfg, quiet: { on: true, from, to } }, 'Quiet hours saved.');
	}
	awayBtn.addEventListener('click', editAway);
	quietBtn.addEventListener('click', editQuiet);
	listEl.addEventListener('click', (e) => {
		const t = e.target as HTMLElement;
		const k = t.closest<HTMLElement>('.sp-item')?.dataset.k;
		if (!k) return;
		if (t.closest('[data-edit]')) return k === 'away' ? editAway() : editQuiet();
		if (t.closest('[data-del]')) {
			if (k === 'away') save({ ...cfg, away: null }, 'Away dates removed. Press the button to update the screen now.');
			else save({ ...cfg, quiet: { ...cfg.quiet, on: false } }, 'Quiet hours removed.');
		}
	});
	draw();
}

// ---------------------------------------------------------------- the device itself
export function mountDevice(box: HTMLElement, d: any, toast: Toast, onRename: (name: string) => void) {
	const u = d.update;
	box.innerHTML = `
		<label class="sp-field"><span>Name</span><input class="txt" data-name maxlength="40" value="${esc(d.name || '')}" placeholder="E-Ink Calendar" autocomplete="off" /></label>
		<div class="sp-list" style="margin-top:1.4em">
			<div class="sp-row sp-item"><span class="sp-ico" aria-hidden="true">⟳</span><span class="sp-t"><b>Firmware ${esc(d.firmware || 'unknown')}</b><span class="sp-sub">${u ? (u.asked ? 'Update waiting: press the button on the calendar' : `Version ${esc(u.version)} is ready`) : 'Up to date. Updates install over Wi-Fi when you say so.'}</span>${u && !u.asked ? '<span class="sp-acts"><button type="button" class="sp-pill" data-update>Update now</button></span>' : ''}</span></div>
			<div class="sp-row sp-item"><span class="sp-ico" aria-hidden="true">✓</span><span class="sp-t"><b>Paired${d.createdAt ? ' ' + esc(new Date(d.createdAt * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })) : ''}</b><span class="sp-sub">${d.lastSeenAt ? 'Last checked in ' + esc(new Date(d.lastSeenAt * 1000).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })) : 'Hasn’t checked in yet'}</span></span></div>
		</div>
		<div class="sp-danger"><b>Unpair this calendar</b><p class="muted small">It goes back to showing a pairing code. Its settings here are removed.</p><button type="button" class="btn small ghost sp-danger-btn" data-unpair>Unpair</button></div>`;
	const name = box.querySelector('[data-name]') as HTMLInputElement;
	let last = d.name || '';
	name.addEventListener('change', async () => {
		const v = name.value.trim();
		if (v === last) return;
		const r = await post('/api/dashboard/devices', { deviceId: d.id, name: v });
		if (r.ok) {
			last = v;
			onRename(v);
			toast('Saved');
		} else toast(r.error || 'Could not save the name.', true);
	});
	name.addEventListener('keydown', (e) => e.key === 'Enter' && name.blur());
	box.querySelector('[data-update]')?.addEventListener('click', async () => {
		const body = document.createElement('div');
		body.className = 'update-note';
		body.innerHTML = (u.notes ? `<p><strong>What's new:</strong> ${esc(u.notes)}</p>` : '') + `<p class="muted small">It needs at least a quarter of its battery. If anything goes wrong, it goes back to ${esc(d.firmware || 'the old version')} by itself.</p>`;
		if (!(await ask('After you click Update now, press the button on the calendar. It shows a progress bar, then restarts by itself. This takes about a minute.', { title: `Update to ${u.version}`, ok: 'Update now', body }))) return;
		const r = await post('/api/dashboard/devices/update-now', { id: d.id });
		if (!r.ok) return toast(r.error || 'Could not start the update.', true);
		u.asked = true;
		mountDevice(box, d, toast, onRename);
		toast('Now press the button on the calendar.');
	});
	box.querySelector('[data-unpair]')!.addEventListener('click', async () => {
		if (!(await ask('It goes back to showing a pairing code the next time it updates (press its button to do it now). Use Add a device on your dashboard to pair it again.', { title: 'Unpair this calendar?', ok: 'Unpair', danger: true }))) return;
		const r = await post('/api/dashboard/devices/unpair', { deviceId: d.id });
		if (r.ok) location.href = '/dashboard';
		else toast(r.error || 'Could not unpair.', true);
	});
}
