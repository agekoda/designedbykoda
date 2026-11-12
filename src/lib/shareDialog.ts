// The Share dialog for a saved design (layout builder and Customize display): creates the link
// if needed, shows it with Copy, and offers Stop sharing. Returns the token afterwards (null if
// the design isn't shared any more), or undefined if nothing changed or it failed.
import { ask, closeDialog } from './dialog';

export async function shareDialog(o: { deviceId: string; designId: string; name: string; token: string | null; hasWifi: boolean; dirtyNote?: boolean; onError: (m: string) => void }): Promise<string | null | undefined> {
	let token = o.token;
	const post = async (extra: object) => {
		const r = await fetch('/api/dashboard/builder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId: o.deviceId, action: 'share', designId: o.designId, ...extra }) });
		const d = await r.json().catch(() => ({}));
		return r.ok ? d : { error: d.error || 'Something went wrong. Try again.' };
	};
	let created = false;
	if (!token) {
		const intro = document.createElement('div');
		intro.innerHTML =
			'<p class="x-dlg-text">Anyone with the link can see this design and add a copy to their own calendar. They can’t change yours, and they never see your events, messages or photos.</p>' +
			(o.hasWifi ? '<p class="x-dlg-text">Your Wi-Fi name and password are left out of the QR code.</p>' : '');
		const lead = o.dirtyNote ? 'The link shows your last saved version, so save first if you want your latest changes in it.' : '';
		if (!(await ask(lead, { title: `Share "${o.name}"`, ok: 'Create link', body: intro }))) return undefined;
		const d = await post({});
		if (!d.token) {
			o.onError(d.error || 'Couldn’t create the link. Try again.');
			return undefined;
		}
		token = d.token as string;
		created = true;
	}
	const url = location.origin + '/d/' + token;
	const body = document.createElement('div');
	body.className = 'dz-share';
	body.innerHTML =
		'<div class="dz-link"><input class="x-dlg-field" readonly aria-label="Link" /><button type="button" class="dz-copy" data-act="copy">Copy</button></div>' +
		'<p class="x-dlg-text">Saving the design updates what the link shows.</p>' +
		'<div class="dz-btns"><a class="dz-btn" target="_blank" rel="noopener">Open it</a><button type="button" class="dz-btn danger" data-act="stop">Stop sharing</button></div>';
	const inp = body.querySelector('input')!;
	inp.value = url;
	(body.querySelector('a') as HTMLAnchorElement).href = url;
	let stop = false;
	body.addEventListener('click', async (e) => {
		const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
		if (!b) return;
		if (b.dataset.act === 'copy') {
			try {
				await navigator.clipboard.writeText(url);
				b.textContent = 'Copied';
			} catch {
				inp.select();
			}
		} else if (b.dataset.act === 'stop') {
			stop = true;
			closeDialog();
		}
	});
	setTimeout(() => inp.select(), 30);
	await ask('Anyone with this link can see the design and copy it.', { title: `Share "${o.name}"`, ok: 'Done', cancel: null, body });
	if (!stop) return created ? token : undefined;
	if (!(await ask('The link stops working. Copies people already made stay theirs.', { title: 'Stop sharing?', ok: 'Stop sharing', danger: true }))) return created ? token : undefined;
	const d = await post({ stop: true });
	if (d.error) {
		o.onError('Couldn’t stop sharing. Try again.');
		return created ? token : undefined;
	}
	return null;
}
