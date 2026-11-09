// In-page replacements for the browser's confirm(), alert() and prompt(). The browser's own
// popups freeze the page while they're open, so the site's custom cursor stops following the
// mouse, and the real cursor is hidden: you're left with no cursor at all. These are ordinary
// page elements, so the custom cursor keeps working, and they match the site.
//
//   if (!(await ask('Turn the link off?', { ok: 'Turn it off', danger: true }))) return;
//   await tell('Could not start checkout.');
//   await showCopy('Copy this link:', url);

interface AskOpts {
	title?: string;
	ok?: string;
	cancel?: string | null; // null = no cancel button (an alert)
	danger?: boolean; // the OK button is red (deleting, turning something off)
	copy?: string; // show this text, selected, in a box (for copying by hand)
	body?: HTMLElement; // extra controls under the text (the caller reads them after)
}

let current: (() => void) | null = null;
// Closes the open dialog as if Cancel was pressed (for buttons inside a dialog's body).
export const closeDialog = () => current?.();

export function ask(text: string, o: AskOpts = {}): Promise<boolean> {
	current?.(); // only one at a time
	return new Promise((resolve) => {
		const prevFocus = document.activeElement as HTMLElement | null;
		const back = document.createElement('div');
		back.className = 'x-dlg-back';
		const box = document.createElement('div');
		box.className = 'x-dlg';
		box.setAttribute('role', o.cancel === null ? 'alertdialog' : 'dialog');
		box.setAttribute('aria-modal', 'true');
		if (o.title) {
			const h = document.createElement('div');
			h.className = 'x-dlg-title';
			h.textContent = o.title;
			box.appendChild(h);
		}
		const p = document.createElement('p');
		p.className = 'x-dlg-text';
		p.textContent = text;
		box.appendChild(p);
		if (o.body) box.appendChild(o.body);
		let field: HTMLInputElement | null = null;
		if (o.copy !== undefined) {
			field = document.createElement('input');
			field.className = 'x-dlg-field';
			field.readOnly = true;
			field.value = o.copy;
			box.appendChild(field);
		}
		const row = document.createElement('div');
		row.className = 'x-dlg-row';
		const okBtn = document.createElement('button');
		okBtn.type = 'button';
		okBtn.className = 'x-dlg-ok' + (o.danger ? ' danger' : '');
		okBtn.textContent = o.ok ?? 'OK';
		let cancelBtn: HTMLButtonElement | null = null;
		if (o.cancel !== null) {
			cancelBtn = document.createElement('button');
			cancelBtn.type = 'button';
			cancelBtn.className = 'x-dlg-cancel';
			cancelBtn.textContent = o.cancel ?? 'Cancel';
			row.appendChild(cancelBtn);
		}
		row.appendChild(okBtn);
		box.appendChild(row);
		back.appendChild(box);
		document.body.appendChild(back);

		const done = (v: boolean) => {
			document.removeEventListener('keydown', onKey, true);
			back.classList.add('out');
			setTimeout(() => back.remove(), 120);
			current = null;
			prevFocus?.focus?.();
			resolve(v);
		};
		current = () => done(false);
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') (e.preventDefault(), e.stopPropagation(), done(o.cancel === null));
			else if (e.key === 'Enter' && document.activeElement !== cancelBtn) (e.preventDefault(), done(true));
			else if (e.key === 'Tab') {
				// keep focus inside the box
				const extra = o.body ? [...o.body.querySelectorAll<HTMLElement>('input, button, select, textarea')] : [];
				const f = [field, ...extra, cancelBtn, okBtn].filter(Boolean) as HTMLElement[];
				const i = f.indexOf(document.activeElement as HTMLElement);
				e.preventDefault();
				f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
			}
		};
		document.addEventListener('keydown', onKey, true);
		okBtn.addEventListener('click', () => done(true));
		cancelBtn?.addEventListener('click', () => done(false));
		back.addEventListener('pointerdown', (e) => {
			if (e.target === back) done(o.cancel === null);
		});
		if (field) {
			field.focus();
			field.select();
		} else (o.danger && cancelBtn ? cancelBtn : okBtn).focus();
	});
}

export const tell = (text: string, title?: string) => ask(text, { title, cancel: null }).then(() => undefined);
export const showCopy = (text: string, value: string) => ask(text, { copy: value, cancel: null, ok: 'Done' }).then(() => undefined);
