// Turns a plain <select> into the same dropdown the pre-order page uses for currency and country:
// a pill button that opens a rounded menu. The real <select> stays in the page (hidden), so reading
// .value and listening for "change" work as normal. Call it.sync() after setting .value in code.
export interface Dropdown {
	sync(): void;
	destroy(): void;
}

const CHEV = '<svg class="dd-chev" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

let open: { close: () => void } | null = null;

export function dropdown(select: HTMLSelectElement): Dropdown {
	const wrap = document.createElement('div');
	wrap.className = 'dd' + (select.classList.contains('wide') ? ' dd-wide' : '');
	const btn = document.createElement('button');
	btn.type = 'button';
	btn.className = 'dd-btn';
	btn.setAttribute('aria-haspopup', 'listbox');
	btn.setAttribute('aria-expanded', 'false');
	const label = select.getAttribute('aria-label');
	if (label) btn.setAttribute('aria-label', label);
	const text = document.createElement('span');
	text.className = 'dd-text';
	btn.innerHTML = '';
	btn.append(text);
	btn.insertAdjacentHTML('beforeend', CHEV);
	const menu = document.createElement('div');
	menu.className = 'dd-menu';
	menu.setAttribute('role', 'listbox');
	menu.hidden = true;
	wrap.append(btn, menu);
	select.after(wrap);
	select.hidden = true;
	select.classList.add('dd-native');

	let opts: HTMLButtonElement[] = [];
	function build() {
		menu.innerHTML = '';
		opts = Array.from(select.options).map((o) => {
			const b = document.createElement('button');
			b.type = 'button';
			b.className = 'dd-opt';
			b.setAttribute('role', 'option');
			b.dataset.value = o.value;
			b.textContent = o.textContent;
			b.addEventListener('click', () => {
				select.value = o.value;
				select.dispatchEvent(new Event('change', { bubbles: true }));
				sync();
				close(true);
			});
			menu.appendChild(b);
			return b;
		});
	}
	function sync() {
		const cur = select.selectedOptions[0];
		text.textContent = cur?.textContent ?? '';
		opts.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.value === select.value)));
	}
	function place() {
		const r = btn.getBoundingClientRect();
		menu.style.minWidth = Math.max(r.width, 160) + 'px';
		menu.style.left = r.left + 'px';
		const h = menu.offsetHeight;
		const below = window.innerHeight - r.bottom - 12;
		const up = below < Math.min(h, 220) && r.top > below;
		const room = (up ? r.top : below) - 8;
		menu.style.maxHeight = Math.max(140, Math.min(360, room)) + 'px';
		if (up) {
			menu.style.top = '';
			menu.style.bottom = window.innerHeight - r.top + 8 + 'px';
		} else {
			menu.style.bottom = '';
			menu.style.top = r.bottom + 8 + 'px';
		}
		const w = menu.offsetWidth;
		if (r.left + w > window.innerWidth - 8) menu.style.left = Math.max(8, window.innerWidth - 8 - w) + 'px';
	}
	function openMenu() {
		open?.close();
		build();
		sync();
		menu.hidden = false;
		btn.setAttribute('aria-expanded', 'true');
		place();
		(opts.find((b) => b.getAttribute('aria-selected') === 'true') ?? opts[0])?.focus();
		open = { close: () => close(false) };
	}
	function close(refocus = false) {
		menu.hidden = true;
		btn.setAttribute('aria-expanded', 'false');
		if (open && open.close) open = null;
		if (refocus) btn.focus();
	}
	btn.addEventListener('click', () => (menu.hidden ? openMenu() : close()));
	menu.addEventListener('keydown', (e) => {
		const i = opts.indexOf(document.activeElement as HTMLButtonElement);
		if (e.key === 'ArrowDown') (e.preventDefault(), opts[(i + 1) % opts.length].focus());
		else if (e.key === 'ArrowUp') (e.preventDefault(), opts[(i - 1 + opts.length) % opts.length].focus());
		else if (e.key === 'Escape') (e.preventDefault(), e.stopPropagation(), close(true));
		else if (e.key === 'Tab') close();
	});
	const away = (e: Event) => {
		if (!menu.hidden && !wrap.contains(e.target as Node)) close();
	};
	const leave = () => !menu.hidden && close();
	document.addEventListener('pointerdown', away);
	window.addEventListener('resize', leave);
	window.addEventListener('scroll', leave, true);
	build();
	sync();
	return {
		sync,
		destroy() {
			document.removeEventListener('pointerdown', away);
			window.removeEventListener('resize', leave);
			window.removeEventListener('scroll', leave, true);
			wrap.remove();
			select.hidden = false;
		},
	};
}
