// Website: the status page's checks, how fast the site answers from this PC, and incidents.
'use strict';
(() => {
	const COMPONENTS = () => (App.data.status?.components || []).map((c) => [c.id, c.label]);
	const SEV = { outage: ['Outage', 'bad', 'red, something is down'], degraded: ['Degraded', 'warn', 'amber, slow or partly working'], maintenance: ['Maintenance', 'warn', 'amber, planned work'], info: ['Notice', 'info', "a note only, the banner doesn't change"] };
	const compLabel = (id) => (id ? COMPONENTS().find((c) => c[0] === id)?.[1] || id : 'Whole site');
	const length = (a, b) => { const m = Math.max(1, Math.round((b - a) / 60)); return m < 90 ? `${m} min` : m < 2880 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} days`; };
	let pings = null, pinging = false;

	async function ping() {
		if (pinging) return;
		pinging = true;
		if (App.view === 'status') mount($('#ping-box'), pingBox());
		try { pings = (await call('/api/ping')).hits; } catch (e) { toast(e.message, 'bad'); }
		pinging = false;
		if (App.view === 'status') mount($('#ping-box'), pingBox());
	}
	const pingBox = () => (!pings ? html`<div class="empty">${pinging ? 'Checking…' : ''}</div>` : html`<table class="table"><tbody>${pings.map((p) => html`<tr><td>${tone(p.ok ? (p.ms > 1500 ? 'warn' : 'good') : 'bad', p.name)}</td><td class="mono dim">${p.path}</td><td class="right nowrap">${p.ok ? p.ms + ' ms' : p.code ? 'answered ' + p.code : 'no answer'}</td></tr>`)}</tbody></table>`);

	async function act(body, done) {
		try {
			await site('/api/admin/app/incident', body);
			toast(done, 'good');
			await App.load(false);
		} catch (e) { toast(e.message, 'bad'); }
	}

	const view = (App.views.status = {
		enter() { if (!pings) ping(); },
		render() {
			const st = App.data.status, inc = App.data.incidents;
			const open = inc.filter((i) => !i.resolved_at), past = inc.filter((i) => i.resolved_at);
			const o = st?.overall;
			const text = { operational: 'All systems working', degraded: 'Running slowly', partial: 'Partly down', major: 'Major outage', maintenance: 'Maintenance under way', unknown: 'No checks yet' }[o] || 'Unknown';
			const color = o === 'operational' ? 'var(--good)' : o === 'major' || o === 'partial' ? 'var(--bad)' : o === 'unknown' || !o ? '#555' : 'var(--warn)';
			const row = (i) => { const [label, t] = SEV[i.severity] || SEV.info; return html`<div class="inc"><div class="t"><b>${i.title}</b>
				<small>${compLabel(i.component)} · ${i.resolved_at ? `${date(i.started_at)}, lasted ${length(i.started_at, i.resolved_at)}` : 'started ' + ago(i.started_at)}${i.source === 'auto' ? ' · found automatically' : ''}</small>${i.body ? html`<p>${i.body}</p>` : ''}</div>
				${tone(t, label)}
				${i.resolved_at ? '' : html`<button class="btn small primary" data-act="inc-close" data-id="${i.id}">Mark fixed</button>`}
				<button class="icon-btn" data-act="inc-menu" data-id="${i.id}" data-tip="More">${icon('dots', 16)}</button></div>`; };
			return html`
			<div class="head"><div><h1>Website</h1><div class="sub">${st?.lastCheck ? `Checked ${ago(st.lastCheck)}, every 5 minutes` : 'The checks have not run yet'}${st?.devicesActive24h != null ? ` · ${plural(st.devicesActive24h, 'calendar')} checked in today` : ''}</div></div>
				<div class="tools"><button class="btn" data-act="open" data-url="${App.local.site}/status">${icon('out', 15)}Public status page</button><button class="btn primary" data-act="inc-add">${icon('plus', 15)}Add an incident</button></div></div>
			<div class="banner"><span class="orb" style="background:${color}"></span><b>${text}</b><span class="muted">${open.length ? plural(open.length, 'open incident') : 'No open incidents'}</span></div>

			${open.length ? html`<div class="card" style="margin-top:14px"><h3>Open now</h3>${open.map(row)}</div>` : ''}

			<div class="grid g3" style="margin-top:14px">${(st?.components || []).map((c) => html`<div class="card comp">
				<div class="top"><b>${c.label}</b>${tone(c.state === 'operational' ? 'good' : c.state === 'outage' ? 'bad' : c.state === 'slow' ? 'warn' : 'dim', { operational: 'Working', slow: 'Slow', outage: 'Down', unknown: 'No data' }[c.state])}</div>
				${Charts.strip(c.days)}
				<div class="foot"><span>90 days ago</span><span>${c.uptime === null ? 'no data' : c.uptime.toFixed(c.uptime === 100 ? 0 : 2) + '% up'}${c.avgMs ? ` · ${Math.round(c.avgMs)} ms` : ''}</span><span>today</span></div></div>`)}</div>

			<div class="grid g2" style="margin-top:14px">
				<div class="card" style="padding:18px 6px 6px"><h3 style="padding:0 12px">From this PC, right now<button class="link more" data-act="ping">Check again</button></h3><div id="ping-box">${pingBox()}</div></div>
				<div class="card"><h3>Past incidents</h3>${past.length ? past.slice(0, 12).map(row) : html`<div class="empty">None so far.</div>`}</div>
			</div>`;
		},
		// Add (no incident given) or edit one.
		editIncident(i) {
			const F = { component: i?.component || null, severity: i?.severity || 'degraded', title: i?.title || '', body: i?.body || '', mins: '0' };
			const draw = () => {
				Modal.update(html`<h2>${i ? 'Edit incident' : 'Add an incident'}</h2><p class="muted">${i ? 'Changes show on the status page within about 30 seconds.' : 'It shows on the public status page within about 30 seconds.'}</p>
					<div class="field"><span>Which part</span></div><div class="chips">${[[null, 'Whole site'], ...COMPONENTS()].map(([id, label]) => html`<button class="chip ${F.component === id ? 'on' : ''}" data-act="inc-f-comp" data-val="${id || ''}">${label}</button>`)}</div>
					<div class="field"><span>How serious</span></div><div class="pick" style="grid-template-columns:1fr 1fr">${Object.entries(SEV).map(([k, [label, , blurb]]) => html`<button class="${F.severity === k ? 'on' : ''}" data-act="inc-f-sev" data-val="${k}"><span class="radio"></span><span><b>${label}</b><small>${blurb}</small></span></button>`)}</div>
					<label class="field"><span>Title</span><input id="inc-title" value="${F.title}" placeholder="Short, like: Calendar updates delayed" maxlength="140" autocomplete="off" autofocus></label>
					<label class="field"><span>Message</span><textarea id="inc-body" placeholder="What people should know (optional)" maxlength="600">${F.body}</textarea></label>
					${i ? '' : html`<label class="field"><span>Started how many minutes ago</span><input id="inc-mins" value="${F.mins}" inputmode="numeric" autocomplete="off" style="width:120px"></label>`}
					<div class="modal-foot"><button class="btn" data-act="modal-close">Cancel</button><button class="btn primary" data-act="inc-f-go">${i ? 'Save' : 'Put it on the status page'}</button></div>`);
				$('#inc-title').oninput = (e) => (F.title = e.target.value);
				$('#inc-body').oninput = (e) => (F.body = e.target.value);
				if ($('#inc-mins')) $('#inc-mins').oninput = (e) => (F.mins = e.target.value);
			};
			App.actions['inc-f-comp'] = (el) => { F.component = el.dataset.val || null; draw(); };
			App.actions['inc-f-sev'] = (el) => { F.severity = el.dataset.val; draw(); };
			App.actions['inc-f-go'] = async () => {
				if (!F.title.trim()) return $('#inc-title').focus();
				const mins = Number(F.mins);
				if (!i && !(Number.isFinite(mins) && mins >= 0)) return toast('Minutes should be a number, like 15.', 'bad');
				Modal.close();
				await act({ action: i ? 'edit' : 'add', id: i?.id, component: F.component, severity: F.severity, title: F.title, body: F.body, minutesAgo: mins }, i ? 'Saved' : 'Added to the status page');
			};
			Modal.open('', { wide: true });
			draw();
		},
	});
	const find = (id) => App.data.incidents.find((i) => String(i.id) === String(id));
	Object.assign(App.actions, {
		ping,
		'inc-add': () => view.editIncident(),
		'inc-close': (el) => act({ action: 'close', id: +el.dataset.id }, 'Marked fixed. It moves to past incidents.'),
		'inc-menu': (el) => {
			const i = find(el.dataset.id);
			menu(el, [
				{ label: 'Edit', run: () => view.editIncident(i) },
				...(i.resolved_at ? [{ label: 'Reopen', run: () => act({ action: 'reopen', id: i.id }, 'Reopened') }] : []),
				{ label: 'Delete for good', danger: true, run: async () => { if (await confirmBox({ title: 'Delete this incident?', body: `"${i.title}" is removed from the history too. To end one, use Mark fixed instead.`, ok: 'Delete', danger: true })) act({ action: 'delete', id: i.id }, 'Deleted'); } },
			]);
		},
	});
})();
