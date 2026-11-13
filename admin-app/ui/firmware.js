// Firmware: what each group of calendars runs, every version, and the three things firmware.bat did:
// release a new version, send beta to everyone, and move a group back or forward.
'use strict';
(() => {
	let loading = false, pulled = false;
	const fw = () => App.fw;
	const src = () => (fw()?.releases ? fw().releases : App.data.firmware); // the project folder if we have it, else the live site
	const onCh = (d, ch) => d.channels?.[ch]?.version || null;
	const sorted = (d) => [...(d.releases || [])].sort((a, b) => cmpVer(b.version, a.version));

	async function loadInfo(pull) {
		if (loading) return;
		loading = true;
		try {
			App.fw = await call('/api/fw/info' + (pull ? '?pull=1' : ''));
			pulled = pulled || pull;
		} catch (e) {
			toast(e.message, 'bad');
		}
		loading = false;
		if (App.view === 'firmware' && !Modal.isOpen()) App.render();
	}

	function checks() {
		const r = fw()?.repo;
		if (!r) return html`<div class="dim">Checking this PC…</div>`;
		const item = (ok, good, bad) => tone(ok ? 'good' : 'bad', ok ? good : bad);
		return html`<div class="checks">${item(r.ok, 'Project folder found', 'Project folder not found')}${r.ok ? item(r.branch === 'main', 'On main', `On branch "${r.branch}", not main`) : ''}${item(r.git, 'Git', 'Git not found')}${item(r.node, 'Node.js', 'Node.js not found')}${item(r.key, 'Signing key', 'Signing key not on this PC')}</div>
			${r.ok ? html`<div class="dim mono" style="margin-top:8px;font-size:12.5px">${r.path}</div>` : html`<div class="note warn" style="margin-top:12px">${icon('alert')}<div>Releases run from your designedbykoda project folder. <button class="link" data-act="nav" data-view="settings">Set it in Settings</button>. You can still see everything here without it.</div></div>`}
			${r.dirty ? html`<div class="note warn" style="margin-top:12px">${icon('alert')}<div>There are firmware changes in the project folder that haven't been pushed:<div class="mono">${r.dirty}</div></div></div>` : ''}
			${r.pulled ? html`<div class="note warn" style="margin-top:12px">${icon('alert')}<div>Couldn't get the latest from GitHub: ${r.pulled}</div></div>` : ''}`;
	}
	const ready = () => { const r = fw()?.repo; return !!(r && r.ok && r.git && r.node && r.branch === 'main'); };

	const view = (App.views.firmware = {
		enter() { loadInfo(!pulled); },
		render() {
			if (!App.fw && !loading) loadInfo(!pulled);
			const d = src(), live = App.data.firmware, devs = App.data.devices;
			const s = onCh(d, 'stable'), b = onCh(d, 'beta');
			const betaAhead = b && (!s || cmpVer(b, s) > 0);
			const differs = fw()?.releases && (onCh(live, 'stable') !== s || onCh(live, 'beta') !== b);
			const card = (ch, name, blurb) => {
				const v = onCh(d, ch), auto = d.channels?.[ch]?.auto, list = devs.filter((x) => x.channel === ch), ok = list.filter((x) => x.firmware === v).length;
				return html`<div class="card"><h3>${name}<span class="more muted">${blurb}</span></h3>
					<div class="big">${v || '–'}</div>
					<div class="muted" style="margin-top:8px">${v ? (auto ? 'Installs by itself on the next wake' : 'Only when someone clicks Update now') : 'Nothing sent yet'}</div>
					<div class="bar-cell" style="margin-top:14px" data-tip="${ok} of ${list.length} calendars are on ${v || 'it'}"><span class="track" style="flex:1;width:auto"><i style="width:${list.length ? (ok / list.length) * 100 : 0}%"></i></span><span class="muted nowrap">${ok} of ${plural(list.length, 'calendar')} on it</span></div></div>`;
			};
			const countOn = (v) => devs.filter((x) => x.firmware === v).length;
			return html`
			<div class="head"><div><h1>Firmware</h1><div class="sub">${d.releases?.length ? `Newest is ${sorted(d)[0].version}` : 'No versions yet'}${differs ? '. The site is still deploying the last change' : ''}</div></div>
				<div class="tools">
					<button class="btn" data-act="fw-move" ${ready() && d.releases?.length > 1 ? '' : raw('disabled')}>Change version</button>
					<button class="btn" data-act="fw-promote" ${ready() && betaAhead ? '' : raw('disabled')} data-tip="${betaAhead ? `Send ${b} to everyone` : "Beta isn't ahead of everyone"}">Send beta to everyone</button>
					<button class="btn primary" data-act="fw-release" ${ready() ? '' : raw('disabled')}>${icon('plus', 15)}Release a new version</button>
				</div></div>
			<div class="grid g2">${card('stable', 'Everyone', 'every calendar')}${card('beta', 'Beta', 'your own test calendars')}</div>
			<div class="card" style="margin-top:14px;padding:18px 6px 6px"><h3 style="padding:0 12px">Every version</h3>
				${d.releases?.length ? html`<table class="table"><thead><tr><th>Version</th><th>Date</th><th>Size</th><th>What's new</th><th>Sent to</th><th class="right">Calendars on it</th></tr></thead><tbody>
				${sorted(d).map((r) => html`<tr><td><b class="mono">${r.version}</b></td><td class="nowrap muted">${r.date}</td><td class="nowrap muted">${mb(r.size)}</td><td>${r.notes || html`<span class="dim">no notes</span>`}</td>
					<td class="nowrap">${s === r.version ? html`<span class="tag" style="color:var(--fg)">everyone</span> ` : ''}${b === r.version ? html`<span class="tag">beta</span>` : ''}${s !== r.version && b !== r.version ? html`<span class="dim">–</span>` : ''}</td>
					<td class="right">${countOn(r.version)}</td></tr>`)}</tbody></table>` : html`<div class="empty">No versions yet.</div>`}</div>
			<div class="card" style="margin-top:14px"><h3>This PC<button class="link more" data-act="fw-recheck">Check again</button></h3>${checks()}</div>`;
		},
		releaseWizard() { App.actions['fw-release'](); },
	});

	// ---------------------------------------------------------------- running a job
	function showJob(first) {
		let timer = null, stopped = false;
		const draw = (j) => {
			Modal.update(html`<h2>${j.title}</h2>
				<div class="jobsteps">${j.steps.map((s) => html`<div class="${s.state}"><span class="st">${s.state === 'ok' ? icon('check', 13) : s.state === 'fail' ? icon('close', 13) : ''}</span><span>${s.name}${s.note && s.state !== 'ok' ? html`<small>${s.note}</small>` : ''}</span></div>`)}</div>
				${j.done ? html`<div class="note ${j.success ? '' : 'bad'}" style="margin-top:14px">${icon(j.success ? 'check' : 'alert')}<div><b>${j.message}</b></div></div>` : html`<p class="dim" style="font-size:13.5px">Keep this window open until it finishes.</p>`}
				${j.log.length ? html`<div class="log" id="job-log">${j.log.join('\n')}</div>` : ''}
				<div class="modal-foot"><button class="btn primary" data-act="modal-close" ${j.done ? '' : raw('disabled')}>${j.done ? 'Done' : 'Working…'}</button></div>`);
			const log = $('#job-log');
			if (log) log.scrollTop = log.scrollHeight;
		};
		Modal.open('', { wide: true, sticky: true, onClose: () => { stopped = true; clearTimeout(timer); loadInfo(false); App.load(false); } });
		draw(first);
		const poll = async () => {
			if (stopped) return;
			try {
				const j = await call('/api/fw/job');
				if (j.id) draw(j);
				if (j.done) return;
			} catch {}
			timer = setTimeout(poll, 800);
		};
		timer = setTimeout(poll, 500);
	}
	async function startJob(body) {
		try {
			showJob(await call('/api/fw/job', { body }));
		} catch (e) {
			toast(e.message, 'bad');
		}
	}

	const pickBtn = (on, act, val, title, sub) => html`<button class="${on ? 'on' : ''}" data-act="${act}" data-val="${val}"><span class="radio"></span><span><b>${title}</b>${sub ? html`<small>${sub}</small>` : ''}</span></button>`;

	// ---------------------------------------------------------------- release a new version
	Object.assign(App.actions, {
		'fw-recheck': () => { App.fw = null; loadInfo(true); App.render(); },
		'fw-release': async () => {
			if (!fw()) await loadInfo(true);
			if (!ready()) return toast('Set the project folder in Settings first.', 'bad');
			const d = src(), latest = sorted(d)[0]?.version || '1.0.0';
			const W = { file: null, version: '', notes: '', everyone: false, manual: false, busy: false };
			const last = fw().lastExport;
			const useFile = (f) => { W.file = f; W.version = f.suggest || W.version; draw(); };
			const draw = () => {
				const f = W.file, old = f && f.modified && nowSec() - f.modified > 3600;
				Modal.update(html`<h2>Release a new version</h2>
					<p class="muted">In Arduino: set <b>FW_VERSION</b>, then <b>Sketch &gt; Export Compiled Binary</b>. Latest released is ${latest}.</p>
					${f ? html`<div class="note ${!f.isImage || !f.marker ? 'bad' : old ? 'warn' : ''}" style="margin-top:14px">${icon(!f.isImage || !f.marker || old ? 'alert' : 'check')}<div style="min-width:0"><b>${f.name || f.path.split(/[\\/]/).pop()}</b> · ${mb(f.size)}${f.modified ? ` · exported ${ago(f.modified)}` : ''}${f.detected ? ` · says it's ${f.detected}` : ''}
						${!f.isImage ? html`<br>This isn't an ESP32 app image. Use main_partial.ino.bin, not the merged or bootloader one.` : !f.marker ? html`<br>This build can't update itself again (no OTA marker), so it must never be sent.` : old ? html`<br>That export is over an hour old. Make sure it's the build you mean.` : ''}
						<br><button class="link" data-act="fw-w-clear">Use a different file</button></div></div>`
					: html`${last?.exists ? html`<div class="pick" style="margin-top:14px"><button data-act="fw-w-last"><span class="radio"></span><span style="min-width:0"><b>Use the last export</b><small class="mono" style="overflow-wrap:anywhere">${last.path}</small><small>${mb(last.size)} · exported ${ago(last.modified)}${last.detected ? ` · says it's ${last.detected}` : ''}</small></span></button></div>` : ''}
						<div class="drop" id="fw-drop">Drop <b>main_partial.ino.bin</b> here, or <button class="link" data-act="fw-w-browse">choose a file</button><input type="file" id="fw-file" accept=".bin" hidden></div>`}
					<div class="grid g2" style="gap:12px"><label class="field"><span>Version number</span><input id="fw-ver" value="${W.version}" placeholder="like ${latest.replace(/\d+$/, (n) => +n + 1)}" autocomplete="off" spellcheck="false"></label>
						<label class="field"><span>What's new</span><input id="fw-notes" value="${W.notes}" placeholder="Shown on the dashboard" autocomplete="off"></label></div>
					<div class="grid g2" style="gap:12px;margin-top:14px">
						<div><div class="field" style="margin:0"><span>Who gets it</span></div><div class="pick">${pickBtn(!W.everyone, 'fw-w-who', '', 'Beta only', 'your test calendars first')}${pickBtn(W.everyone, 'fw-w-who', '1', 'Everyone', 'every calendar')}</div></div>
						<div><div class="field" style="margin:0"><span>When</span></div><div class="pick">${pickBtn(!W.manual, 'fw-w-when', '', 'On the next wake', 'midnight or a button press')}${pickBtn(W.manual, 'fw-w-when', '1', 'Update now only', 'when someone clicks it')}</div></div>
					</div>
					<div class="modal-foot"><button class="btn" data-act="modal-close">Cancel</button><button class="btn primary" data-act="fw-w-go" ${f && f.isImage && f.marker && !W.busy ? '' : raw('disabled')}>Release${W.version ? ' ' + W.version : ''}</button></div>`);
				const drop = $('#fw-drop');
				if (drop) {
					drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
					drop.ondragleave = () => drop.classList.remove('over');
					drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) upload(e.dataTransfer.files[0]); };
					$('#fw-file').onchange = (e) => { if (e.target.files[0]) upload(e.target.files[0]); };
				}
				$('#fw-ver').oninput = (e) => { W.version = e.target.value.trim(); const b = $('[data-act="fw-w-go"]'); if (b) b.lastChild.textContent = 'Release' + (W.version ? ' ' + W.version : ''); };
				$('#fw-notes').oninput = (e) => { W.notes = e.target.value; };
			};
			const upload = async (file) => {
				if (file.size > 8 * 1024 * 1024) return toast('That file is too big to be the firmware.', 'bad');
				try {
					const r = await call('/api/fw/upload', { body: await file.arrayBuffer(), rawBody: true });
					useFile({ ...r.file, name: file.name, modified: Math.floor(file.lastModified / 1000) });
				} catch (e) { toast(e.message, 'bad'); }
			};
			Object.assign(App.actions, {
				'fw-w-last': () => useFile(last),
				'fw-w-clear': () => { W.file = null; draw(); },
				'fw-w-browse': () => $('#fw-file').click(),
				'fw-w-who': (el) => { W.everyone = !!el.dataset.val; draw(); },
				'fw-w-when': (el) => { W.manual = !!el.dataset.val; draw(); },
				'fw-w-go': async () => {
					if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(W.version)) return toast('The version should look like 1.0.4.', 'bad');
					if ((d.releases || []).some((r) => r.version === W.version)) return toast(`${W.version} already exists. Pick a new number.`, 'bad');
					if (cmpVer(W.version, latest) <= 0 && !(await confirmBox({ title: `${W.version} is older than ${latest}`, body: 'Release it anyway?', ok: 'Release' }))) return reopen();
					if (W.everyone && !(await confirmBox({ title: `Send ${W.version} straight to everyone?`, body: 'It skips testing on your beta calendars first.', ok: 'Send to everyone' }))) return reopen();
					startJob({ kind: 'release', file: W.file.path, version: W.version, notes: W.notes, everyone: W.everyone, manual: W.manual });
				},
			});
			const reopen = () => { Modal.open('', { wide: true }); draw(); };
			reopen();
		},

		// -------------------------------------------------------------- beta to everyone
		'fw-promote': () => {
			const d = src(), b = onCh(d, 'beta'), s = onCh(d, 'stable');
			let manual = false;
			const draw = () => Modal.update(html`<h2>Send ${b} to everyone?</h2><p class="muted">Everyone is on ${s || 'nothing yet'}. Beta calendars are already running ${b}.</p>
				<div class="pick" style="margin-top:14px">${pickBtn(!manual, 'fw-p-when', '', 'On their next wake', 'midnight or a button press')}${pickBtn(manual, 'fw-p-when', '1', 'Update now only', 'when someone clicks it')}</div>
				<div class="modal-foot"><button class="btn" data-act="modal-close">Cancel</button><button class="btn primary" data-act="fw-p-go">Send to everyone</button></div>`);
			App.actions['fw-p-when'] = (el) => { manual = !!el.dataset.val; draw(); };
			App.actions['fw-p-go'] = () => startJob({ kind: 'promote', manual });
			Modal.open('');
			draw();
		},

		// -------------------------------------------------------------- back or forward
		'fw-move': () => {
			const d = src();
			let ch = 'stable', pick = null;
			const draw = () => {
				const cur = onCh(d, ch), others = sorted(d).filter((r) => r.version !== cur).slice(0, 8);
				const back = pick && cur && cmpVer(pick, cur) < 0;
				Modal.update(html`<h2>Change version</h2><p class="muted">Move calendars to any version already added: back if a release has a problem, or forward again afterwards. They change on their next wake.</p>
					<div class="field"><span>Which calendars</span></div><div class="pick" style="grid-template-columns:1fr 1fr">${pickBtn(ch === 'stable', 'fw-m-ch', 'stable', 'Everyone', `on ${onCh(d, 'stable') || 'nothing'}`)}${pickBtn(ch === 'beta', 'fw-m-ch', 'beta', 'Only beta', `on ${onCh(d, 'beta') || 'nothing'}`)}</div>
					<div class="field"><span>Move them to</span></div><div class="pick">${others.map((r) => pickBtn(pick === r.version, 'fw-m-pick', r.version, html`${r.version} <span class="tag">${!cur ? 'send' : cmpVer(r.version, cur) > 0 ? 'forward' : 'back'}</span>`, `${r.date}${r.notes ? ' · ' + r.notes : ''}`))}</div>
					${ch === 'stable' && back ? html`<div class="note warn" style="margin-top:14px">${icon('alert')}<div>Beta calendars go back to ${pick} too, so they are never ahead on a version you pulled.</div></div>` : ''}
					<div class="modal-foot"><button class="btn" data-act="modal-close">Cancel</button><button class="btn primary ${back ? 'danger' : ''}" data-act="fw-m-go" ${pick ? '' : raw('disabled')}>${pick ? `Move ${ch === 'stable' ? 'everyone' : 'beta'} ${back ? 'back' : 'forward'} to ${pick}` : 'Pick a version'}</button></div>`);
			};
			App.actions['fw-m-ch'] = (el) => { ch = el.dataset.val; pick = null; draw(); };
			App.actions['fw-m-pick'] = (el) => { pick = el.dataset.val; draw(); };
			App.actions['fw-m-go'] = () => startJob({ kind: 'move', channel: ch, version: pick });
			Modal.open('', { wide: true });
			draw();
		},
	});
})();
