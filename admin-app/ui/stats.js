// Press stats: the follower and view numbers on the site's Press & Brands page (/stats).
'use strict';
(() => {
	const FIELDS = [
		['YouTube', [['YOUTUBE_SUBSCRIBERS', 'Subscribers'], ['YOUTUBE_VIEWS', 'Total views']]],
		['TikTok', [['TIKTOK_FOLLOWERS', 'Followers'], ['TIKTOK_VIEWS', 'Total views']]],
		['Instagram', [['INSTAGRAM_FOLLOWERS', 'Followers'], ['INSTAGRAM_VIEWS', 'Total views']]],
	];
	let draft = null; // what's typed but not saved yet
	const short = (raw) => {
		const n = Number(String(raw).replace(/[,\s]/g, ''));
		if (!raw || isNaN(n)) return '–';
		if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
		if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
		return n.toLocaleString();
	};
	const today = () => new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());
	const vals = () => draft || App.data.stats || {};
	const changed = () => !!draft && Object.keys(draft).some((k) => k !== 'STATS_LAST_UPDATED' && String(draft[k]).replace(/[,\s]/g, '') !== String((App.data.stats || {})[k] ?? ''));

	App.views.stats = {
		render() {
			const v = vals(), saved = App.data.stats || {};
			const input = (key, label) => html`<label class="field"><span>${label}</span><input id="st-${key}" value="${v[key] ?? ''}" data-input="stats-type" data-key="${key}" inputmode="numeric" autocomplete="off" spellcheck="false">
				<small id="sh-${key}">Shows as ${short(v[key])}${saved[key] && String(v[key]).replace(/[,\s]/g, '') !== String(saved[key]) ? ` (was ${short(saved[key])})` : ''}</small></label>`;
			return html`
			<div class="head"><div><h1>Press stats</h1><div class="sub">The numbers on your Press &amp; Brands page. Last updated ${saved.STATS_LAST_UPDATED || 'never'}.</div></div>
				<div class="tools"><button class="btn" data-act="open" data-url="${App.local.site}/stats">${icon('out', 15)}Open the page</button>
					<button class="btn primary" data-act="stats-save" id="stats-save" ${changed() ? '' : raw('disabled')}>Save</button></div></div>
			<div class="grid g3">${FIELDS.map(([name, fields]) => html`<div class="card"><h3>${name}</h3><div style="margin-top:-8px">${fields.map(([k, l]) => input(k, l))}</div></div>`)}</div>
			<div class="grid g2" style="margin-top:14px">
				<div class="card"><h3>The big number</h3><div style="margin-top:-8px">${input('TOTAL_VIEWERS_REACHED', 'Total viewers reached')}</div>
					<p class="dim" style="font-size:13.5px;margin-top:10px">The three view counts add up to <b id="st-sum" style="color:var(--muted)">${sum(v).toLocaleString()}</b>. <button class="link" data-act="stats-use-sum">Use that</button></p></div>
				<div class="card"><h3>How it works</h3><p class="muted" style="font-size:14.5px">Saving changes the page straight away, with no deploy. The "last updated" date on the page becomes today (${today()}). Type full numbers, like 2270 or 1,500,000: the page shortens them itself.</p></div>
			</div>`;
		},
	};
	const sum = (v) => ['YOUTUBE_VIEWS', 'TIKTOK_VIEWS', 'INSTAGRAM_VIEWS'].reduce((s, k) => s + (Number(String(v[k] ?? '').replace(/[,\s]/g, '')) || 0), 0);
	const touch = () => {
		const b = $('#stats-save');
		if (b) b.disabled = !changed();
		if ($('#st-sum')) $('#st-sum').textContent = sum(vals()).toLocaleString();
	};
	Object.assign(App.actions, {
		'stats-type': (el) => {
			draft = draft || { ...(App.data.stats || {}) };
			draft[el.dataset.key] = el.value;
			const s = $('#sh-' + el.dataset.key), was = (App.data.stats || {})[el.dataset.key];
			if (s) s.textContent = `Shows as ${short(el.value)}${was && el.value.replace(/[,\s]/g, '') !== String(was) ? ` (was ${short(was)})` : ''}`;
			touch();
		},
		'stats-use-sum': () => {
			draft = draft || { ...(App.data.stats || {}) };
			draft.TOTAL_VIEWERS_REACHED = String(sum(draft));
			App.render();
		},
		'stats-save': async () => {
			const values = {};
			for (const k of Object.keys(draft)) if (k !== 'STATS_LAST_UPDATED') values[k] = String(draft[k]).replace(/[,\s]/g, '');
			if (Object.values(values).some((x) => !/^\d{1,12}$/.test(x))) return toast('Each number should be whole, like 2270.', 'bad');
			values.STATS_LAST_UPDATED = today();
			try {
				const r = await site('/api/admin/app/stats', { values });
				App.data.stats = r.stats;
				draft = null;
				toast('Saved. The page shows the new numbers now.', 'good', { label: 'Open', run: () => openLink(App.local.site + '/stats') });
				App.render();
			} catch (e) {
				toast(e.message, 'bad');
			}
		},
	});
})();
