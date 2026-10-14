// extras.js - extra polish layered over interactions.js.
// Everything here is additive: it injects small elements, never rewrites layout.
// Mouse-driven effects only run with a real pointer; motion effects respect
// prefers-reduced-motion.
(function () {
	const doc = document;
	const root = doc.documentElement;
	const fine = matchMedia('(pointer: fine)').matches;
	const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
	const $ = (s, r = doc) => r.querySelector(s);
	const $$ = (s, r = doc) => Array.from(r.querySelectorAll(s));
	const el = (tag, cls, html) => {
		const e = doc.createElement(tag);
		if (cls) e.className = cls;
		if (html != null) e.innerHTML = html;
		return e;
	};
	const store = {
		get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
		set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
	};

	// ---------- Toast ----------
	const toast = el('div', 'x-toast');
	toast.setAttribute('role', 'status');
	doc.body.appendChild(toast);
	let toastT;
	function say(msg) {
		toast.textContent = msg;
		toast.classList.add('is-on');
		clearTimeout(toastT);
		toastT = setTimeout(() => toast.classList.remove('is-on'), 2200);
	}

	// ---------- Accent themes ----------
	const THEMES = {
		blue: ['#5aa0dc', '#2e6ba8'],
		teal: ['#4fd1c5', '#2a8f86'],
		pink: ['#f08cc0', '#b04e86'],
		purple: ['#a78bfa', '#6d4fd1'],
		amber: ['#f0b45a', '#a87a2a'],
	};
	let accentRGB = [90, 160, 220];
	function setTheme(name, announce) {
		const t = THEMES[name];
		if (!t) return;
		root.style.setProperty('--accent', t[0]);
		root.style.setProperty('--accent-dark', t[1]);
		const h = t[0].slice(1);
		accentRGB = [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16));
		store.set('x-theme', name);
		if (announce) say('Accent: ' + name);
	}
	const saved = store.get('x-theme');
	if (saved) setTheme(saved, false);

	// ---------- Scroll progress + back to top ----------
	const bar = el('div', 'x-progress');
	doc.body.appendChild(bar);

	const dock = el('div', 'x-dock');
	const R = 21, C = 2 * Math.PI * R;
	const top = el('button', 'x-fab x-top',
		`<svg class="x-ring" viewBox="0 0 46 46"><circle cx="23" cy="23" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${C}"/></svg>
		 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>`);
	top.setAttribute('aria-label', 'Back to top');
	const ring = $('circle', top);
	const palBtn = el('button', 'x-fab', '<span class="x-kbd">&#8984;K</span>');
	palBtn.setAttribute('aria-label', 'Open command palette');
	if (!fine) palBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
	dock.append(top, palBtn);
	doc.body.appendChild(dock);
	top.addEventListener('click', () => scrollTo({ top: 0, behavior: calm ? 'auto' : 'smooth' }));

	let ticking = false;
	function onScroll() {
		const max = root.scrollHeight - innerHeight;
		const p = max > 0 ? Math.min(1, scrollY / max) : 0;
		bar.style.transform = `scaleX(${p})`;
		ring.style.strokeDashoffset = C * (1 - p);
		top.classList.toggle('is-on', scrollY > 500);
		ticking = false;
	}
	addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
	addEventListener('resize', onScroll);
	onScroll();

	// ---------- Hero: wave, typewriter ----------
	const hero = $('.hero');
	const h1 = hero && $('h1', hero);
	if (h1) {
		// Gradient text sits in its own span and the emoji is absolutely
		// positioned beside it, so the words themselves are truly centred.
		const txt = h1.textContent.replace('\u{1F44B}', '').trim();
		h1.innerHTML = '<span class="x-h"><span class="x-grad"></span><span class="x-wave" aria-hidden="true">\u{1F44B}</span></span>';
		$('.x-grad', h1).textContent = txt;
	}
	if (h1) {
		const line = el('div', 'hero-type', '<span class="x-prompt">&gt;</span><span class="x-word"></span><span class="x-caret"></span>');
		line.setAttribute('aria-hidden', 'true');
		h1.after(line);
		const word = $('.x-word', line);
		const phrases = ['designing custom PCBs', 'writing ESP32 firmware', 'tinkering with RF', 'building e-ink gadgets', 'shipping smart home hardware', 'printing enclosures'];
		if (calm) {
			word.textContent = phrases[0];
		} else {
			let pi = 0, ci = 0, del = false;
			(function type() {
				const full = phrases[pi];
				ci += del ? -1 : 1;
				word.textContent = full.slice(0, ci);
				let wait = del ? 28 : 65 + Math.random() * 50;
				if (!del && ci === full.length) { wait = 1700; del = true; }
				else if (del && ci === 0) { del = false; pi = (pi + 1) % phrases.length; wait = 350; }
				setTimeout(type, wait);
			})();
		}
	}

	// ---------- Ticker (homepage only) ----------
	const featured = $('.featured');
	if (hero && featured) {
		const items = ['KiCad', 'ESP32', 'Custom PCBs', 'LoRa', 'mmWave', 'E-Ink', 'RF Tools', 'Firmware', 'Fusion 360', '3D Printing', 'Smart Home', 'Cloudflare Workers', 'Hand-soldered'];
		const run = el('div', 'x-ticker-track');
		const one = items.map((t) => `<span>${t}</span>`).join('');
		run.innerHTML = one + one;
		const ticker = el('div', 'x-ticker');
		ticker.setAttribute('aria-hidden', 'true');
		ticker.appendChild(run);
		hero.after(ticker);
	}

	// ---------- Heading: count badge + lit underline ----------
	const fh = $('.featured-heading');
	if (fh) {
		const target = $$('.grid > *', fh.parentElement).length;
		const h2 = $('h2', fh);
		if (target && h2) {
			const badge = el('span', 'x-count', calm ? String(target) : '0');
			h2.appendChild(badge);
			const io = new IntersectionObserver((ents) => {
				if (!ents[0].isIntersecting) return;
				io.disconnect();
				fh.classList.add('is-lit');
				if (calm) return;
				const t0 = performance.now();
				(function step(t) {
					const p = Math.min(1, (t - t0) / 1100);
					badge.textContent = Math.round(target * (1 - Math.pow(1 - p, 4)));
					if (p < 1) requestAnimationFrame(step);
				})(t0);
			}, { threshold: 0.6 });
			io.observe(fh);
		}
	}

	// ---------- Reveal for inner-page headings ----------
	if (!calm && !hero) {
		const targets = $$('main h2, main h3, main table, main blockquote, main pre').filter((e) => !e.closest('.reveal, .card'));
		const io = new IntersectionObserver((ents) => {
			ents.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); } });
		}, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });
		targets.forEach((t) => { t.classList.add('x-reveal'); io.observe(t); });
	}

	// ---------- Code copy buttons ----------
	$$('main pre').forEach((pre) => {
		const b = el('button', 'x-copy', 'copy');
		b.type = 'button';
		b.addEventListener('click', async () => {
			try {
				await navigator.clipboard.writeText(pre.innerText.replace(/\s*copy\s*$/, ''));
				b.textContent = 'copied!';
				setTimeout(() => (b.textContent = 'copy'), 1400);
			} catch (e) { say('Could not copy'); }
		});
		pre.appendChild(b);
	});

	// ---------- Button ripple ----------
	doc.addEventListener('pointerdown', (e) => {
		const b = e.target.closest && e.target.closest('.button');
		if (!b || calm) return;
		const r = b.getBoundingClientRect();
		const size = Math.max(r.width, r.height) * 2;
		const d = el('span', 'x-ripple');
		d.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
		b.appendChild(d);
		setTimeout(() => d.remove(), 700);
	});

	// ---------- Logo scramble ----------
	const logo = $('header h2 a');
	if (logo && !calm) {
		const original = logo.textContent;
		const glyphs = 'abcdefghijklmnopqrstuvwxyz01<>/{}#%';
		let raf;
		// Freeze the logo's box so scrambled glyphs can't resize it and
		// nudge the centred nav links around.
		const lockLogo = () => {
			const h2 = logo.parentElement;
			h2.style.width = h2.getBoundingClientRect().width + 'px';
			h2.style.flex = 'none';
			logo.style.whiteSpace = 'nowrap';
		};
		(document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(lockLogo);
		addEventListener('resize', () => { logo.parentElement.style.width = ''; lockLogo(); });
		logo.addEventListener('mouseenter', () => {
			cancelAnimationFrame(raf);
			let frame = 0;
			(function step() {
				const reveal = frame / 2.2;
				logo.textContent = original.split('').map((ch, i) => (i < reveal ? ch : glyphs[(Math.random() * glyphs.length) | 0])).join('');
				frame++;
				if (reveal < original.length) raf = requestAnimationFrame(step);
				else logo.textContent = original;
			})();
		});
		logo.addEventListener('mouseleave', () => { cancelAnimationFrame(raf); logo.textContent = original; });
	}

	// ---------- Pointer-driven effects ----------
	if (fine && !calm) {
		// card spotlight + tilt
		$$('.card').forEach((card) => {
			card.addEventListener('pointermove', (e) => {
				const r = card.getBoundingClientRect();
				const x = e.clientX - r.left, y = e.clientY - r.top;
				card.style.setProperty('--mx', x + 'px');
				card.style.setProperty('--my', y + 'px');
				const rx = ((y / r.height) - 0.5) * -8;
				const ry = ((x / r.width) - 0.5) * 8;
				card.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-3px)`;
			});
			card.addEventListener('pointerleave', () => { card.style.transform = ''; });
		});

		// glow parallax
		const glows = $$('.bg-fx .glow');
		addEventListener('pointermove', (e) => {
			const nx = e.clientX / innerWidth - 0.5, ny = e.clientY / innerHeight - 0.5;
			glows.forEach((g, i) => {
				const k = (i % 2 ? -1 : 1) * (30 + i * 14);
				g.style.translate = `${nx * k}px ${ny * k}px`;
			});
		}, { passive: true });
	}

	// ---------- Particle constellation ----------
	if (!calm) {
		const cv = el('canvas', 'x-canvas');
		cv.setAttribute('aria-hidden', 'true');
		const bg = $('.bg-fx');
		(bg ? bg.after(cv) : doc.body.prepend(cv));
		const ctx = cv.getContext('2d');
		let W, H, pts = [], mx = -999, my = -999, running = true;
		const N = () => Math.min(70, Math.round((innerWidth * innerHeight) / 24000));
		function size() {
			W = cv.width = innerWidth; H = cv.height = innerHeight;
			pts = Array.from({ length: N() }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35 }));
		}
		size();
		addEventListener('resize', size);
		if (fine) addEventListener('pointermove', (e) => { mx = e.clientX; my = e.clientY; }, { passive: true });
		doc.addEventListener('visibilitychange', () => { running = !doc.hidden; if (running) requestAnimationFrame(frame); });
		function frame() {
			if (!running) return;
			ctx.clearRect(0, 0, W, H);
			const [r, g, b] = accentRGB;
			for (let i = 0; i < pts.length; i++) {
				const p = pts[i];
				p.x += p.vx; p.y += p.vy;
				if (p.x < 0 || p.x > W) p.vx *= -1;
				if (p.y < 0 || p.y > H) p.vy *= -1;
				ctx.fillStyle = `rgba(${r},${g},${b},0.55)`;
				ctx.beginPath(); ctx.arc(p.x, p.y, 1.4, 0, 6.283); ctx.fill();
				for (let j = i + 1; j < pts.length; j++) {
					const q = pts[j], dx = p.x - q.x, dy = p.y - q.y, d = dx * dx + dy * dy;
					if (d < 14000) {
						ctx.strokeStyle = `rgba(${r},${g},${b},${0.16 * (1 - d / 14000)})`;
						ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
					}
				}
				const mdx = p.x - mx, mdy = p.y - my, md = mdx * mdx + mdy * mdy;
				if (md < 22000) {
					ctx.strokeStyle = `rgba(${r},${g},${b},${0.5 * (1 - md / 22000)})`;
					ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(mx, my); ctx.stroke();
					p.x += mdx * 0.002; p.y += mdy * 0.002;
				}
			}
			requestAnimationFrame(frame);
		}
		requestAnimationFrame(frame);
	}

	// ---------- Command palette ----------
	const go = (href) => () => { location.href = href; };
	const ext = (href) => () => window.open(href, '_blank', 'noopener');
	const socials = $$('header .social-links a').map((a) => [a.textContent.trim(), a.href]);
	const cmds = [
		['Home', 'Go to', go('/')],
		['Projects', 'Go to', go('/projects')],
		['About', 'Go to', go('/about')],
		['Sponsorships & stats', 'Go to', go('/stats')],
		['E-Ink Calendar preorder', 'Go to', go('/preorder/eink-calendar')],
		['E-Ink Calendar setup', 'Go to', go('/setup')],
		['Privacy policy', 'Go to', go('/privacy')],
		...socials.map(([n, h]) => [n.replace(/^(Follow on|Subscribe on|View source on)\s*/, 'Open '), 'Link', ext(h)]),
		...Object.keys(THEMES).map((t) => ['Accent colour: ' + t, 'Theme', () => setTheme(t, true)]),
		['Scroll to top', 'Action', () => scrollTo({ top: 0, behavior: calm ? 'auto' : 'smooth' })],
		['Copy page link', 'Action', async () => { try { await navigator.clipboard.writeText(location.href); say('Link copied'); } catch (e) { say('Could not copy'); } }],
		['Party mode', 'Fun', () => party()],
	];
	const pal = el('div', 'x-pal');
	pal.setAttribute('role', 'dialog');
	pal.setAttribute('aria-label', 'Command palette');
	pal.innerHTML = '<div class="x-pal-box"><input type="text" placeholder="Type a command or page..." aria-label="Search commands" autocomplete="off" spellcheck="false"><ul></ul><div class="x-pal-foot"><span>&uarr;&darr; navigate</span><span>&crarr; select</span><span>esc close</span></div></div>';
	doc.body.appendChild(pal);
	const inp = $('input', pal), list = $('ul', pal);
	let shown = [], sel = 0;
	function draw() {
		const q = inp.value.trim().toLowerCase();
		shown = cmds.filter((c) => !q || (c[0] + ' ' + c[1]).toLowerCase().includes(q));
		sel = Math.min(sel, Math.max(0, shown.length - 1));
		list.innerHTML = shown.length
			? shown.map((c, i) => `<li class="${i === sel ? 'is-sel' : ''}" data-i="${i}"><span>${c[0]}</span><small>${c[1]}</small></li>`).join('')
			: '<div class="x-pal-empty">Nothing matches. Try &ldquo;projects&rdquo;.</div>';
		const s = $('.is-sel', list);
		if (s) s.scrollIntoView({ block: 'nearest' });
	}
	function openPal() { pal.classList.add('is-open'); inp.value = ''; sel = 0; draw(); setTimeout(() => inp.focus(), 30); }
	function closePal() { pal.classList.remove('is-open'); inp.blur(); }
	function run(i) { const c = shown[i]; if (!c) return; closePal(); c[2](); }
	palBtn.addEventListener('click', openPal);
	pal.addEventListener('click', (e) => { if (e.target === pal) closePal(); });
	list.addEventListener('click', (e) => { const li = e.target.closest('li'); if (li) run(+li.dataset.i); });
	list.addEventListener('mousemove', (e) => { const li = e.target.closest('li'); if (li && +li.dataset.i !== sel) { sel = +li.dataset.i; $$('li', list).forEach((x, i) => x.classList.toggle('is-sel', i === sel)); } });
	inp.addEventListener('input', () => { sel = 0; draw(); });
	inp.addEventListener('keydown', (e) => {
		if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % Math.max(1, shown.length); draw(); }
		else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + shown.length) % Math.max(1, shown.length); draw(); }
		else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
	});

	// ---------- Party mode / Konami ----------
	function party() {
		say('Party mode! Press again to calm down.');
		const on = root.classList.toggle('x-party');
		if (!on) return;
		if (calm) return;
		const cols = ['#5aa0dc', '#4fd1c5', '#f08cc0', '#a78bfa', '#f0b45a', '#ffffff'];
		for (let i = 0; i < 90; i++) {
			const c = el('i', 'x-confetti');
			c.style.left = Math.random() * 100 + 'vw';
			c.style.background = cols[i % cols.length];
			c.style.setProperty('--dx', (Math.random() - 0.5) * 300 + 'px');
			c.style.setProperty('--rot', Math.random() * 900 + 'deg');
			c.style.animationDuration = 1.8 + Math.random() * 1.8 + 's';
			c.style.animationDelay = Math.random() * 0.6 + 's';
			doc.body.appendChild(c);
			setTimeout(() => c.remove(), 4600);
		}
	}
	const seq = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
	let ki = 0;

	doc.addEventListener('keydown', (e) => {
		const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || '')) || e.target.isContentEditable;
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			pal.classList.contains('is-open') ? closePal() : openPal();
			return;
		}
		if (e.key === 'Escape' && pal.classList.contains('is-open')) { closePal(); return; }
		if (typing) return;
		if (e.key === '/' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); openPal(); return; }
		const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
		ki = k === seq[ki] ? ki + 1 : (k === seq[0] ? 1 : 0);
		if (ki === seq.length) { ki = 0; party(); }
	});

	// first-visit hint for the palette
	if (fine && !store.get('x-hint')) {
		setTimeout(() => { say('Tip: press Ctrl+K or / for the command palette'); store.set('x-hint', '1'); }, 2600);
	}
})();
