// Money: what's come in, what's gone out, what a calendar really costs to make, and the profit for the
// batch. Sales come from the site's orders; costs come from Parts & stock plus the other costs logged here.
'use strict';
(() => {
	const Inv = App.inv;
	const aud = (n) => money(Math.round(n * 100), 'AUD');
	const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
	// Stripe Australia: 1.7% + A$0.30 for Australian cards, 3.5% + A$0.30 for overseas cards, plus 2%
	// when the buyer paid in another currency. An estimate: Stripe's own payout report is exact.
	const fee = (o) => { const t = audOf(o); return o.country === 'AU' ? t * 0.017 + 0.3 : t * (0.035 + (o.currency !== 'AUD' ? 0.02 : 0)) + 0.3; };
	const bars = (items, fmt) => {
		if (!items.length) return html`<div class="empty">Nothing yet.</div>`;
		const max = Math.max(...items.map((i) => i.v), 0.01);
		return html`<div class="hbars">${items.map((i) => html`<div class="hbar" data-tip="${i.name}|${i.tip || fmt(i.v)}"><span class="name">${i.name}</span><span class="track"><i style="width:${Math.max(2, (i.v / max) * 100)}%"></i></span><span class="n">${fmt(i.v)}</span></div>`)}</div>`;
	};

	App.views.money = {
		render() {
			const inv = Inv.get(), live = liveOrders(), sold = live.length;
			const taken = live.reduce((s, o) => s + audOf(o), 0);
			const shipIn = live.reduce((s, o) => s + o.shipping / 100 / ((App.data.fx || {})[o.currency] || 1), 0);
			const fees = live.reduce((s, o) => s + fee(o), 0);
			const parts = inv.parts.reduce((s, p) => s + Inv.spent(p), 0);
			const other = (inv.costs || []).reduce((s, c) => s + (+c.amount || 0), 0);
			const spent = parts + other;
			const net = taken - fees;
			const perCal = Inv.perCalendar();
			const projected = net - perCal * sold - other;
			const perSale = sold ? net / sold : 0;
			const beSales = perSale - perCal > 0 ? Math.ceil(spent / (perSale - perCal)) : null;
			const estParts = inv.parts.filter((p) => !Inv.bought(p) && +p.perUnit > 0).length;
			const spendBy = [...inv.parts.filter((p) => Inv.spent(p)).map((p) => ({ name: p.name, v: Inv.spent(p) })), ...Object.entries((inv.costs || []).reduce((m, c) => ((m[c.name] = (m[c.name] || 0) + (+c.amount || 0)), m), {})).map(([name, v]) => ({ name, v }))].sort((a, b) => b.v - a.v);
			const perPart = inv.parts.filter((p) => +p.perUnit > 0).map((p) => ({ name: p.name, v: Inv.unitCost(p) * p.perUnit, tip: `${aud(Inv.unitCost(p) * p.perUnit)}${Inv.bought(p) ? ' from your orders' : ' estimate'}` })).sort((a, b) => b.v - a.v);
			return html`
			<div class="head"><div><h1>Money</h1><div class="sub">All in A$. Sales from the site, costs from Parts &amp; stock and the other costs below.</div></div>
				<div class="tools"><button class="btn" data-act="open" data-url="https://dashboard.stripe.com/payouts">${icon('out', 15)}Stripe payouts</button><button class="btn primary" data-act="cost-add">${icon('plus', 15)}Add a cost</button></div></div>
			<div class="grid g6">
				<div class="tile"><div class="k">Taken</div><div class="v">${aud(taken)}</div><div class="s">${aud(shipIn)} is shipping</div></div>
				<div class="tile" data-tip="Estimate: 1.7% + 30c for Australian cards, 3.5% + 30c overseas, +2% for other currencies"><div class="k">Stripe fees</div><div class="v">${aud(fees)}</div><div class="s">estimate</div></div>
				<div class="tile"><div class="k">Spent</div><div class="v">${aud(spent)}</div><div class="s">${aud(parts)} on parts</div></div>
				<div class="tile" data-tip="Taken, minus fees, minus everything spent so far|Goes negative while you're buying parts ahead of shipping"><div class="k">Cash so far</div><div class="v" style="${net - spent < 0 ? 'color:#ffa3a3' : ''}">${aud(net - spent)}</div><div class="s">${net - spent < 0 ? 'still paying for parts' : 'in the bank'}</div></div>
				<div class="tile" data-tip="Each part from your real orders once you've logged one, else the costs sheet estimate"><div class="k">Cost per calendar</div><div class="v">${aud(perCal)}</div><div class="s">${estParts ? `${estParts} still estimates` : 'from real orders'}</div></div>
				<div class="tile" data-tip="When every sold calendar is built: taken − fees − parts for each − other costs"><div class="k">Batch profit</div><div class="v" style="${projected < 0 ? 'color:#ffa3a3' : ''}">${aud(projected)}</div><div class="s">projected, ${sold} sold</div></div>
			</div>
			<div class="grid g2" style="margin-top:14px">
				<div class="card"><h3>One calendar<span class="more muted">${aud(perCal)} to make</span></h3>${bars(perPart, aud)}
					<div class="legend" style="margin-top:16px"><span>Average paid <b>${sold ? aud(taken / sold) : '–'}</b></span><span>After fees <b>${sold ? aud(perSale) : '–'}</b></span><span>Left per calendar <b>${sold ? aud(perSale - perCal) : '–'}</b></span>${sold ? html`<span>Margin <b>${Math.round(((perSale - perCal) / (taken / sold)) * 100)}%</b></span>` : ''}</div>
					<p class="dim" style="font-size:13.5px;margin-top:10px">Postage to buyers isn't in here: they pay shipping at checkout (${aud(shipIn)} so far). Log what you pay AusPost as a cost below to see if it covers it.</p></div>
				<div class="card"><h3>Where the money went<span class="more muted">${aud(spent)}</span></h3>${bars(spendBy, aud)}
					${beSales !== null && spent ? html`<p class="muted" style="font-size:14px;margin-top:14px">What you've spent is covered after <b style="color:var(--fg)">${plural(beSales, 'sale')}</b> at your average price. ${sold >= beSales ? 'You are past that.' : `${beSales - sold} to go.`}</p>` : ''}</div>
			</div>
			<div class="card" style="margin-top:14px;padding:18px 6px 6px"><h3 style="padding:0 12px">Other costs<button class="link more" data-act="cost-add">+ Add</button></h3>
				${(inv.costs || []).length ? html`<table class="table"><thead><tr><th>Date</th><th>What</th><th>Note</th><th class="right">Amount</th><th></th></tr></thead><tbody>
				${[...inv.costs].sort((a, b) => String(b.date).localeCompare(String(a.date))).map((c) => html`<tr><td class="muted nowrap">${c.date}</td><td>${c.name}</td><td class="muted"><div class="clip">${c.note || ''}</div></td><td class="right nowrap">${aud(+c.amount || 0)}</td><td class="right"><button class="icon-btn" data-act="cost-del" data-id="${c.id}" data-tip="Delete">${icon('close', 14)}</button></td></tr>`)}</tbody></table>`
				: html`<div class="empty">Anything that isn't a part: AusPost postage, compliance testing, tools, samples, the domain.</div>`}</div>`;
		},
	};

	Object.assign(App.actions, {
		'cost-add': () => {
			const names = ['AusPost postage', 'Compliance testing', 'Tools', 'Samples', 'Domain and hosting', 'Freight'];
			Modal.open(html`<h2>Add a cost</h2><p class="muted">Anything that isn't a part. Parts go in Parts &amp; stock as supplier orders.</p>
				<label class="field"><span>What</span><input id="c-name" list="c-names" placeholder="AusPost postage" autofocus><datalist id="c-names">${names.map((n) => html`<option value="${n}">`)}</datalist></label>
				<div class="grid g2" style="gap:10px"><label class="field"><span>Amount (A$)</span><input id="c-amt" inputmode="decimal"></label><label class="field"><span>Date</span><input id="c-date" value="${new Date().toISOString().slice(0, 10)}"></label></div>
				<label class="field"><span>Note</span><input id="c-note" placeholder="Optional"></label>
				<div class="modal-foot"><button class="btn" data-act="modal-close">Cancel</button><button class="btn primary" id="c-go">Add</button></div>`);
			$('#c-go').onclick = async () => {
				const name = $('#c-name').value.trim(), amount = Number(String($('#c-amt').value).replace(/[$,\s]/g, ''));
				if (!name) return $('#c-name').focus();
				if (!(amount > 0)) return toast('The amount should be a number, like 12.70.', 'bad');
				const inv = Inv.get();
				(inv.costs = inv.costs || []).push({ id: uid(), name, amount: Math.round(amount * 100) / 100, date: $('#c-date').value.trim(), note: $('#c-note').value.trim() });
				Modal.close();
				if (await Inv.save('Added')) App.render();
			};
		},
		'cost-del': async (el) => {
			const inv = Inv.get(), c = inv.costs.find((x) => x.id === el.dataset.id);
			if (!(await confirmBox({ title: `Delete "${c.name}"?`, body: aud(+c.amount || 0), ok: 'Delete', danger: true }))) return;
			inv.costs = inv.costs.filter((x) => x !== c);
			if (await Inv.save('Deleted')) App.render();
		},
	});
})();
