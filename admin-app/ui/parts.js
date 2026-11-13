// Parts & stock: every part that goes into a calendar, how many you have, what's on the way, what each
// supplier order cost, and whether there's enough to build every calendar that's been sold.
// Saved in the site's database (one record, "inventory"), so it's the same on any PC.
'use strict';
(() => {
	const r2 = (n) => Math.round(n * 100) / 100;
	const usd = (n) => r2(n * 1.42); // the costs sheet's rate
	// From eink_calendar_costs_6.xlsx, 100-unit column. Expected cost is per piece, in A$.
	const SEED = [
		['board', 'Assembled board', 'PCBWay', 1, usd((85.86 + 362.7 + 304.29) / 100), 'Bare PCB + parts + assembly. PCBWay quote 2 Nov: US$85.86 fab (after discount), US$362.70 parts, US$304.29 assembly for 100.'],
		['screen', 'E-ink screen 4.2"', 'WeAct', 1, usd(12.5), 'US$12.50 each by bank transfer (email 29 Oct). Freight about US$75 per 100.'],
		['case', 'Case', 'JLC 3D', 1, usd(6.61), 'Resin, with kickstand mount and wall-screw hole (7 Nov). No bulk discount at 100.'],
		['kickstand', 'Kickstand', 'JLC 3D', 1, usd(1.66), 'JLC Black resin. LEDO 6060 white would be US$0.47.'],
		['lid', 'Lid', 'JLC 3D', 1, usd(1.68), ''],
		['battery', 'Battery', 'AliExpress', 1, 3.28, 'A$32.75 per 10. May change after capacity testing.'],
		['box', 'Mailer box', 'Pack Queen', 1, 1.31, '175 × 130 × 55 mm self-sealing. Estimate: confirm when bought.'],
		['envelope', 'Translucent envelope', 'AliExpress', 1, 0.21, 'A$21.10 per 100, 11 × 16 cm.'],
		['wrap', 'Wrap + screen card', '', 1, 0.2, 'Placeholder estimate: honeycomb paper and a card cut to the screen.'],
		['leaflet', 'Leaflet', 'Snap Wangara', 1, 2.74, 'A$274 for 100 (quote 13 Nov), 130 gsm matt, scored concertina.'],
	];
	const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
	const fresh = () => ({ v: 1, built: 0, parts: SEED.map(([id, name, supplier, perUnit, expect, notes]) => ({ id, name, supplier, perUnit, expect, onHand: 0, url: '', notes, orders: [] })), costs: [] });

	// ---------------------------------------------------------------- shared with the Money tab
	const Inv = (App.inv = {
		get() {
			const s = App.data?.store?.inventory;
			return s && Array.isArray(s.parts) ? s : (App.data.store = { ...(App.data.store || {}), inventory: fresh() }).inventory;
		},
		saved: () => !!App.data?.store?.inventory?.savedOnce,
		async save(msg) {
			const inv = Inv.get();
			inv.savedOnce = true;
			try {
				await site('/api/admin/app/store', { key: 'inventory', value: inv });
				if (msg) toast(msg, 'good');
				if (Drawer.isOpen() && Drawer.refresh) setTimeout(() => Drawer.refresh());
				return true;
			} catch (e) {
				toast(e.message, 'bad');
				return false;
			}
		},
		part: (id) => Inv.get().parts.find((p) => p.id === id),
		spent: (p) => p.orders.reduce((s, o) => s + (+o.cost || 0) + (+o.shipping || 0), 0),
		bought: (p) => p.orders.reduce((s, o) => s + (+o.qty || 0), 0),
		incoming: (p) => p.orders.filter((o) => o.status !== 'received').reduce((s, o) => s + (+o.qty || 0), 0),
		// what one piece really costs: from your orders (incl. shipping) once there are any, else the estimate
		unitCost: (p) => (Inv.bought(p) ? Inv.spent(p) / Inv.bought(p) : +p.expect || 0),
		perCalendar: () => Inv.get().parts.reduce((s, p) => s + Inv.unitCost(p) * (+p.perUnit || 0), 0),
		sold: () => liveOrders().length,
		toBuild: () => Math.max(0, Inv.sold() - (+Inv.get().built || 0)),
		need: (p) => Inv.toBuild() * (+p.perUnit || 0),
		short: (p) => Math.max(0, Inv.need(p) - (+p.onHand || 0) - Inv.incoming(p)),
		canBuild: () => Math.min(...Inv.get().parts.filter((p) => +p.perUnit > 0).map((p) => Math.floor((+p.onHand || 0) / p.perUnit)), Infinity),
	});
	const aud = (n) => money(Math.round(n * 100), 'AUD');
	const ORDER_ST = { ordered: ['Ordered', 'info'], shipped: ['On the way', 'warn'], received: ['Received', 'good'] };

	const view = (App.views.parts = {
		render() {
			const inv = Inv.get(), parts = inv.parts;
			const shortParts = parts.filter((p) => Inv.short(p) > 0);
			const spent = parts.reduce((s, p) => s + Inv.spent(p), 0);
			const can = Inv.canBuild();
			const allOrders = parts.flatMap((p) => p.orders.map((o) => ({ ...o, part: p }))).sort((a, b) => String(b.date).localeCompare(String(a.date)));
			const open = allOrders.filter((o) => o.status !== 'received');
			return html`
			<div class="head"><div><h1>Parts &amp; stock</h1><div class="sub">${Inv.saved() ? `${plural(parts.length, 'part')} per calendar` : 'Filled in from your costs sheet. Nothing is saved until you change something.'}</div></div>
				<div class="tools"><button class="btn" data-act="part-add">${icon('plus', 15)}Add a part</button><button class="btn" data-act="pord-new">Log a supplier order</button><button class="btn primary" data-act="parts-build">${icon('check', 15)}I built some</button></div></div>
			<div class="grid g6">
				<div class="tile"><div class="k">Sold</div><div class="v">${Inv.sold()}</div><div class="s">calendars</div></div>
				<div class="tile"><div class="k">Built</div><div class="v">${+inv.built || 0}</div><div class="s">${Inv.toBuild()} still to build</div></div>
				<div class="tile" data-tip="With the parts you have on hand right now"><div class="k">Can build now</div><div class="v">${can === Infinity ? '–' : can}</div><div class="s">${can !== Infinity && can < Inv.toBuild() ? `${Inv.toBuild() - can} short` : 'enough for every sale'}</div></div>
				<div class="tile"><div class="k">Parts short</div><div class="v" style="${shortParts.length ? 'color:#ffa3a3' : ''}">${shortParts.length}</div><div class="s">${shortParts.length ? 'counting incoming' : 'all covered'}</div></div>
				<div class="tile"><div class="k">On the way</div><div class="v">${open.length}</div><div class="s">${plural(open.length, 'supplier order')}</div></div>
				<div class="tile"><div class="k">Spent on parts</div><div class="v">${aud(spent)}</div><div class="s">incl. shipping</div></div>
			</div>
			<div class="card" style="margin-top:14px;padding:14px 6px 6px"><table class="table">
				<thead><tr><th>Part</th><th>Supplier</th><th class="right">Per calendar</th><th class="right">On hand</th><th class="right">On the way</th><th class="right">Needed</th><th>Enough?</th><th class="right">Each</th><th class="right">Spent</th></tr></thead>
				<tbody>${parts.map((p) => { const sh = Inv.short(p), inc = Inv.incoming(p), need = Inv.need(p); return html`<tr class="click" data-act="part-open" data-id="${p.id}">
					<td><b>${p.name}</b></td><td class="muted">${p.supplier || '–'}</td><td class="right">${p.perUnit}</td>
					<td class="right"><b>${+p.onHand || 0}</b></td><td class="right muted">${inc || '–'}</td><td class="right muted" data-tip="For the ${Inv.toBuild()} calendars still to build">${need}</td>
					<td>${sh ? tone('bad', `${sh} short`) : need && (+p.onHand || 0) < need ? tone('warn', 'Once orders arrive') : tone('good', 'Yes')}</td>
					<td class="right nowrap" data-tip="${Inv.bought(p) ? 'Average from your orders, incl. shipping' : 'Estimate from your costs sheet'}">${aud(Inv.unitCost(p))}${Inv.bought(p) ? '' : html` <span class="dim">est.</span>`}</td>
					<td class="right nowrap">${Inv.spent(p) ? aud(Inv.spent(p)) : html`<span class="dim">–</span>`}</td></tr>`; })}</tbody></table></div>
			<div class="card" style="margin-top:14px;padding:18px 6px 6px"><h3 style="padding:0 12px">Supplier orders</h3>
				${allOrders.length ? html`<table class="table"><thead><tr><th>Date</th><th>Part</th><th class="right">Qty</th><th class="right">Cost</th><th class="right">Shipping</th><th class="right">Each</th><th>Status</th><th>Tracking / note</th></tr></thead><tbody>
				${allOrders.map((o) => html`<tr class="click" data-act="pord-edit" data-part="${o.part.id}" data-id="${o.id}"><td class="nowrap muted">${o.date}</td><td>${o.part.name}<div class="sub">${o.supplier || o.part.supplier}</div></td><td class="right">${o.qty}</td><td class="right nowrap">${aud(+o.cost || 0)}</td><td class="right nowrap muted">${aud(+o.shipping || 0)}</td><td class="right nowrap muted">${o.qty ? aud(((+o.cost || 0) + (+o.shipping || 0)) / o.qty) : '–'}</td>
					<td>${tone(ORDER_ST[o.status]?.[1] || 'dim', ORDER_ST[o.status]?.[0] || o.status)}</td><td class="muted"><div class="clip">${o.tracking || o.note || ''}</div></td></tr>`)}</tbody></table>` : html`<div class="empty">No supplier orders logged yet. When you buy parts, log the order here with what it cost you, shipping included.</div>`}</div>`;
		},

		openPart(id) {
			const draw = () => {
				const p = Inv.part(id);
				if (!p) return Drawer.close();
				Drawer.open(html`
				<button class="icon-btn x" data-act="drawer-close">${icon('close')}</button>
				<div class="dim">${p.supplier || 'No supplier yet'}</div>
				<h2>${p.name}</h2>
				<div class="row wrap" style="margin-top:6px">${Inv.short(p) ? tone('bad', `${Inv.short(p)} short`) : tone('good', 'Enough for every sale')}<span class="dim">·</span><span class="muted">${aud(Inv.unitCost(p))} each${Inv.bought(p) ? '' : ' (estimate)'}</span></div>
				<section><h3>Stock</h3>
					<div class="row" style="gap:14px"><div class="big" style="font-size:38px">${+p.onHand || 0}</div><div class="muted" style="font-size:14px">on hand<br>${Inv.incoming(p)} on the way · ${Inv.need(p)} needed</div><span class="grow"></span>
						<button class="btn small" data-act="part-adj" data-id="${p.id}" data-n="-1">−1</button><button class="btn small" data-act="part-adj" data-id="${p.id}" data-n="1">+1</button><button class="btn small" data-act="part-count" data-id="${p.id}">Set count</button></div></section>
				<section><h3>Orders<button class="link" style="float:right;text-transform:none;letter-spacing:0;font-size:13px" data-act="pord-new" data-part="${p.id}">+ Log an order</button></h3>
					${p.orders.length ? html`<div class="stack" style="gap:8px">${[...p.orders].sort((a, b) => String(b.date).localeCompare(String(a.date))).map((o) => html`<button class="tile" data-act="pord-edit" data-part="${p.id}" data-id="${o.id}" style="padding:10px 12px">
						<div class="row"><b>${o.qty} × ${aud(((+o.cost || 0) + (+o.shipping || 0)) / (o.qty || 1))}</b><span class="grow"></span>${tone(ORDER_ST[o.status]?.[1] || 'dim', ORDER_ST[o.status]?.[0] || o.status)}</div>
						<div class="s">${o.date} · ${aud(+o.cost || 0)} + ${aud(+o.shipping || 0)} shipping${o.tracking ? ' · ' + o.tracking : ''}</div></button>`)}</div>` : html`<p class="dim">None yet.</p>`}</section>
				<section><h3>Details</h3>
					<div class="grid g2" style="gap:10px"><label class="field" style="margin:0"><span>Name</span><input id="pp-name" value="${p.name}"></label><label class="field" style="margin:0"><span>Supplier</span><input id="pp-supplier" value="${p.supplier}"></label>
					<label class="field" style="margin:0"><span>Per calendar</span><input id="pp-per" value="${p.perUnit}" inputmode="numeric"></label><label class="field" style="margin:0"><span>Estimate each (A$)</span><input id="pp-expect" value="${p.expect}" inputmode="decimal"></label></div>
					<label class="field"><span>Link</span><input id="pp-url" value="${p.url || ''}" placeholder="Where you order it from"></label>
					<label class="field"><span>Notes</span><textarea id="pp-notes">${p.notes || ''}</textarea></label>
					<div class="row" style="margin-top:12px"><button class="btn primary" data-act="part-save" data-id="${p.id}">Save</button>${p.url ? html`<button class="btn" data-act="open" data-url="${p.url}">${icon('out', 15)}Open link</button>` : ''}<span class="grow"></span><button class="btn small danger" data-act="part-del" data-id="${p.id}">Remove part</button></div></section>`, 'part:' + id);
			};
			draw();
			Drawer.refresh = () => { if (Drawer.key === 'part:' + id) { draw(); $('.drawer')?.classList.add('in'); } };
		},

		// Log or edit one order from a supplier.
		orderForm(partId, orderId) {
			const parts = Inv.get().parts;
			const p0 = partId ? Inv.part(partId) : parts[0];
			const o = orderId ? p0.orders.find((x) => x.id === orderId) : null;
			const F = o ? { ...o, part: p0.id } : { part: p0.id, date: new Date().toISOString().slice(0, 10), qty: '', cost: '', shipping: '', status: 'ordered', tracking: '', note: '', supplier: '' };
			const reopenDrawer = Drawer.isOpen() && Drawer.key?.startsWith('part:');
			Modal.open(html`<h2>${o ? 'Edit supplier order' : 'Log a supplier order'}</h2><p class="muted">What it actually cost you, in A$ (what your bank charged), with shipping on its own line.</p>
				<label class="field"><span>Part</span><select id="po-part" ${o ? raw('disabled') : ''}>${parts.map((p) => html`<option value="${p.id}" ${p.id === F.part ? raw('selected') : ''}>${p.name}</option>`)}</select></label>
				<div class="grid g3" style="gap:10px"><label class="field"><span>Date ordered</span><input id="po-date" value="${F.date}" placeholder="2026-11-20"></label><label class="field"><span>Quantity</span><input id="po-qty" value="${F.qty}" inputmode="numeric" autofocus></label><label class="field"><span>Supplier</span><input id="po-sup" value="${F.supplier || ''}" placeholder="${p0.supplier}"></label></div>
				<div class="grid g2" style="gap:10px"><label class="field"><span>Cost of the parts (A$)</span><input id="po-cost" value="${F.cost}" inputmode="decimal"></label><label class="field"><span>Shipping (A$)</span><input id="po-ship" value="${F.shipping}" inputmode="decimal"></label></div>
				<div class="field"><span>Status</span></div><div class="seg" id="po-st">${Object.entries(ORDER_ST).map(([k, [l]]) => html`<button class="${F.status === k ? 'on' : ''}" data-st="${k}">${l}</button>`)}</div>
				<div class="grid g2" style="gap:10px"><label class="field"><span>Tracking</span><input id="po-track" value="${F.tracking || ''}"></label><label class="field"><span>Note</span><input id="po-note" value="${F.note || ''}" placeholder="Order number, what was wrong…"></label></div>
				<p class="dim" id="po-each" style="margin-top:10px;font-size:13.5px"></p>
				<div class="modal-foot">${o ? html`<button class="btn danger" id="po-del" style="margin-right:auto">Delete</button>` : ''}<button class="btn" data-act="modal-close">Cancel</button><button class="btn primary" id="po-go">${o ? 'Save' : 'Log order'}</button></div>`, { wide: true, onClose: () => { if (reopenDrawer) view.openPart(F.part); } });
			const num = (id) => Number(String($(id).value).replace(/[$,\s]/g, ''));
			const each = () => { const q = num('#po-qty'), t = num('#po-cost') + num('#po-ship'); $('#po-each').textContent = q > 0 && t >= 0 ? `${aud(t)} total, ${aud(t / q)} each.` : ''; };
			['#po-qty', '#po-cost', '#po-ship'].forEach((s) => ($(s).oninput = each));
			each();
			$$('#po-st button').forEach((b) => (b.onclick = () => { F.status = b.dataset.st; $$('#po-st button').forEach((x) => x.classList.toggle('on', x === b)); }));
			$('#po-part').onchange = (e) => { F.part = e.target.value; $('#po-sup').placeholder = Inv.part(F.part).supplier; };
			$('#po-go').onclick = async () => {
				const qty = num('#po-qty'), cost = num('#po-cost'), ship = num('#po-ship') || 0;
				if (!(qty > 0) || !Number.isInteger(qty)) return toast('Quantity should be a whole number.', 'bad');
				if (!(cost >= 0) || !(ship >= 0)) return toast('Costs should be numbers, like 32.75.', 'bad');
				const part = Inv.part(F.part);
				const rec = { id: o?.id || uid(), date: $('#po-date').value.trim() || new Date().toISOString().slice(0, 10), qty, cost: r2(cost), shipping: r2(ship), status: F.status, tracking: $('#po-track').value.trim(), note: $('#po-note').value.trim(), supplier: $('#po-sup').value.trim() };
				const wasReceived = o?.status === 'received', prevQty = o ? +o.qty || 0 : 0;
				if (o) Object.assign(o, rec);
				else part.orders.push(rec);
				// receiving an order puts it in stock; un-receiving takes it back out
				let msg = o ? 'Saved' : 'Order logged';
				if (rec.status === 'received' && !wasReceived) { part.onHand = (+part.onHand || 0) + qty; msg += `. ${qty} added to stock.`; }
				else if (wasReceived && rec.status !== 'received') { part.onHand = Math.max(0, (+part.onHand || 0) - prevQty); msg += `. ${prevQty} taken back out of stock.`; }
				else if (wasReceived && rec.status === 'received' && prevQty !== qty) part.onHand = Math.max(0, (+part.onHand || 0) + qty - prevQty);
				Modal.close();
				if (await Inv.save(msg)) App.render();
			};
			if (o) $('#po-del').onclick = async () => {
				Modal.close();
				if (!(await confirmBox({ title: 'Delete this order?', body: o.status === 'received' ? 'Its parts stay in your stock count. Change the count yourself if they should go too.' : '', ok: 'Delete', danger: true }))) return;
				p0.orders = p0.orders.filter((x) => x !== o);
				if (await Inv.save('Deleted')) App.render();
			};
		},
	});

	Object.assign(App.actions, {
		'part-open': (el) => view.openPart(el.dataset.id),
		'pord-new': (el) => view.orderForm(el.dataset.part),
		'pord-edit': (el) => view.orderForm(el.dataset.part, el.dataset.id),
		'part-adj': async (el) => { const p = Inv.part(el.dataset.id); p.onHand = Math.max(0, (+p.onHand || 0) + +el.dataset.n); if (await Inv.save()) App.render(); },
		'part-count': async (el) => {
			const p = Inv.part(el.dataset.id);
			const v = await askBox({ title: `How many ${p.name.toLowerCase()}s do you have?`, body: 'Count the loose ones, not ones already inside built calendars.', label: 'On hand', value: String(+p.onHand || 0), ok: 'Save' });
			if (v === null) return view.openPart(p.id);
			const n = Number(v);
			if (!Number.isInteger(n) || n < 0) { toast('That should be a whole number.', 'bad'); return view.openPart(p.id); }
			p.onHand = n;
			if (await Inv.save('Saved')) App.render();
			view.openPart(p.id);
		},
		'part-save': async (el) => {
			const p = Inv.part(el.dataset.id);
			const per = Number($('#pp-per').value), ex = Number(String($('#pp-expect').value).replace(/[$,\s]/g, ''));
			if (!$('#pp-name').value.trim()) return toast('Give it a name.', 'bad');
			if (!(per >= 0) || !(ex >= 0)) return toast('Per calendar and the estimate should be numbers.', 'bad');
			Object.assign(p, { name: $('#pp-name').value.trim(), supplier: $('#pp-supplier').value.trim(), perUnit: per, expect: r2(ex), url: $('#pp-url').value.trim(), notes: $('#pp-notes').value.trim() });
			if (await Inv.save('Saved')) App.render();
		},
		'part-del': async (el) => {
			const p = Inv.part(el.dataset.id);
			Drawer.close();
			if (!(await confirmBox({ title: `Remove ${p.name}?`, body: p.orders.length ? `Its ${plural(p.orders.length, 'order')} go too, and stop counting in Money.` : '', ok: 'Remove', danger: true }))) return;
			const inv = Inv.get();
			inv.parts = inv.parts.filter((x) => x !== p);
			if (await Inv.save('Removed')) App.render();
		},
		'part-add': async () => {
			const name = await askBox({ title: 'Add a part', body: 'Something every calendar needs, like screws or a sticker.', label: 'Name', ok: 'Add' });
			if (!name) return;
			const p = { id: uid(), name, supplier: '', perUnit: 1, expect: 0, onHand: 0, url: '', notes: '', orders: [] };
			Inv.get().parts.push(p);
			if (await Inv.save()) { App.render(); view.openPart(p.id); }
		},
		'parts-build': async () => {
			const can = Inv.canBuild();
			const v = await askBox({ title: 'How many calendars did you build?', body: `This takes their parts out of stock. You have enough loose parts for ${can === Infinity ? 'any number' : can}.`, label: 'Calendars built', value: '1', ok: 'Take parts out' });
			if (v === null) return;
			const n = Number(v);
			if (!Number.isInteger(n) || n <= 0) return toast('That should be a whole number.', 'bad');
			const inv = Inv.get();
			const low = inv.parts.filter((p) => (+p.onHand || 0) < n * (+p.perUnit || 0));
			if (low.length && !(await confirmBox({ title: 'Not enough on hand', body: `${low.map((p) => p.name).join(', ')} would go below zero. Take them out anyway? They'll stop at 0.`, ok: 'Take out anyway' }))) return;
			for (const p of inv.parts) p.onHand = Math.max(0, (+p.onHand || 0) - n * (+p.perUnit || 0));
			inv.built = (+inv.built || 0) + n;
			if (await Inv.save(`${plural(n, 'calendar')} built. Parts taken out of stock.`)) App.render();
		},
	});
})();
