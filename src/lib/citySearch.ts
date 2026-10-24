// Instant city autocomplete box. Used by the setup wizard and the device
// dashboard. Speed comes from: one request per keystroke (the previous one
// is cancelled), answers remembered in memory, and, when a shorter search
// already returned *everything* that matches, narrowing it locally with no
// request at all.
export interface City {
	id: number;
	label: string;
	lat: number;
	lon: number;
}

const LIMIT = 8;
const memo = new Map<string, City[]>();

const norm = (s: string) =>
	s
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();

async function search(q: string, signal: AbortSignal): Promise<City[]> {
	if (memo.has(q)) return memo.get(q)!;
	// A shorter, already-complete result list can answer a longer search.
	for (let n = q.length - 1; n >= 1; n--) {
		const shorter = memo.get(q.slice(0, n));
		if (shorter && shorter.length < LIMIT) {
			const out = shorter.filter((c) => norm(c.label).startsWith(q));
			memo.set(q, out);
			return out;
		}
	}
	const res = await fetch(`/api/geo/search?q=${encodeURIComponent(q)}`, { signal });
	const data = await res.json();
	const results: City[] = data.results || [];
	memo.set(q, results);
	return results;
}

export function createCitySearch(opts: {
	value?: string;
	placeholder?: string;
	onSelect: (city: City | null) => void;
}): HTMLElement {
	const wrap = document.createElement('div');
	wrap.className = 'citysearch';
	wrap.innerHTML = `
		<input type="text" class="cs-input" role="combobox" aria-expanded="false" aria-autocomplete="list"
			autocomplete="off" spellcheck="false" maxlength="60"
			placeholder="${opts.placeholder || 'Search for your city…'}" aria-label="City" />
		<button type="button" class="cs-clear" aria-label="Clear location" hidden>×</button>
		<ul class="cs-list" role="listbox" hidden></ul>`;
	const input = wrap.querySelector('.cs-input') as HTMLInputElement;
	const clear = wrap.querySelector('.cs-clear') as HTMLButtonElement;
	const list = wrap.querySelector('.cs-list') as HTMLUListElement;

	let current = opts.value || ''; // label of the confirmed choice
	let items: City[] = [];
	let active = -1;
	let ctrl: AbortController | null = null;
	input.value = current;
	clear.hidden = !current;

	const close = () => {
		list.hidden = true;
		input.setAttribute('aria-expanded', 'false');
		active = -1;
	};
	const paint = () => {
		list.innerHTML = items.length
			? items.map((c, i) => `<li role="option" data-i="${i}" class="${i === active ? 'on' : ''}">${c.label.replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]!)}</li>`).join('')
			: '<li class="none">No match. Try a bigger nearby city.</li>';
		list.hidden = false;
		input.setAttribute('aria-expanded', 'true');
	};
	const pick = (c: City) => {
		current = c.label;
		input.value = c.label;
		clear.hidden = false;
		close();
		opts.onSelect(c);
	};

	input.addEventListener('input', async () => {
		const q = norm(input.value);
		if (!q) {
			close();
			return;
		}
		ctrl?.abort();
		ctrl = new AbortController();
		try {
			items = await search(q, ctrl.signal);
			active = items.length ? 0 : -1;
			paint();
		} catch {
			/* cancelled by a newer keystroke */
		}
	});
	input.addEventListener('keydown', (e) => {
		if (list.hidden || !items.length) return;
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			active = (active + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
			paint();
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (active >= 0) pick(items[active]);
		} else if (e.key === 'Escape') close();
	});
	// mousedown (not click) so the choice lands before the input loses focus
	list.addEventListener('mousedown', (e) => {
		e.preventDefault();
		const li = (e.target as HTMLElement).closest('li[data-i]') as HTMLElement | null;
		if (li) pick(items[+li.dataset.i!]);
	});
	input.addEventListener('blur', () => {
		close();
		input.value = current; // half-typed text snaps back to the real choice
	});
	clear.addEventListener('click', () => {
		current = '';
		input.value = '';
		clear.hidden = true;
		close();
		opts.onSelect(null);
	});
	return wrap;
}
