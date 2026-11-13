// The frame around the screens: sign-in, the sidebar, loading, refreshing, Ctrl+K.
'use strict';
const NAV = [
	['overview', 'Overview'], ['orders', 'Orders'], ['devices', 'Calendars'], ['firmware', 'Firmware'], ['status', 'Website'], ['parts', 'Parts & stock'], ['money', 'Money'], ['stats', 'Press stats'],
];
const prefs = App.prefs;
App.view = 'overview';
App.loading = false;
App.lastLoad = 0;

App.go = (view, opts) => {
	App.view = view;
	App.viewOpts = opts || null;
	if (App.views[view]?.enter) App.views[view].enter(opts);
	renderShell();
	$('.main')?.scrollTo(0, 0);
};
App.actions.nav = (el) => App.go(el.dataset.view);
App.actions.refresh = () => App.load(true);
App.actions.open = (el) => openLink(el.dataset.url);
App.actions.copy = (el) => copyText(el.dataset.text, el.dataset.what || 'Copied');

function navBadge(id) {
	const d = App.data;
	if (!d) return '';
	if (id === 'orders') {
		const n = d.orders.filter((o) => ['ordered', 'making', 'ready'].includes(o.status)).length;
		return n ? html`<span class="badge" data-tip="Orders still to ship">${n}</span>` : '';
	}
	if (id === 'devices') {
		const n = d.devices.filter((x) => deviceState(x) === 'offline' || (x.batteryPct !== null && x.batteryPct <= 15)).length;
		return n ? html`<span class="badge" data-tip="Calendars offline or low on battery">${n}</span>` : '';
	}
	if (id === 'status') {
		const o = d.status?.overall;
		const c = o === 'operational' ? 'var(--good)' : o === 'major' || o === 'partial' ? 'var(--bad)' : o === 'unknown' || !o ? '#555' : 'var(--warn)';
		return html`<span class="dot" style="background:${c}"></span>`;
	}
	if (id === 'firmware') {
		const ch = d.firmware?.channels;
		return ch && ch.beta?.version && ch.stable?.version && cmpVer(ch.beta.version, ch.stable.version) > 0 ? html`<span class="badge" data-tip="Beta is ahead of everyone">β</span>` : '';
	}
	return '';
}

function renderShell() {
	if (!App.local?.signedIn) return renderSignIn();
	// keep what you were typing and where you were when the screen redraws
	const act = document.activeElement, keepId = act && act.id, sel = keepId && act.selectionStart, scroll = $('.main')?.scrollTop || 0;
	const v = App.views[App.view];
	mount($('#app'), html`<div class="shell">
		<nav class="side">
			<div class="brand"><b>designedbykoda</b><span>Owner</span></div>
			${NAV.map(([id, label]) => html`<button class="nav ${App.view === id ? 'on' : ''}" data-act="nav" data-view="${id}">${icon(id)}${label}${navBadge(id)}</button>`)}
			<div class="side-foot">
				<button class="kbd-hint" data-act="palette">${icon('search', 15)}Search<kbd>Ctrl K</kbd></button>
				<button class="nav ${App.view === 'settings' ? 'on' : ''}" data-act="nav" data-view="settings">${icon('settings')}Settings</button>
				<div class="sync ${App.loading ? 'busy' : ''}"><span>${App.loadError ? 'Not updating' : App.lastLoad ? 'Updated ' + ago(App.lastLoad) : 'Loading…'}</span><button data-act="refresh" data-tip="Refresh now|F5">${icon('refresh', 15)}</button></div>
			</div>
		</nav>
		<main class="main"><div class="page">${App.loadError && !App.data ? html`<div class="note bad">${icon('alert')}<div><b>${App.loadError}</b><br><button class="link" data-act="refresh">Try again</button></div></div>` : !App.data ? html`<div class="empty">Loading…</div>` : v.render()}</div></main>
	</div>`);
	if ($('.main')) $('.main').scrollTop = scroll;
	if (keepId) { const el = document.getElementById(keepId); if (el) { el.focus(); try { el.setSelectionRange(sel, sel); } catch {} } }
	if (v?.after && App.data) v.after();
}
App.render = renderShell;

function renderSignIn(err = '') {
	mount($('#app'), html`<div class="signin"><div class="box">
		<div class="brand" style="padding:0 0 18px"><b>designedbykoda</b><span>Owner</span></div>
		<h1>Sign in</h1>
		<p class="muted" style="margin-top:4px">The same password as the owner page on the site. This PC stays signed in for 30 days.</p>
		<label class="field"><span>Password</span><input id="pw" type="password" autocomplete="current-password" autofocus></label>
		<div class="err" id="pw-err">${err}</div>
		<button class="btn primary" data-act="signin" id="pw-go">Sign in</button>
		<p class="dim" style="margin-top:18px;font-size:13px">Talking to ${App.local?.site || ''}</p>
	</div></div>`);
	$('#pw').focus();
	$('#pw').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); App.actions.signin(); } };
}
App.actions.signin = async () => {
	const pw = $('#pw').value;
	if (!pw) return;
	$('#pw-go').disabled = true;
	$('#pw-go').textContent = 'Signing in…';
	try {
		await call('/api/login', { body: { password: pw }, quiet401: true });
		App.local = await call('/api/state');
		renderShell();
		App.load(true);
	} catch (e) {
		renderSignIn(e.message);
	}
};
App.signedOut = () => {
	if (App.local) App.local.signedIn = false;
	App.data = null;
	Drawer.close();
	renderSignIn('You were signed out. Sign in again.');
};

// Read everything from the site. New orders since the last read get a toast and a soft chime.
App.load = async (loud) => {
	if (App.loading || !App.local?.signedIn) return;
	App.loading = true;
	if (loud) $('.sync')?.classList.add('busy');
	try {
		const d = await site('/api/admin/app/data');
		const before = App.data;
		App.data = d;
		App.lastLoad = nowSec();
		App.loadError = '';
		if (before) {
			const known = new Set(before.orders.map((o) => o.id));
			const fresh = d.orders.filter((o) => !known.has(o.id));
			for (const o of fresh.slice(0, 3)) toast(`New order: ${o.name || 'someone'} in ${country(o.country)}, ${money(o.total, o.currency)}`, 'good', { label: 'Open', run: () => App.views.orders.openOrder(o.id) });
			if (fresh.length) { chime(); App.unseen = (App.unseen || 0) + fresh.length; setTitle(); }
		}
	} catch (e) {
		if (e.status !== 401) { App.loadError = e.message; if (loud) toast(e.message, 'bad'); }
	}
	App.loading = false;
	if (App.local?.signedIn && !Modal.isOpen()) {
		renderShell();
		if (Drawer.isOpen() && Drawer.refresh) Drawer.refresh();
	} else $('.sync')?.classList.remove('busy');
};
function setTitle() {
	document.title = (App.unseen ? `(${App.unseen}) ` : '') + 'designedbykoda admin';
}
window.addEventListener('focus', () => { App.unseen = 0; setTitle(); });
function chime() {
	if (!prefs.get('sound', true)) return;
	try {
		const ac = new AudioContext(), t = ac.currentTime;
		[660, 880].forEach((f, i) => {
			const o = ac.createOscillator(), g = ac.createGain();
			o.frequency.value = f; o.type = 'sine';
			g.gain.setValueAtTime(0, t + i * 0.13); g.gain.linearRampToValueAtTime(0.08, t + i * 0.13 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.13 + 0.5);
			o.connect(g).connect(ac.destination); o.start(t + i * 0.13); o.stop(t + i * 0.13 + 0.55);
		});
	} catch {}
}

// ---------------------------------------------------------------- Ctrl+K
App.actions.palette = () => {
	let items = [], sel = 0;
	const d = App.data;
	const base = [
		...NAV.map(([id, label]) => ({ icon: id, label: 'Go to ' + label, run: () => App.go(id) })),
		{ icon: 'settings', label: 'Go to Settings', run: () => App.go('settings') },
		{ icon: 'truck', label: 'Ship mode: post the orders that are ready', run: () => App.views.orders.shipMode() },
		{ icon: 'down', label: 'Download the AusPost CSV (ready orders)', run: () => App.views.orders.exportCsv('auspost') },
		{ icon: 'down', label: 'Download all orders as a CSV', run: () => App.views.orders.exportCsv('orders') },
		{ icon: 'bolt', label: 'Release a new firmware version', run: () => { App.go('firmware'); App.views.firmware.releaseWizard(); } },
		{ icon: 'alert', label: 'Add a status page incident', run: () => { App.go('status'); App.views.status.editIncident(); } },
		{ icon: 'refresh', label: 'Refresh everything', run: () => App.load(true) },
		{ icon: 'out', label: 'Open designedbykoda.com', run: () => openLink(App.local.site) },
	];
	const find = (q) => {
		q = q.trim().toLowerCase();
		if (!q) return base;
		const has = (...f) => f.some((x) => String(x || '').toLowerCase().includes(q));
		return [
			...base.filter((b) => b.label.toLowerCase().includes(q)),
			...(d?.orders || []).filter((o) => has(o.number, o.name, o.email, o.tracking, o.addr.city)).slice(0, 8).map((o) => ({ icon: 'orders', label: `${o.name || o.email}`, hint: `Order ${o.number} · ${STATUS[o.status].label}`, run: () => App.views.orders.openOrder(o.id) })),
			...(d?.devices || []).filter((x) => has(x.name, x.email, x.id)).slice(0, 6).map((x) => ({ icon: 'devices', label: `${x.name}`, hint: x.email || x.id, run: () => App.views.devices.openDevice(x.id) })),
		];
	};
	const draw = () => mount($('#pal-results'), items.length ? items.map((it, i) => html`<button class="item ${i === sel ? 'sel' : ''}" data-i="${i}">${icon(it.icon, 16)}<span>${it.label}</span>${it.hint ? html`<small>${it.hint}</small>` : ''}</button>`) : html`<div class="empty">Nothing matches.</div>`);
	mount($('#modal-root'), html`<div class="scrim" data-act="modal-scrim"><div class="modal palette"><input id="pal-in" placeholder="Search orders and calendars, or type what you want to do" autocomplete="off" spellcheck="false"><div class="results" id="pal-results"></div></div></div>`);
	const input = $('#pal-in');
	const run = (i) => { const it = items[i]; if (!it) return; Modal.close(); it.run(); };
	items = find('');
	draw();
	input.focus();
	input.oninput = () => { items = find(input.value); sel = 0; draw(); };
	input.onkeydown = (e) => {
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % Math.max(1, items.length); draw(); $('#pal-results .sel')?.scrollIntoView({ block: 'nearest' }); }
		else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
	};
	$('#pal-results').onclick = (e) => { const b = e.target.closest('.item'); if (b) run(+b.dataset.i); };
};

document.addEventListener('keydown', (e) => {
	if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (App.local?.signedIn) App.actions.palette(); }
	else if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r')) { e.preventDefault(); App.load(true); }
	else if (e.key === 'Escape') { if ($('#menu-root').firstChild) mount($('#menu-root'), ''); else if (Modal.isOpen()) { if (!$('#modal-root .scrim[data-act=""]')) Modal.close(); } else if (Drawer.isOpen()) Drawer.close(); }
});

// ---------------------------------------------------------------- start
(async function start() {
	try {
		App.local = await call('/api/state');
	} catch (e) {
		mount($('#app'), html`<div class="signin"><div class="box"><h1>Couldn't start</h1><p class="muted">${e.message}</p></div></div>`);
		return;
	}
	renderShell();
	if (App.local.signedIn) App.load(true);
	setInterval(() => { if (document.visibilityState === 'visible' || nowSec() - App.lastLoad > 300) App.load(false); }, Math.max(20, prefs.get('every', 60)) * 1000);
	setInterval(() => { const s = $('.sync span'); if (s && App.lastLoad && !App.loadError) s.textContent = 'Updated ' + ago(App.lastLoad); }, 20000);
	// tell the helper the window is still here (it closes itself once the window has gone)
	const beat = () => fetch('/api/alive', { headers: { 'X-App-Token': TOKEN } }).catch(() => {});
	beat();
	setInterval(beat, 15000);
	window.addEventListener('pagehide', () => navigator.sendBeacon('/api/bye?k=' + encodeURIComponent(TOKEN)));
	window.addEventListener('pageshow', beat);
})();
