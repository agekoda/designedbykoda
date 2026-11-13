// Shared pieces: safe HTML building, talking to the app's server, formatting, dialogs, toasts.
'use strict';
const App = { views: {}, actions: {}, data: null, local: null, fw: null, ui: {} };
App.prefs = {
	get(k, d) { try { const v = localStorage.getItem('koda.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
	set(k, v) { try { localStorage.setItem('koda.' + k, JSON.stringify(v)); } catch {} },
};
const TOKEN = document.querySelector('meta[name=app-token]').content;

// ---------------------------------------------------------------- safe HTML
// html`...` escapes every value put into it, so nothing from an order or a calendar can become markup.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const raw = (s) => ({ __raw: String(s) });
const part = (v) => (v === null || v === undefined || v === false || v === true ? '' : Array.isArray(v) ? v.map(part).join('') : v.__raw !== undefined ? v.__raw : esc(v));
const html = (strings, ...vals) => raw(strings.reduce((out, s, i) => out + s + (i < vals.length ? part(vals[i]) : ''), ''));
const mount = (el, tpl) => {
	if (el) el.innerHTML = part(tpl);
};
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------------------------------------------------------------- server
async function call(path, opts = {}) {
	const init = { method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'), headers: { 'X-App-Token': TOKEN } };
	if (opts.body !== undefined) {
		init.body = opts.rawBody ? opts.body : JSON.stringify(opts.body);
		if (!opts.rawBody) init.headers['Content-Type'] = 'application/json';
	}
	let res;
	try {
		res = await fetch(path, init);
	} catch {
		throw new Error("The app's helper isn't answering. Close this window and open the app again.");
	}
	const j = await res.json().catch(() => ({}));
	if (res.status === 401 && !opts.quiet401) App.signedOut();
	if (!res.ok || j.ok === false) {
		const e = new Error(j.error || `Something went wrong (${res.status}).`);
		e.status = res.status;
		throw e;
	}
	return j;
}
const site = (path, body) => call('/api/site?path=' + encodeURIComponent(path), body === undefined ? {} : { body });
const openLink = (url) => call('/api/open', { body: { url } }).catch((e) => toast(e.message, 'bad'));

// ---------------------------------------------------------------- formatting
const nowSec = () => Math.floor(Date.now() / 1000);
function money(cents, cur = 'AUD') {
	try {
		return new Intl.NumberFormat('en-AU', { style: 'currency', currency: cur }).format(cents / 100);
	} catch {
		return `${(cents / 100).toFixed(2)} ${cur}`;
	}
}
const audOf = (o) => o.total / 100 / ((App.data?.fx || {})[o.currency] || 1);
const aud0 = (n) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n);
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const country = (c) => {
	try {
		return (c && regionNames.of(c)) || c || 'Unknown';
	} catch {
		return c || 'Unknown';
	}
};
const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + 's'}`;
function ago(t) {
	if (!t) return 'never';
	const s = nowSec() - t;
	if (s < 0) return until(t);
	if (s < 90) return 'just now';
	const m = Math.round(s / 60);
	if (m < 60) return `${m} min ago`;
	const h = Math.round(m / 60);
	if (h < 36) return `${h} h ago`;
	return `${Math.round(h / 24)} days ago`;
}
function until(t) {
	const s = t - nowSec();
	if (s <= 60) return 'now';
	const m = Math.round(s / 60);
	if (m < 60) return `in ${m} min`;
	const h = Math.round(m / 60);
	if (h < 36) return `in ${h} h`;
	return `in ${Math.round(h / 24)} days`;
}
const dayFmt = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short' });
const dateFmt = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const day = (t) => (t ? dayFmt.format(new Date(t * 1000)) : '');
const date = (t) => (t ? dateFmt.format(new Date(t * 1000)) : '');
const dateTime = (t) => (t ? timeFmt.format(new Date(t * 1000)) : '');
const cmpVer = (a, b) => {
	const x = String(a || '0').split('.').map(Number), y = String(b || '0').split('.').map(Number);
	for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
	return 0;
};
const mb = (bytes) => (bytes / 1024 / 1024).toFixed(2) + ' MB';

// ---------------------------------------------------------------- orders and calendars: shared meaning
const STATUS = {
	ordered: { label: 'Ordered', color: '#3987e5' },
	making: { label: 'Being made', color: '#d95926' },
	ready: { label: 'Ready to ship', color: '#9085e9' },
	shipped: { label: 'Shipped', color: '#c98500' },
	delivered: { label: 'Delivered', color: '#199e70' },
	cancelled: { label: 'Cancelled', color: '#6b6b6b' },
};
const STATUS_KEYS = Object.keys(STATUS);
const pill = (st) => html`<span class="pill"><i style="background:${STATUS[st]?.color || '#666'}"></i>${STATUS[st]?.label || st}</span>`;
const liveOrders = () => (App.data?.orders || []).filter((o) => o.status !== 'cancelled');

// on time / late / offline, from when it was last seen and when it was due to wake
function deviceState(d) {
	if (!d.lastSeenAt) return 'never';
	const late = App.data.now - Math.max(d.lastSeenAt, d.nextWakeAt || 0);
	return late > 48 * 3600 ? 'offline' : late > 6 * 3600 ? 'late' : 'ok';
}
const DEVICE_STATE = {
	ok: { label: 'On time', tone: 'good' },
	late: { label: 'Late', tone: 'warn' },
	offline: { label: 'Offline', tone: 'bad' },
	never: { label: 'Never checked in', tone: 'dim' },
};
const targetFw = (d) => App.data?.firmware?.channels?.[d.channel]?.version || null;
const fwBehind = (d) => !!d.firmware && !!targetFw(d) && cmpVer(d.firmware, targetFw(d)) < 0;
const tone = (t, label) => html`<span class="tone ${t}"><i></i>${label}</span>`;

// ---------------------------------------------------------------- icons (drawn here, no downloads)
const ICONS = {
	overview: '<path d="M3 13h7V3H3zM14 21h7V11h-7zM3 21h7v-4H3zM14 3v4h7V3z"/>',
	orders: '<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
	devices: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M7 9h4M7 13h10M9 21h6"/>',
	firmware: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
	status: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
	stats: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
	settings: '<path d="M4 6h9M19 6h1M4 12h3M13 12h7M4 18h11M20 18h0"/><circle cx="16" cy="6" r="2.200"/><circle cx="10" cy="12" r="2.200"/><circle cx="17.500" cy="18" r="2.200"/>',
	refresh: '<path d="M20 11a8 8 0 1 0-2.300 6.300M20 4v7h-7"/>',
	search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.500-4.500"/>',
	close: '<path d="M6 6l12 12M18 6L6 18"/>',
	copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
	out: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
	check: '<path d="M5 12l5 5 9-10"/>',
	plus: '<path d="M12 5v14M5 12h14"/>',
	truck: '<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
	down: '<path d="M12 4v12M6 11l6 6 6-6M5 20h14"/>',
	board: '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="13" rx="1"/>',
	list: '<path d="M4 6h16M4 12h16M4 18h16"/>',
	alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
	mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
	chevron: '<path d="M9 6l6 6-6 6"/>',
	dots: '<circle cx="5" cy="12" r="1.200"/><circle cx="12" cy="12" r="1.200"/><circle cx="19" cy="12" r="1.200"/>',
	bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
	folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
};
const icon = (name, size = 18) => raw(`<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.700" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`);

// ---------------------------------------------------------------- toasts
function toast(msg, kind = '', action) {
	const el = document.createElement('div');
	el.className = 'toast ' + kind;
	mount(el, html`<span>${msg}</span>${action ? html`<button class="link" data-toast-act>${action.label}</button>` : ''}`);
	if (action) $('[data-toast-act]', el).onclick = () => { action.run(); el.remove(); };
	$('#toasts').appendChild(el);
	setTimeout(() => el.classList.add('gone'), action ? 9000 : 4200);
	setTimeout(() => el.remove(), action ? 9400 : 4600);
}
async function copyText(text, what = 'Copied') {
	try {
		await navigator.clipboard.writeText(text);
		toast(what, 'good');
	} catch {
		toast("Couldn't copy.", 'bad');
	}
}

// ---------------------------------------------------------------- modal, dialogs, drawer, menu
const Modal = {
	open(tpl, opts = {}) {
		mount($('#modal-root'), html`<div class="scrim" data-act="${opts.sticky ? '' : 'modal-scrim'}"><div class="modal ${opts.wide ? 'wide' : ''}" role="dialog">${tpl}</div></div>`);
		this.onClose = opts.onClose;
		const f = $('#modal-root [autofocus]') || $('#modal-root input, #modal-root textarea, #modal-root button.primary');
		if (f) f.focus();
	},
	update(tpl) {
		mount($('#modal-root .modal'), tpl);
	},
	close() {
		if (!$('#modal-root').firstChild) return;
		mount($('#modal-root'), '');
		const f = this.onClose;
		this.onClose = null;
		if (f) f();
	},
	isOpen: () => !!$('#modal-root').firstChild,
};
App.actions['modal-scrim'] = (el, ev) => { if (ev.target === el) Modal.close(); };
App.actions['modal-close'] = () => Modal.close();

// confirm(...) and ask(...) are the app's own dialogs (no browser pop-ups).
function confirmBox({ title, body, ok = 'OK', danger = false, cancel = 'Cancel' }) {
	return new Promise((resolve) => {
		let done = false;
		const finish = (v) => { if (!done) { done = true; resolve(v); Modal.close(); } };
		Modal.open(html`<h2>${title}</h2>${body ? html`<p class="muted">${body}</p>` : ''}
			<div class="modal-foot"><button class="btn" data-dlg="no">${cancel}</button><button class="btn primary ${danger ? 'danger' : ''}" data-dlg="yes" autofocus>${ok}</button></div>`, { onClose: () => finish(false) });
		$('[data-dlg=yes]').onclick = () => finish(true);
		$('[data-dlg=no]').onclick = () => finish(false);
	});
}
function askBox({ title, body, label, value = '', ok = 'Save', placeholder = '', optional = false }) {
	return new Promise((resolve) => {
		let done = false;
		const finish = (v) => { if (!done) { done = true; resolve(v); Modal.close(); } };
		Modal.open(html`<h2>${title}</h2>${body ? html`<p class="muted">${body}</p>` : ''}
			<label class="field"><span>${label}</span><input id="ask-in" value="${value}" placeholder="${placeholder}" autocomplete="off" spellcheck="false" autofocus></label>
			<div class="modal-foot"><button class="btn" data-dlg="no">Cancel</button><button class="btn primary" data-dlg="yes">${ok}</button></div>`, { onClose: () => finish(null) });
		const go = () => { const v = $('#ask-in').value.trim(); if (v || optional) finish(v); };
		$('[data-dlg=yes]').onclick = go;
		$('[data-dlg=no]').onclick = () => finish(null);
		$('#ask-in').onkeydown = (e) => { if (e.key === 'Enter') go(); };
	});
}

const Drawer = {
	open(tpl, key) {
		this.key = key;
		mount($('#drawer-root'), html`<div class="drawer-scrim" data-act="drawer-close"></div><aside class="drawer">${tpl}</aside>`);
		requestAnimationFrame(() => $('#drawer-root .drawer')?.classList.add('in'));
	},
	close() {
		this.key = null;
		mount($('#drawer-root'), '');
	},
	isOpen: () => !!$('#drawer-root').firstChild,
};
App.actions['drawer-close'] = () => Drawer.close();

// A small pop-up list under a button. items: [{ label, run, dot, danger }]
function menu(anchor, items) {
	const r = anchor.getBoundingClientRect();
	mount($('#menu-root'), html`<div class="menu-scrim"></div><div class="menu" style="left:${Math.min(r.left, innerWidth - 240)}px;top:${r.bottom + 6}px">
		${items.map((it, i) => html`<button class="${it.danger ? 'danger' : ''}" data-i="${i}">${it.dot ? html`<i style="background:${it.dot}"></i>` : ''}${it.label}</button>`)}</div>`);
	const m = $('#menu-root .menu');
	if (m.getBoundingClientRect().bottom > innerHeight - 8) m.style.top = Math.max(8, r.top - m.offsetHeight - 6) + 'px';
	const shut = () => mount($('#menu-root'), '');
	$('#menu-root .menu-scrim').onclick = shut;
	$$('#menu-root .menu button').forEach((b) => (b.onclick = () => { shut(); items[+b.dataset.i].run(); }));
}

// ---------------------------------------------------------------- hover tips for charts
// Any element with data-tip shows it beside the pointer. "|" splits the title from the detail.
const tipEl = $('#tip');
document.addEventListener('mousemove', (e) => {
	const t = e.target.closest?.('[data-tip]');
	if (!t) return (tipEl.hidden = true);
	const [head, ...rest] = t.dataset.tip.split('|');
	mount(tipEl, html`<b>${head}</b>${rest.length ? html`<span>${rest.join(' · ')}</span>` : ''}`);
	tipEl.hidden = false;
	const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
	tipEl.style.left = Math.min(innerWidth - w - 8, Math.max(8, e.clientX + 14)) + 'px';
	tipEl.style.top = (e.clientY + 18 + h > innerHeight ? e.clientY - h - 10 : e.clientY + 18) + 'px';
});
document.addEventListener('mouseleave', () => (tipEl.hidden = true));

// ---------------------------------------------------------------- clicks
// Buttons carry data-act="name"; the handler lives in App.actions (no inline scripts anywhere).
document.addEventListener('click', (e) => {
	const el = e.target.closest('[data-act]');
	if (!el || !el.dataset.act) return;
	const f = App.actions[el.dataset.act];
	if (f) f(el, e);
});
document.addEventListener('input', (e) => {
	const f = e.target.dataset?.input && App.actions[e.target.dataset.input];
	if (f) f(e.target, e);
});
document.addEventListener('change', (e) => {
	const f = e.target.dataset?.change && App.actions[e.target.dataset.change];
	if (f) f(e.target, e);
});
