// Overview: the batch at a glance, money, what needs you, and how the calendars and site are doing.
'use strict';
App.views.overview = {
	render() {
		const d = App.data, live = liveOrders(), now = d.now;
		const count = (st) => d.orders.filter((o) => o.status === st).length;
		const revenue = live.reduce((s, o) => s + audOf(o), 0);
		const week = live.filter((o) => o.createdAt > now - 7 * 86400);
		const today = live.filter((o) => o.createdAt > new Date().setHours(0, 0, 0, 0) / 1000);
		const todo = count('ordered') + count('making') + count('ready');
		const paired = d.devices.length, online = d.devices.filter((x) => deviceState(x) === 'ok').length;
		const left = Math.max(0, d.batch - live.length);
		const shipBy = Date.UTC(2027, 1, 28) / 1000, daysLeft = Math.max(0, Math.ceil((shipBy - now) / 86400));

		// the batch board: one square per calendar in the batch, in the order they were bought
		const sold = [...live].sort((a, b) => a.createdAt - b.createdAt);
		const cells = [];
		for (let i = 0; i < Math.max(d.batch, sold.length); i++) {
			const o = sold[i];
			cells.push(o ? html`<i class="f" style="background:${STATUS[o.status].color}" data-act="order-open" data-id="${o.id}" data-tip="#${i + 1} ${o.name || o.email}|${STATUS[o.status].label}|${country(o.country)}"></i>` : html`<i data-tip="#${i + 1}|not sold yet"></i>`);
		}
		const byCountry = Object.entries(live.reduce((m, o) => ((m[o.country || '?'] = (m[o.country || '?'] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);
		const byCur = Object.entries(live.reduce((m, o) => ((m[o.currency] = (m[o.currency] || 0) + o.total), m), {})).sort((a, b) => b[1] - a[1]);
		const st = d.status;
		const overallText = { operational: 'All systems working', degraded: 'Running slowly', partial: 'Partly down', major: 'Major outage', maintenance: 'Maintenance under way', unknown: 'No checks yet' }[st?.overall] || 'Unknown';
		const ch = d.firmware.channels;
		const upToDate = d.devices.filter((x) => x.firmware && !fwBehind(x)).length;

		return html`
		<div class="head"><div><h1>${greeting()}</h1><div class="sub">${todaysLine(today, week, left)}</div></div>
			<div class="tools"><button class="btn" data-act="open" data-url="${App.local.site}">${icon('out', 15)}Open the site</button></div></div>

		<div class="grid g-2-1">
			<div class="card">
				<h3>First batch<span class="more muted">${left ? `${left} left` : 'Sold out'}</span></h3>
				<div class="row" style="align-items:flex-end;margin-bottom:14px"><div class="big">${live.length}<small> / ${d.batch} sold</small></div><div class="grow"></div><div class="right muted" style="font-size:14px">Ships by 28 Feb 2027<br><b style="color:var(--fg)">${daysLeft} days</b> to go</div></div>
				<div class="board100">${cells}</div>
				<div class="legend">${STATUS_KEYS.filter((k) => k !== 'cancelled').map((k) => html`<span class="pill"><i style="background:${STATUS[k].color}"></i>${STATUS[k].label} <b>${count(k)}</b></span>`)}${count('cancelled') ? html`<span class="dim">${count('cancelled')} cancelled, not counted</span>` : ''}</div>
			</div>
			<div class="card">
				<h3>Needs you</h3>
				${this.todo()}
			</div>
		</div>

		<div class="grid g6" style="margin-top:14px">
			<div class="tile" data-tip="Everything paid, converted to AUD at the rates the shop uses|Cancelled orders left out"><div class="k">Taken</div><div class="v">${aud0(revenue)}</div><div class="s">about, in AUD</div></div>
			<button class="tile" data-act="nav" data-view="orders"><div class="k">This week</div><div class="v">${week.length} <small>orders</small></div><div class="s">${aud0(week.reduce((s, o) => s + audOf(o), 0))}</div></button>
			<button class="tile" data-act="nav" data-view="orders"><div class="k">To ship</div><div class="v">${todo}</div><div class="s">${count('ready')} ready, ${count('shipped')} in the post</div></button>
			<div class="tile"><div class="k">Waitlist</div><div class="v">${d.counts.waitlist ?? '–'}</div><div class="s">${d.counts.waitlist === null ? 'not available' : 'people on the list'}</div></div>
			<div class="tile"><div class="k">Accounts</div><div class="v">${d.counts.users ?? '–'}</div><div class="s">${d.userSignups.filter((t) => t > now - 7 * 86400).length} new this week</div></div>
			<button class="tile" data-act="nav" data-view="devices"><div class="k">Calendars</div><div class="v">${online}<small> / ${paired} on time</small></div><div class="s">${d.counts.unpaired ?? 0} waiting to be set up</div></button>
		</div>

		<div class="grid g-2-1" style="margin-top:14px">
			<div class="card"><h3>Orders per day<span class="more muted">last 30 days</span></h3>${Charts.bars(perDay(live.map((o) => o.createdAt), 30, 'order'))}</div>
			<div class="card"><h3>Where they're going</h3>${Charts.hbars(byCountry.slice(0, 7).map(([c, n]) => ({ name: country(c), n, tip: `${country(c)}|${plural(n, 'order')}|${Math.round((n / live.length) * 100)}%` })), { empty: 'No orders yet.' })}
				${byCur.length ? html`<div class="legend" style="margin-top:16px">${byCur.map(([c, v]) => html`<span>${c === 'AUD' ? 'AUD ' : ''}<b>${money(v, c)}</b></span>`)}</div>` : ''}</div>
		</div>

		<div class="grid g3" style="margin-top:14px">
			<div class="card"><h3>Website<button class="link more" data-act="nav" data-view="status">Open</button></h3>
				<div class="row" style="margin-bottom:12px">${tone(st?.overall === 'operational' ? 'good' : st?.overall === 'major' || st?.overall === 'partial' ? 'bad' : st?.overall === 'unknown' || !st ? 'dim' : 'warn', overallText)}</div>
				<div class="stack" style="gap:7px">${(st?.components || []).map((c) => html`<div class="row" style="font-size:14px">${tone(c.state === 'operational' ? 'good' : c.state === 'outage' ? 'bad' : c.state === 'slow' ? 'warn' : 'dim', c.label)}<span class="grow"></span><span class="dim">${c.uptime === null ? '' : c.uptime.toFixed(c.uptime === 100 ? 0 : 2) + '%'}</span></div>`)}</div></div>
			<div class="card"><h3>Firmware<button class="link more" data-act="nav" data-view="firmware">Open</button></h3>
				<div class="kv"><dt>Everyone</dt><dd><b>${ch.stable?.version || 'nothing yet'}</b></dd><dt>Beta</dt><dd><b>${ch.beta?.version || 'nothing yet'}</b></dd><dt>Up to date</dt><dd>${upToDate} of ${paired} calendars</dd></div>
				<div style="margin-top:14px">${Charts.hbars(fwCounts().map(([v, n]) => ({ name: v, n, tip: `Version ${v}|${plural(n, 'calendar')}` })), { empty: 'No calendars yet.' })}</div></div>
			<div class="card"><h3>New accounts<span class="more muted">last 30 days</span></h3>${Charts.bars(perDay(d.userSignups, 30, 'account'), { height: 130, every: 10, width: 380 })}
				<div class="legend"><span>Designs <b>${d.counts.designs ?? '–'}</b></span><span>Shared links <b>${d.counts.shared ?? '–'}</b></span><span>Board messages <b>${d.counts.messages ?? '–'}</b></span></div></div>
		</div>`;
	},
	// Things that want a decision, most urgent first. Each row jumps to where you deal with it.
	todo() {
		const d = App.data, now = d.now, rows = [];
		const add = (n, kind, title, sub, act, arg) => n && rows.push({ n, kind, title, sub, act, arg });
		const inc = d.incidents.filter((i) => !i.resolved_at);
		add(inc.length, 'bad', inc.length === 1 ? inc[0].title : 'Incidents are open on the status page', 'Close it once it is fixed', 'nav', 'status');
		const ready = d.orders.filter((o) => o.status === 'ready');
		add(ready.length, 'info', `${plural(ready.length, 'order')} ready to ship`, 'Open ship mode and add tracking numbers', 'ship-mode');
		const old = d.orders.filter((o) => o.status === 'shipped' && o.shippedAt && now - o.shippedAt > 10 * 86400);
		add(old.length, 'warn', `${plural(old.length, 'parcel')} posted over 10 days ago`, 'Probably arrived: mark them delivered', 'orders-filter', 'shipped');
		const noTrack = d.orders.filter((o) => o.status === 'shipped' && !o.tracking);
		add(noTrack.length, 'warn', `${plural(noTrack.length, 'shipped order')} without a tracking number`, "The buyer hasn't had the on-its-way email", 'orders-filter', 'shipped');
		const off = d.devices.filter((x) => deviceState(x) === 'offline');
		add(off.length, 'bad', `${plural(off.length, 'calendar')} offline`, 'Not checked in for over two days', 'devices-filter', 'problems');
		const low = d.devices.filter((x) => x.batteryPct !== null && x.batteryPct <= 15);
		add(low.length, 'warn', `${plural(low.length, 'calendar')} low on battery`, '15% or less', 'devices-filter', 'problems');
		const behind = d.devices.filter(fwBehind);
		add(behind.length, '', `${plural(behind.length, 'calendar')} on old firmware`, 'They update on their next wake', 'devices-filter', 'behind');
		const short = App.inv ? App.inv.get().parts.filter((p) => App.inv.short(p) > 0) : [];
		add(short.length, 'warn', `${plural(short.length, 'part')} short for the calendars sold`, short.slice(0, 3).map((p) => p.name).join(', ') + (short.length > 3 ? '…' : ''), 'nav', 'parts');
		const ch = d.firmware.channels;
		if (ch.beta?.version && ch.stable?.version && cmpVer(ch.beta.version, ch.stable.version) > 0) add(1, 'info', `Beta is on ${ch.beta.version}, everyone on ${ch.stable.version}`, 'Send it to everyone when you are happy with it', 'nav', 'firmware');
		if (App.local.repo && !App.local.repo.ok) add(1, '', 'Project folder not found', 'Needed for firmware releases: set it in Settings', 'nav', 'settings');
		if (!rows.length) return html`<div class="empty">${icon('check', 22)}<br>Nothing needs you right now.</div>`;
		return html`<div class="todo">${rows.map((r) => html`<button data-act="${r.act === 'nav' ? 'nav' : r.act}" data-view="${r.arg || ''}" data-arg="${r.arg || ''}"><span class="n ${r.kind}">${r.n}</span><span class="t">${r.title}<small>${r.sub}</small></span>${icon('chevron', 16)}</button>`)}</div>`;
	},
};
function fwCounts() {
	const m = {};
	for (const x of App.data.devices) m[x.firmware || 'unknown'] = (m[x.firmware || 'unknown'] || 0) + 1;
	return Object.entries(m).sort((a, b) => cmpVer(b[0] === 'unknown' ? '0' : b[0], a[0] === 'unknown' ? '0' : a[0]));
}
function greeting() {
	const h = new Date().getHours();
	return (h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening') + ', Koda';
}
function todaysLine(today, week, left) {
	const t = today.length ? `${plural(today.length, 'order')} today` : 'No orders yet today';
	return `${t}, ${week.length} this week. ${left ? `${left} of the first batch left.` : 'The first batch is sold out.'}`;
}
App.actions['orders-filter'] = (el) => App.go('orders', { status: el.dataset.arg });
App.actions['devices-filter'] = (el) => App.go('devices', { filter: el.dataset.arg });
