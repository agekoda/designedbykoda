// Settings: sign-in, which site and project folder, refresh and sound, and handy links.
'use strict';
(() => {
	const LINKS = [
		['Cloudflare', 'https://dash.cloudflare.com/'], ['Stripe', 'https://dashboard.stripe.com/'], ['Brevo', 'https://app.brevo.com/'],
		['GitHub', 'https://github.com/agekoda/designedbykoda'], ['MyPost Business', 'https://auspost.com.au/mypost-business'], ['Owner page on the site', '/admin'],
	];
	App.views.settings = {
		render() {
			const l = App.local, r = App.fw?.repo || l.repo || {};
			const every = App.prefs.get('every', 60), sound = App.prefs.get('sound', true);
			return html`
			<div class="head"><div><h1>Settings</h1><div class="sub">designedbykoda admin ${l.version}</div></div></div>
			<div class="grid g2">
				<div class="card"><h3>Sign-in</h3>
					<p>Signed in to <b>${l.site.replace(/^https?:\/\//, '')}</b> until ${date(l.signedInUntil)}.</p>
					<p class="muted" style="margin-top:6px;font-size:14px">This PC keeps a sign-in token, not your password.</p>
					<div class="row" style="margin-top:14px"><button class="btn" data-act="signout">Sign out</button></div></div>
				<div class="card"><h3>While it's open</h3>
					<div class="field" style="margin-top:0"><span>Check for changes every</span></div>
					<div class="seg" style="margin-top:6px">${[[30, '30 s'], [60, '1 min'], [300, '5 min']].map(([v, label]) => html`<button class="${every === v ? 'on' : ''}" data-act="set-every" data-val="${v}">${label}</button>`)}</div>
					<div class="field"><span>New order sound</span></div>
					<div class="seg" style="margin-top:6px"><button class="${sound ? 'on' : ''}" data-act="set-sound" data-val="1">On</button><button class="${sound ? '' : 'on'}" data-act="set-sound" data-val="">Off</button></div></div>
				<div class="card"><h3>Project folder</h3>
					<p class="muted" style="font-size:14px">Your designedbykoda folder (the one with firmware.bat in it). Firmware releases run from here.</p>
					<label class="field"><span>Folder</span><input id="set-repo" value="${r.path || ''}" placeholder="C:\\Users\\you\\Documents\\GitHub\\designedbykoda" autocomplete="off" spellcheck="false"></label>
					<div class="row" style="margin-top:12px"><button class="btn primary" data-act="set-repo-save">Save</button>${r.ok ? tone('good', 'Found') : tone('bad', 'Not found yet')}</div></div>
				<div class="card"><h3>Site address</h3>
					<p class="muted" style="font-size:14px">Leave this alone unless the site moves. Changing it signs you out.</p>
					<label class="field"><span>Address</span><input id="set-site" value="${l.site}" autocomplete="off" spellcheck="false"></label>
					<div class="row" style="margin-top:12px"><button class="btn" data-act="set-site-save">Save</button></div></div>
				<div class="card" style="grid-column:1/-1"><h3>Quick links</h3><div class="row wrap">${LINKS.map(([name, url]) => html`<button class="btn" data-act="open" data-url="${url.startsWith('/') ? l.site + url : url}">${icon('out', 15)}${name}</button>`)}</div></div>
			</div>`;
		},
	};
	const saveSetting = async (body, done) => {
		try {
			await call('/api/settings', { body });
			App.local = await call('/api/state');
			App.fw = null;
			toast(done, 'good');
			App.render();
			if (App.local.signedIn) App.load(false);
		} catch (e) { toast(e.message, 'bad'); }
	};
	Object.assign(App.actions, {
		signout: async () => { await call('/api/logout', { body: {} }).catch(() => {}); App.local.signedIn = false; App.data = null; App.render(); },
		'set-every': (el) => { App.prefs.set('every', +el.dataset.val); toast('Takes effect the next time you open the app.'); App.render(); },
		'set-sound': (el) => { App.prefs.set('sound', !!el.dataset.val); App.render(); },
		'set-repo-save': () => saveSetting({ repo: $('#set-repo').value }, 'Project folder saved'),
		'set-site-save': () => saveSetting({ site: $('#set-site').value }, 'Site address saved'),
	});
})();
