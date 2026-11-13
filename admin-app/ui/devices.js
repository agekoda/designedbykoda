// Calendars: every paired calendar, how each is doing, and a side panel with its battery history.
'use strict';
(() => {
	const S = { filter: 'all', q: '' };
	const byId = (id) => App.data.devices.find((x) => x.id === id);
	const low = (x) => x.batteryPct !== null && x.batteryPct <= 15;
	const problem = (x) => ['offline', 'late'].includes(deviceState(x)) || low(x);
	const FILTERS = { all: () => true, problems: problem, behind: fwBehind, beta: (x) => x.channel === 'beta' };
	const matches = (x) => {
		if (!FILTERS[S.filter](x)) return false;
		const q = S.q.trim().toLowerCase();
		return !q || [x.name, x.email, x.id, x.firmware, x.layout].some((f) => String(f || '').toLowerCase().includes(q));
	};
	const fwCell = (x) => html`<span class="mono">${x.firmware || '–'}</span>${x.channel === 'beta' ? html` <span class="tag">beta</span>` : ''}${fwBehind(x) ? html` <span class="dim" data-tip="Should be on ${targetFw(x)}|Updates on its next wake">↑ ${targetFw(x)}</span>` : ''}`;
	const battCell = (x) => (x.batteryPct === null ? html`<span class="dim">–</span>` : html`<span class="bar-cell" data-tip="${x.batteryPct}%|${(x.batteryMv / 1000).toFixed(2)} V|read ${ago(x.batteryAt)}"><span class="track"><i style="width:${x.batteryPct}%;${low(x) ? 'background:var(--bad)' : ''}"></i></span>${x.batteryPct}%${low(x) ? html` <span class="tag" style="color:#ff8f8f;border-color:#5a1c1c">low</span>` : ''}</span>`);

	const view = (App.views.devices = {
		enter(opts) { if (opts?.filter) { S.filter = opts.filter; S.q = ''; } },
		render() {
			const d = App.data, all = d.devices;
			const n = (f) => all.filter(f).length;
			const st = (s) => n((x) => deviceState(x) === s);
			const buckets = [['0–15%', 0, 15], ['16–40%', 16, 40], ['41–60%', 41, 60], ['61–80%', 61, 80], ['81–100%', 81, 100]].map(([name, a, b]) => ({ name, n: n((x) => x.batteryPct !== null && x.batteryPct >= a && x.batteryPct <= b) }));
			const layouts = Object.entries(all.reduce((m, x) => ((m[x.layout || 'default'] = (m[x.layout || 'default'] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1]).slice(0, 6);
			const chip = (key, label, count) => html`<button class="chip ${S.filter === key ? 'on' : ''}" data-act="devices-filter-set" data-f="${key}">${label} <b>${count}</b></button>`;
			return html`
			<div class="head"><div><h1>Calendars</h1><div class="sub">${all.length} paired to an account, ${d.counts.unpaired ?? 0} switched on but not set up yet</div></div>
				<div class="tools"><label class="search">${icon('search', 16)}<input id="devices-q" placeholder="Name, owner, version…" value="${S.q}" data-input="devices-q" autocomplete="off" spellcheck="false"></label></div></div>
			<div class="grid g6">
				<div class="tile"><div class="k">Paired</div><div class="v">${all.length}</div><div class="s">${n((x) => x.pairedAt > d.now - 7 * 86400)} new this week</div></div>
				<div class="tile" data-tip="Checked in when they were due"><div class="k">On time</div><div class="v">${st('ok')}</div><div class="s">${all.length ? Math.round((st('ok') / all.length) * 100) : 0}% of the fleet</div></div>
				<div class="tile" data-tip="Over 6 hours past when they were due to wake"><div class="k">Late</div><div class="v">${st('late')}</div><div class="s">over 6 h overdue</div></div>
				<div class="tile" data-tip="Over 2 days past when they were due to wake"><div class="k">Offline</div><div class="v">${st('offline')}</div><div class="s">over 2 days overdue</div></div>
				<div class="tile"><div class="k">Low battery</div><div class="v">${n(low)}</div><div class="s">15% or less</div></div>
				<div class="tile"><div class="k">Old firmware</div><div class="v">${n(fwBehind)}</div><div class="s">update on next wake</div></div>
			</div>
			<div class="grid g3" style="margin-top:14px">
				<div class="card"><h3>Firmware versions</h3>${Charts.hbars(fwCounts().map(([v, c]) => ({ name: v, n: c, tip: `Version ${v}|${plural(c, 'calendar')}` })), { empty: 'No calendars yet.' })}</div>
				<div class="card"><h3>Battery levels</h3>${Charts.hbars(buckets.map((b) => ({ ...b, tip: `${b.name}|${plural(b.n, 'calendar')}` })))}</div>
				<div class="card"><h3>Layouts showing</h3>${Charts.hbars(layouts.map(([name, c]) => ({ name, n: c, tip: `${name}|${plural(c, 'calendar')}` })), { empty: 'No calendars yet.' })}</div>
			</div>
			<div class="chips" style="margin:18px 0 14px">${chip('all', 'All', all.length)}${chip('problems', 'Needs a look', n(problem))}${chip('behind', 'Old firmware', n(fwBehind))}${chip('beta', 'On beta', n((x) => x.channel === 'beta'))}</div>
			<div id="devices-list">${this.list()}</div>`;
		},
		list() {
			const rows = App.data.devices.filter(matches);
			if (!rows.length) return html`<div class="card empty">${App.data.devices.length ? 'No calendars match.' : 'No calendars are paired yet.'}</div>`;
			return html`<div class="card" style="padding:14px 6px 6px"><table class="table">
				<thead><tr><th>Calendar</th><th>Owner</th><th>Firmware</th><th>Battery</th><th>Last seen</th><th>Next wake</th><th>State</th></tr></thead>
				<tbody>${rows.map((x) => { const s = DEVICE_STATE[deviceState(x)]; return html`<tr class="click" data-act="device-open" data-id="${x.id}">
					<td><b>${x.name}</b><div class="sub">${x.layout || ''}</div></td>
					<td><div class="clip">${x.email || html`<span class="dim">–</span>`}</div></td>
					<td class="nowrap">${fwCell(x)}</td><td>${battCell(x)}</td>
					<td class="nowrap" data-tip="${dateTime(x.lastSeenAt) || 'never'}">${ago(x.lastSeenAt)}</td>
					<td class="nowrap muted">${x.nextWakeAt ? (x.nextWakeAt > App.data.now ? until(x.nextWakeAt) : 'was due ' + ago(x.nextWakeAt)) : '–'}</td>
					<td>${tone(s.tone, s.label)}</td></tr>`; })}</tbody></table></div>`;
		},
		openDevice(id) {
			if (App.view !== 'devices') App.go('devices');
			let battery = null;
			const draw = () => {
				const x = byId(id);
				if (!x) return Drawer.close();
				const s = DEVICE_STATE[deviceState(x)];
				Drawer.open(html`
				<button class="icon-btn x" data-act="drawer-close">${icon('close')}</button>
				<div class="dim mono">${x.id}</div>
				<h2>${x.name}</h2>
				<div class="row wrap" style="margin-top:6px">${tone(s.tone, s.label)}${low(x) ? tone('bad', 'Low battery') : ''}${fwBehind(x) ? tone('info', 'Update waiting') : ''}</div>
				<section><h3>Details</h3><dl class="kv">
					<dt>Owner</dt><dd>${x.email ? html`${x.email} <button class="icon-btn" data-act="copy" data-text="${x.email}" data-what="Email copied">${icon('copy', 14)}</button>` : '–'}</dd>
					<dt>Last seen</dt><dd>${x.lastSeenAt ? `${ago(x.lastSeenAt)} (${dateTime(x.lastSeenAt)})` : 'never'}</dd>
					<dt>Next wake</dt><dd>${x.nextWakeAt ? dateTime(x.nextWakeAt) : '–'}</dd>
					<dt>Paired</dt><dd>${date(x.pairedAt) || '–'}</dd>
					<dt>Showing</dt><dd>${x.layout || '–'}${x.dark ? ', dark' : ''}${x.language ? ', ' + x.language : ''}</dd>
					<dt>Battery</dt><dd>${x.batteryPct === null ? '–' : `${x.batteryPct}% (${(x.batteryMv / 1000).toFixed(2)} V)`}</dd></dl></section>
				<section><h3>Firmware</h3><dl class="kv">
					<dt>Running</dt><dd><b>${x.firmware || 'unknown'}</b></dd>
					<dt>Should run</dt><dd>${targetFw(x) || '–'} ${fwBehind(x) ? html`<span class="muted">(installs on its next wake)</span>` : ''}</dd>
					<dt>Gets</dt><dd>${x.channel === 'beta' ? 'Beta versions first' : 'The same as everyone'}</dd></dl>
					<div class="row wrap" style="margin-top:12px">
						<button class="btn small" data-act="device-channel" data-id="${x.id}" data-ch="${x.channel === 'beta' ? 'stable' : 'beta'}">${x.channel === 'beta' ? 'Take off beta' : 'Put on beta'}</button>
						${fwBehind(x) ? html`<button class="btn small" data-act="device-now" data-id="${x.id}" data-cancel="${x.updateNowAt && App.data.now - x.updateNowAt < 3600 ? '1' : ''}">${x.updateNowAt && App.data.now - x.updateNowAt < 3600 ? 'Cancel "update now"' : 'Update on next button press'}</button>` : ''}
					</div></section>
				<section><h3>Battery, last 90 days</h3><div id="dev-batt">${battery === null ? html`<div class="empty">Loading…</div>` : Charts.line(battery, { fmt: (v) => (v / 1000).toFixed(2) + ' V', min: 3300, max: 4200 })}</div></section>`, 'device:' + id);
			};
			draw();
			Drawer.refresh = () => { if (Drawer.key === 'device:' + id) { draw(); $('.drawer')?.classList.add('in'); } };
			call('/api/site?path=' + encodeURIComponent('/api/admin/app/device?id=' + encodeURIComponent(id))).then((r) => { battery = r.battery || []; if (Drawer.key === 'device:' + id) mount($('#dev-batt'), Charts.line(battery, { fmt: (v) => (v / 1000).toFixed(2) + ' V', min: 3300, max: 4200 })); }).catch(() => { battery = []; });
		},
	});
	Object.assign(App.actions, {
		'device-open': (el) => view.openDevice(el.dataset.id),
		'devices-filter-set': (el) => { S.filter = el.dataset.f; App.render(); },
		'devices-q': (el) => { S.q = el.value; mount($('#devices-list'), view.list()); },
		'device-channel': async (el) => {
			try {
				await site('/api/admin/app/device', { id: el.dataset.id, action: 'channel', channel: el.dataset.ch });
				toast(el.dataset.ch === 'beta' ? 'It now gets beta versions first.' : 'It now gets the same as everyone.', 'good');
				App.load(false);
			} catch (e) { toast(e.message, 'bad'); }
		},
		'device-now': async (el) => {
			try {
				await site('/api/admin/app/device', { id: el.dataset.id, action: 'update-now', cancel: !!el.dataset.cancel });
				toast(el.dataset.cancel ? 'Cancelled.' : 'It installs the update the next time its button is pressed (within the hour).', 'good');
				App.load(false);
			} catch (e) { toast(e.message, 'bad'); }
		},
	});
})();
