// Orders: a table or a drag-and-drop board, a side panel for one order, bulk changes, ship mode, CSVs.
'use strict';
(() => {
	const S = { status: 'all', q: '', mode: App.prefs.get('ordersMode', 'table'), picked: new Set(), dirty: false };
	const addressText = (o) => [o.name, o.addr.line1, o.addr.line2, [o.addr.city, o.addr.state, o.addr.postcode].filter(Boolean).join(' '), o.country === 'AU' ? '' : country(o.country)].filter(Boolean).join('\n');
	const byId = (id) => App.data.orders.find((o) => o.id === id);
	const matches = (o) => {
		if (S.status === 'todo' ? !['ordered', 'making', 'ready'].includes(o.status) : S.status !== 'all' && o.status !== S.status) return false;
		const q = S.q.trim().toLowerCase();
		return !q || [o.number, o.name, o.email, o.phone, o.tracking, o.addr.city, o.addr.postcode, country(o.country), o.adminNote].some((f) => String(f || '').toLowerCase().includes(q));
	};
	const shown = () => App.data.orders.filter(matches);

	async function save(ids, patch, done) {
		try {
			await site('/api/admin/orders', { ids, ...patch });
			if (done) toast(done, 'good');
			await App.load(false);
			return true;
		} catch (e) {
			toast(e.message, 'bad');
			return false;
		}
	}
	async function setStatus(ids, st) {
		const many = ids.length > 1, label = STATUS[st].label;
		if (st === 'cancelled' && !(await confirmBox({ title: many ? `Cancel ${ids.length} orders?` : 'Cancel this order?', body: "This only changes the status here. Refund the payment in Stripe yourself.", ok: 'Cancel order', danger: true, cancel: 'Keep' }))) return false;
		if (st === 'shipped') {
			const bare = ids.map(byId).filter((o) => o && !o.tracking);
			if (bare.length && !(await confirmBox({ title: 'Mark as shipped without tracking?', body: `${many ? `${bare.length} of these have` : 'This order has'} no tracking number, so the buyer won't get the "on its way" email until you add one.`, ok: 'Mark shipped' }))) return false;
		}
		return save(ids, { status: st }, many ? `${ids.length} orders: ${label}` : label);
	}

	const view = (App.views.orders = {
		enter(opts) {
			if (opts?.status) { S.status = opts.status; S.q = ''; }
			S.picked.clear();
		},
		render() {
			const d = App.data, n = (st) => d.orders.filter((o) => o.status === st).length;
			const todo = n('ordered') + n('making') + n('ready');
			const chip = (key, label, count, color) => html`<button class="chip ${S.status === key ? 'on' : ''}" data-act="orders-status" data-st="${key}">${color ? html`<i style="background:${color}"></i>` : ''}${label} <b>${count}</b></button>`;
			return html`
			<div class="head"><div><h1>Orders</h1><div class="sub">${d.orders.length} in total, ${todo} still to ship</div></div>
				<div class="tools">
					<label class="search">${icon('search', 16)}<input id="orders-q" placeholder="Name, email, order number…" value="${S.q}" data-input="orders-q" autocomplete="off" spellcheck="false"></label>
					<div class="seg"><button class="${S.mode === 'table' ? 'on' : ''}" data-act="orders-mode" data-mode="table">${icon('list', 15)}Table</button><button class="${S.mode === 'board' ? 'on' : ''}" data-act="orders-mode" data-mode="board">${icon('board', 15)}Board</button></div>
					<button class="btn" data-act="orders-export">${icon('down', 15)}Export</button>
					<button class="btn primary" data-act="ship-mode">${icon('truck', 15)}Ship mode</button>
				</div></div>
			<div class="chips" style="margin-bottom:14px">${chip('all', 'All', d.orders.length)}${chip('todo', 'To ship', todo)}${STATUS_KEYS.map((k) => chip(k, STATUS[k].label, n(k), STATUS[k].color))}</div>
			<div id="orders-list">${this.list()}</div>`;
		},
		list() {
			const rows = shown();
			if (!App.data.orders.length) return html`<div class="card empty">No orders yet. They appear here the moment someone pays.</div>`;
			if (S.mode === 'board') return this.board();
			if (!rows.length) return html`<div class="card empty">No orders match.</div>`;
			const all = rows.length && rows.every((o) => S.picked.has(o.id));
			return html`<div class="card" style="padding:14px 6px 6px"><table class="table">
				<thead><tr><th class="check"><input type="checkbox" data-change="orders-pick-all" ${all ? raw('checked') : ''}></th><th>Order</th><th>Buyer</th><th>Going to</th><th class="right">Paid</th><th>Status</th><th>Tracking</th></tr></thead>
				<tbody>${rows.map((o) => html`<tr class="click" data-act="order-open" data-id="${o.id}">
					<td class="check"><input type="checkbox" data-change="orders-pick" data-id="${o.id}" ${S.picked.has(o.id) ? raw('checked') : ''}></td>
					<td><b class="mono">${o.number}</b><div class="sub" data-tip="${dateTime(o.createdAt)}">${ago(o.createdAt)}</div></td>
					<td><div class="clip">${o.name || '–'}${o.adminNote ? html` <span class="tag" data-tip="Your note|${o.adminNote}">note</span>` : ''}</div><div class="sub clip">${o.email}</div></td>
					<td><div class="clip">${[o.addr.city, o.addr.state].filter(Boolean).join(', ') || '–'}</div><div class="sub">${country(o.country)}</div></td>
					<td class="right nowrap">${money(o.total, o.currency)}</td>
					<td>${pill(o.status)}</td>
					<td class="mono">${o.tracking || html`<span class="dim">–</span>`}</td></tr>`)}</tbody></table></div>
				${S.picked.size ? html`<div class="bulk"><b>${S.picked.size} selected</b><span class="grow"></span>
					<button class="btn small" data-act="orders-bulk-status">Set status</button>
					<button class="btn small" data-act="orders-bulk-auspost">${icon('down', 14)}AusPost CSV</button>
					<button class="btn small" data-act="orders-bulk-emails">${icon('copy', 14)}Copy emails</button>
					<button class="btn small ghost" data-act="orders-bulk-clear">Clear</button></div>` : ''}`;
		},
		board() {
			const cols = ['ordered', 'making', 'ready', 'shipped', 'delivered'];
			const q = S.q.trim() ? shown() : App.data.orders;
			return html`<div class="kanban">${cols.map((st) => {
				const list = q.filter((o) => o.status === st);
				return html`<div class="col" data-col="${st}"><h4>${pill(st)}<b>${list.length}</b></h4>
					${list.slice(0, 60).map((o) => html`<div class="kcard" draggable="true" data-id="${o.id}" data-act="order-open"><div class="top"><b>${o.name || o.email}</b><span class="mono dim">${o.number}</span></div>
						<div class="meta"><span>${o.addr.city || country(o.country)}${o.country && o.country !== 'AU' ? ', ' + o.country : ''}</span><span class="grow"></span><span>${st === 'shipped' ? (o.tracking ? 'posted ' + ago(o.shippedAt) : 'no tracking') : ago(o.createdAt)}</span></div></div>`)}
					${list.length > 60 ? html`<div class="dim" style="padding:4px">and ${list.length - 60} more (use the table)</div>` : ''}</div>`;
			})}</div><p class="dim" style="margin-top:10px;font-size:13.5px">Drag an order to another column to change its status.</p>`;
		},
		after() {
			// drag and drop on the board
			let dragId = null;
			$$('.kcard').forEach((c) => {
				c.addEventListener('dragstart', (e) => { dragId = c.dataset.id; c.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId); });
				c.addEventListener('dragend', () => { c.classList.remove('drag'); $$('.col.over').forEach((x) => x.classList.remove('over')); });
			});
			$$('.col').forEach((col) => {
				col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('over'); });
				col.addEventListener('dragleave', (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('over'); });
				col.addEventListener('drop', (e) => {
					e.preventDefault();
					col.classList.remove('over');
					const o = byId(dragId || e.dataTransfer.getData('text/plain'));
					if (o && o.status !== col.dataset.col) setStatus([o.id], col.dataset.col);
				});
			});
		},
		redrawList() {
			mount($('#orders-list'), this.list());
			this.after();
		},

		// ------------------------------------------------------------ one order
		openOrder(id) {
			if (App.view !== 'orders' && App.view !== 'overview') App.go('orders');
			S.dirty = false;
			const draw = () => {
				const o = byId(id);
				if (!o) return Drawer.close();
				const stripe = 'https://dashboard.stripe.com/' + (o.id.startsWith('cs_test_') ? 'test/' : '') + 'search?query=' + encodeURIComponent(o.id);
				Drawer.open(html`
				<button class="icon-btn x" data-act="drawer-close">${icon('close')}</button>
				<div class="dim mono">Order ${o.number}</div>
				<h2>${o.name || o.email}</h2>
				<div class="row wrap" style="margin-top:6px">${pill(o.status)}<span class="dim">·</span><span class="muted">${money(o.total, o.currency)}${o.shipping ? ` (${money(o.shipping, o.currency)} shipping)` : ''}</span><span class="dim">·</span><span class="muted" data-tip="${dateTime(o.createdAt)}">${ago(o.createdAt)}</span></div>

				<section><h3>Status</h3>
					<div class="steps-pick">${STATUS_KEYS.map((k) => html`<button class="chip ${o.status === k ? 'on' : ''}" data-act="order-status" data-id="${o.id}" data-st="${k}"><i style="background:${STATUS[k].color}"></i>${STATUS[k].label}</button>`)}</div>
					<div class="kv" style="margin-top:14px"><dt>Ordered</dt><dd>${dateTime(o.createdAt)}</dd>${o.shippedAt ? html`<dt>Posted</dt><dd>${dateTime(o.shippedAt)}</dd>` : ''}${o.deliveredAt ? html`<dt>Delivered</dt><dd>${dateTime(o.deliveredAt)}</dd>` : ''}<dt>Account</dt><dd>${o.linked ? 'Linked to their Google account' : html`<span class="muted">Not linked (they haven't signed in)</span>`}</dd></div></section>

				<section><h3>Send to</h3>
					<div class="addr">${addressText(o)}</div>
					<div class="row wrap" style="margin-top:10px"><button class="btn small" data-act="copy" data-text="${addressText(o)}" data-what="Address copied">${icon('copy', 14)}Copy address</button>
						<button class="btn small" data-act="copy" data-text="${o.email}" data-what="Email copied">${icon('copy', 14)}${o.email}</button>
						${o.phone ? html`<button class="btn small" data-act="copy" data-text="${o.phone}" data-what="Phone copied">${icon('copy', 14)}${o.phone}</button>` : ''}</div></section>

				<section><h3>Tracking and notes</h3>
					<label class="field" style="margin-top:0"><span>Tracking number</span><input id="o-track" value="${o.tracking || ''}" data-input="order-dirty" placeholder="From the AusPost label" autocomplete="off" spellcheck="false">
						<small>${o.tracking ? (o.shippedEmailAt ? `The on-its-way email went out ${ago(o.shippedEmailAt)}.` : '') : 'Saving the first tracking number marks it Shipped and emails the buyer.'}</small></label>
					<label class="field"><span>Note to the buyer</span><input id="o-cnote" value="${o.customerNote || ''}" data-input="order-dirty" placeholder="Shown on their tracking page" autocomplete="off"></label>
					<label class="field"><span>Private note</span><textarea id="o-anote" data-input="order-dirty" placeholder="Only you see this">${o.adminNote || ''}</textarea></label>
					<div class="row" style="margin-top:12px"><button class="btn primary" data-act="order-save" data-id="${o.id}">Save</button>${o.trackingUrl ? html`<button class="btn" data-act="open" data-url="${o.trackingUrl}">${icon('out', 15)}AusPost tracking</button>` : ''}</div></section>

				<section><h3>More</h3>
					<div class="row wrap">
						<button class="btn small" data-act="open" data-url="${App.local.site}/track?o=${o.id}">${icon('out', 14)}Their tracking page</button>
						<button class="btn small" data-act="open" data-url="${stripe}">${icon('out', 14)}Find in Stripe</button>
						<button class="btn small" data-act="open" data-url="mailto:${o.email}?subject=${encodeURIComponent('Your E-Ink Calendar order ' + o.number)}">${icon('mail', 14)}Email them</button>
						<button class="btn small" data-act="order-email" data-id="${o.id}" data-kind="receipt">Send receipt again</button>
						${o.tracking ? html`<button class="btn small" data-act="order-email" data-id="${o.id}" data-kind="shipped">Send on-its-way email again</button>` : ''}
						<button class="btn small" data-act="orders-one-auspost" data-id="${o.id}">${icon('down', 14)}AusPost CSV</button>
					</div>
					<div class="dim mono" style="margin-top:14px;font-size:12px;overflow-wrap:anywhere">${o.id}</div></section>`, 'order:' + id);
			};
			draw();
			Drawer.refresh = () => { if (Drawer.key === 'order:' + id && !S.dirty) { const y = $('.drawer')?.scrollTop; draw(); $('.drawer')?.classList.add('in'); if ($('.drawer')) $('.drawer').scrollTop = y; } };
		},

		// ------------------------------------------------------------ ship mode
		// Step through the orders that are ready: read the address, paste the tracking number, Enter.
		shipMode() {
			const queue = App.data.orders.filter((o) => o.status === 'ready').sort((a, b) => a.createdAt - b.createdAt).map((o) => o.id);
			let i = 0, sent = 0;
			if (!queue.length) {
				return Modal.open(html`<h2>Ship mode</h2><p class="muted">No orders are marked Ready to ship. Move the ones you've packed to Ready to ship first (drag them on the Board), then come back.</p><div class="modal-foot"><button class="btn primary" data-act="modal-close">OK</button></div>`);
			}
			const draw = () => {
				const o = byId(queue[i]);
				if (!o) {
					return Modal.update(html`<div class="ship"><div class="count">Ship mode</div><h2 style="margin-top:6px">${sent ? `${plural(sent, 'order')} shipped` : 'Nothing shipped'}</h2><p class="muted">${sent ? 'Each buyer has been emailed their tracking number.' : 'You skipped them all.'}</p><div class="modal-foot"><button class="btn primary" data-act="modal-close">Done</button></div></div>`);
				}
				Modal.update(html`<div class="ship"><div class="count">Ship mode · ${i + 1} of ${queue.length}</div>
					<div class="addr">${addressText(o)}</div>
					<div class="muted mono">Order ${o.number} · 1 × E-Ink Calendar${o.adminNote ? html` · <span style="color:var(--warn)">${o.adminNote}</span>` : ''}</div>
					<label class="field"><span>Tracking number</span><input id="ship-track" placeholder="Paste or scan it, then press Enter" autocomplete="off" spellcheck="false" autofocus></label>
					<div class="modal-foot"><button class="btn ghost" data-act="modal-close">Stop</button><button class="btn" id="ship-copy">${icon('copy', 14)}Copy address</button><button class="btn" id="ship-skip">Skip</button><button class="btn primary" id="ship-go">Shipped</button></div></div>`);
				const input = $('#ship-track');
				input.focus();
				const go = async () => {
					const t = input.value.trim();
					if (!t) return input.focus();
					$('#ship-go').disabled = true;
					if (await save([o.id], { tracking: t })) { sent++; i++; draw(); } else $('#ship-go').disabled = false;
				};
				input.onkeydown = (e) => { if (e.key === 'Enter') go(); };
				$('#ship-go').onclick = go;
				$('#ship-skip').onclick = () => { i++; draw(); };
				$('#ship-copy').onclick = () => copyText(addressText(o), 'Address copied');
			};
			Modal.open('', { wide: true, onClose: () => App.render() });
			draw();
		},

		async exportCsv(kind, ids) {
			try {
				const r = await call('/api/export', { body: { kind, ids: ids || [] } });
				if (kind === 'auspost' && !r.rows) return toast(ids?.length ? 'Nothing to export.' : 'No orders are marked Ready to ship, so the file would be empty.', 'bad');
				toast(`Saved ${plural(r.rows, 'order')} to ${r.path.split(/[\\/]/).pop()} in Downloads`, 'good', { label: 'Show file', run: () => call('/api/reveal', { body: { path: r.path } }) });
			} catch (e) {
				toast(e.message, 'bad');
			}
		},
	});

	Object.assign(App.actions, {
		'order-open': (el, e) => { if (e.target.closest('input[type=checkbox], .check')) return; view.openOrder(el.dataset.id); },
		'orders-status': (el) => { S.status = el.dataset.st; S.picked.clear(); App.render(); },
		'orders-q': (el) => { S.q = el.value; view.redrawList(); },
		'orders-mode': (el) => { S.mode = el.dataset.mode; App.prefs.set('ordersMode', S.mode); S.picked.clear(); App.render(); },
		'orders-pick': (el) => { el.checked ? S.picked.add(el.dataset.id) : S.picked.delete(el.dataset.id); view.redrawList(); },
		'orders-pick-all': (el) => { shown().forEach((o) => (el.checked ? S.picked.add(o.id) : S.picked.delete(o.id))); view.redrawList(); },
		'orders-bulk-clear': () => { S.picked.clear(); view.redrawList(); },
		'orders-bulk-status': (el) => menu(el, STATUS_KEYS.map((k) => ({ label: STATUS[k].label, dot: STATUS[k].color, run: async () => { if (await setStatus([...S.picked], k)) { S.picked.clear(); App.render(); } } }))),
		'orders-bulk-auspost': () => view.exportCsv('auspost', [...S.picked]),
		'orders-bulk-emails': () => copyText([...S.picked].map((id) => byId(id)?.email).filter(Boolean).join(', '), `${S.picked.size} emails copied`),
		'orders-one-auspost': (el) => view.exportCsv('auspost', [el.dataset.id]),
		'orders-export': (el) => menu(el, [
			{ label: 'AusPost CSV: orders ready to ship', run: () => view.exportCsv('auspost') },
			{ label: 'All orders (easy to read)', run: () => view.exportCsv('orders') },
			{ label: 'Open MyPost Business', run: () => openLink('https://auspost.com.au/mypost-business') },
		]),
		'ship-mode': () => view.shipMode(),
		'order-dirty': () => { S.dirty = true; },
		'order-status': (el) => { if (byId(el.dataset.id)?.status !== el.dataset.st) setStatus([el.dataset.id], el.dataset.st); },
		'order-save': async (el) => {
			const o = byId(el.dataset.id);
			const patch = { tracking: $('#o-track').value, customer_note: $('#o-cnote').value, admin_note: $('#o-anote').value };
			const first = patch.tracking.trim() && !o.tracking && ['ordered', 'making', 'ready'].includes(o.status);
			S.dirty = false;
			await save([o.id], patch, first ? 'Saved. Marked shipped and the buyer was emailed.' : 'Saved');
		},
		'order-email': async (el) => {
			const o = byId(el.dataset.id), what = el.dataset.kind === 'shipped' ? 'on-its-way email' : 'receipt';
			if (!(await confirmBox({ title: `Send the ${what} again?`, body: `It goes to ${o.email}.`, ok: 'Send' }))) return;
			try {
				await site('/api/admin/app/email', { id: o.id, kind: el.dataset.kind });
				toast(`Sent to ${o.email}`, 'good');
			} catch (e) {
				toast(e.message, 'bad');
			}
		},
	});
})();
