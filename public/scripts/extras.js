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

	// ---------- Reveal safety net ----------
	// interactions.js reveals cards with an IntersectionObserver. If that ever
	// misses (layout shifts while loading, restored scroll, back/forward cache),
	// make sure anything on screen still fades in rather than staying hidden.
	function rescueReveals() {
		$$('.reveal:not(.is-visible), .x-reveal:not(.is-visible)').forEach((e) => {
			const r = e.getBoundingClientRect();
			if (r.top < innerHeight && r.bottom > 0) e.classList.add('is-visible');
		});
	}
	setTimeout(rescueReveals, 700);
	addEventListener('load', () => setTimeout(rescueReveals, 300));
	addEventListener('pageshow', () => setTimeout(rescueReveals, 100));
	addEventListener('scroll', () => { clearTimeout(rescueReveals.t); rescueReveals.t = setTimeout(rescueReveals, 250); }, { passive: true });

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
	let accentName = store.get('x-theme') || 'blue';
	const isLight = () => root.getAttribute('data-mode') === 'light';
	function applyAccent() {
		const t = THEMES[accentName] || THEMES.blue;
		if (isLight()) {                         // the lighter accents are hard to read on white, so use the deeper shade
			root.style.setProperty('--accent', t[1]);
			root.style.setProperty('--accent-dark', 'color-mix(in srgb, ' + t[1] + ' 70%, #000)');
		} else if (accentName !== 'blue' || root.style.getPropertyValue('--accent')) {
			root.style.setProperty('--accent', t[0]);
			root.style.setProperty('--accent-dark', t[1]);
		}
		const h = (isLight() ? t[1] : t[0]).slice(1);
		accentRGB = [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16));
	}
	function setTheme(name, announce) {
		if (!THEMES[name]) return;
		accentName = name;
		applyAccent();
		store.set('x-theme', name);
		if (announce) say('Accent: ' + name);
	}
	// Day / night. Other scripts (like the range planner) can call window.siteMode.set('light'|'dark').
	function setMode(m, announce) {
		const light = m === 'light';
		if (light) root.setAttribute('data-mode', 'light'); else root.removeAttribute('data-mode');
		const meta = $('meta[name="theme-color"]');
		if (meta) meta.setAttribute('content', light ? '#f4f6f9' : '#0a0a0a');
		store.set('x-mode', light ? 'light' : 'dark');
		applyAccent();
		if (typeof modeBtn !== 'undefined') drawModeBtn();
		window.dispatchEvent(new CustomEvent('x-mode', { detail: light ? 'light' : 'dark' }));
		if (announce) say(light ? 'Day mode' : 'Night mode');
	}
	window.siteMode = { get: () => (isLight() ? 'light' : 'dark'), set: (m) => switchMode(m, false) };
	applyAccent();

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
	const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
	const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
	const modeBtn = el('button', 'x-fab x-mode', '<span class="x-ico x-sun">' + SUN + '</span><span class="x-ico x-moon">' + MOON + '</span>');
	function drawModeBtn() {
		modeBtn.setAttribute('aria-label', isLight() ? 'Switch to night mode' : 'Switch to day mode');
		modeBtn.title = isLight() ? 'Night mode' : 'Day mode';
	}
	drawModeBtn();
	// Switch with a circle that grows out from the button (View Transitions); falls back to a plain switch.
	// SWEEP = false: colours cross-fade and the page keeps running (typewriter, marquee, wave).
	// SWEEP = true: the circle sweep. It looks nice, but the browser freezes the old page as a
	// still picture while it runs, so animations appear to stop and then jump.
	const SWEEP = true;
	let fadeTimer;
	function switchMode(m, announce, from) {
		if (calm) { setMode(m, announce); return; }
		if (!SWEEP || !doc.startViewTransition) {
			root.classList.add('x-fade');
			setMode(m, announce);
			clearTimeout(fadeTimer);
			fadeTimer = setTimeout(() => root.classList.remove('x-fade'), 650);
			return;
		}
		const r = (from || modeBtn).getBoundingClientRect();
		const x = r.left + r.width / 2, y = r.top + r.height / 2;
		const rad = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
		const vt = doc.startViewTransition(() => setMode(m, announce));
		vt.ready.then(() => {
			root.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${rad}px at ${x}px ${y}px)`] },
				{ duration: 650, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', pseudoElement: '::view-transition-new(root)' });
		}).catch(() => {});
	}
	modeBtn.addEventListener('click', () => switchMode(isLight() ? 'dark' : 'light', true));
	dock.append(top, modeBtn, palBtn);
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
		const items = ['KiCad', 'ESP32', 'Custom PCBs', 'LoRa', 'mmWave', 'E-Ink', 'RF Tools', 'Firmware', '3D Printing', 'Smart Home', 'Hand-soldered'];
		const run = el('div', 'x-ticker-track');
		const one = items.map((t) => `<span>${t}</span>`).join('');
		run.innerHTML = one + one;
		const ticker = el('div', 'x-ticker');
		ticker.setAttribute('aria-hidden', 'true');
		ticker.appendChild(run);
		hero.after(ticker);
		// Ease the scroll speed down on hover instead of stopping it.
		if (!calm && run.getAnimations) {
			const anim = run.getAnimations()[0];
			if (anim) {
				const SLOW_RATE = 0.5; // 1 = normal speed, 0 = stopped
				let want = 1;
				ticker.addEventListener('mouseenter', () => (want = SLOW_RATE));
				ticker.addEventListener('mouseleave', () => (want = 1));
				(function ease() {
					anim.playbackRate += (want - anim.playbackRate) * 0.08;
					requestAnimationFrame(ease);
				})();
			}
		}
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
		// SCRAMBLE_SLOWNESS: how many 60Hz frames each letter takes to settle.
		// Bigger = slower. Timing is clock-based, so it feels identical on
		// 60Hz, 144Hz, 240Hz etc. displays. 2.2 is the original feel.
		const SCRAMBLE_SLOWNESS = 2.2;
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
			const t0 = performance.now();
			let lastTick = -1;
			(function step(now) {
				// Convert real elapsed time into "60Hz frames" so speed doesn't
				// depend on the monitor's refresh rate.
				const tick = Math.floor(((now || performance.now()) - t0) * 0.06);
				const reveal = tick / SCRAMBLE_SLOWNESS;
				if (tick !== lastTick) {
					lastTick = tick;
					logo.textContent = original.split('').map((ch, i) => (i < reveal ? ch : glyphs[(Math.random() * glyphs.length) | 0])).join('');
				}
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

	// ---------- Custom draggable scroll bars ----------
	// The native scrollbar is hidden on circle-cursor devices (it would show
	// the OS arrow), so these thin rounded bars show there is more to scroll
	// and can be dragged or clicked like a normal scrollbar. One for the page,
	// one for the command palette's list.
	// THUMB_MAX: longest the page bar can get, in px. Lower = shorter bar.
	const THUMB_MAX = 128;
	const customCursor = root.classList.contains('has-custom-cursor');

	function makeBar(o) {
		const sb = el('div', 'x-sb ' + (o.cls || ''), '<div class="x-sb-thumb"></div>');
		sb.setAttribute('aria-hidden', 'true');
		o.host.appendChild(sb);
		const thumb = $('.x-sb-thumb', sb);
		let trackH = 0, thumbH = 0, maxScroll = 0, dragging = false, startY = 0, startPos = 0, hideT;

		function place() {
			const p = maxScroll ? Math.min(1, Math.max(0, o.getPos() / maxScroll)) : 0;
			thumb.style.transform = `translateY(${p * (trackH - thumbH)}px)`;
		}
		function layout() {
			maxScroll = Math.max(0, o.getMax());
			sb.classList.toggle('is-needed', maxScroll > 4);
			if (maxScroll <= 4) return;
			trackH = sb.clientHeight;
			thumbH = Math.min(o.thumbMax, Math.max(36, Math.round(trackH * o.ratio())));
			thumb.style.height = thumbH + 'px';
			place();
		}
		o.scrollTarget.addEventListener('scroll', () => {
			place();
			sb.classList.add('is-scrolling');
			clearTimeout(hideT);
			hideT = setTimeout(() => sb.classList.remove('is-scrolling'), 900);
		}, { passive: true });
		addEventListener('resize', layout);
		if ('ResizeObserver' in window && o.observe) new ResizeObserver(layout).observe(o.observe);

		// NOTE: no preventDefault() on pointerdown. Cancelling it suppresses the
		// compatibility mouse events, which froze the circle cursor while dragging.
		thumb.addEventListener('pointerdown', (e) => {
			dragging = true; startY = e.clientY; startPos = o.getPos();
			thumb.setPointerCapture(e.pointerId);
			sb.classList.add('is-drag', 'is-active');
			doc.body.style.userSelect = 'none';
			root.style.scrollBehavior = 'auto';
		});
		thumb.addEventListener('pointermove', (e) => {
			if (!dragging) return;
			const travel = trackH - thumbH;
			if (travel > 0) o.setPos(startPos + ((e.clientY - startY) / travel) * maxScroll, false);
		});
		const endDrag = () => {
			if (!dragging) return;
			dragging = false;
			sb.classList.remove('is-drag', 'is-active');
			doc.body.style.userSelect = '';
			root.style.scrollBehavior = '';
		};
		thumb.addEventListener('pointerup', endDrag);
		thumb.addEventListener('pointercancel', endDrag);
		thumb.addEventListener('lostpointercapture', endDrag);
		// click on the empty track: jump so the thumb centres on the click
		sb.addEventListener('pointerdown', (e) => {
			if (e.target === thumb) return;
			const r = sb.getBoundingClientRect();
			const travel = trackH - thumbH;
			const p = travel > 0 ? (e.clientY - r.top - thumbH / 2) / travel : 0;
			o.setPos(Math.min(1, Math.max(0, p)) * maxScroll, true);
		});
		layout();
		return { sb, layout };
	}

	let pageBar = null;
	if (customCursor) {
		pageBar = makeBar({
			host: doc.body, cls: 'is-pre', thumbMax: THUMB_MAX, scrollTarget: window, observe: doc.body,
			getMax: () => root.scrollHeight - innerHeight,
			getPos: () => scrollY,
			ratio: () => innerHeight / root.scrollHeight,
			setPos: (v, smooth) => scrollTo({ top: v, behavior: smooth ? 'smooth' : 'auto' }),
		});
		addEventListener('load', pageBar.layout);
		// intro nudge, once per page load, only if there is something to scroll.
		// The thumb stays fully hidden (is-pre) until it starts.
		setTimeout(() => {
			pageBar.layout();
			pageBar.sb.classList.remove('is-pre');
			if (pageBar.sb.classList.contains('is-needed')) {
				pageBar.sb.classList.add('is-intro');
				setTimeout(() => pageBar.sb.classList.remove('is-intro'), 2600);
			}
		}, 700);
	}

	// ---------- Reveal for sections written into the page markup ----------
	const xr = $$('.x-reveal:not(.is-visible)').filter((e) => !e.dataset.xr);
	if (xr.length) {
		const io = new IntersectionObserver((ents) => {
			ents.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); } });
		}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
		xr.forEach((t) => { t.dataset.xr = '1'; io.observe(t); });
	}
	$$('.featured-heading').forEach((h) => {
		if (h.classList.contains('is-lit')) return;
		const io = new IntersectionObserver((ents) => {
			if (ents[0].isIntersecting) { h.classList.add('is-lit'); io.disconnect(); }
		}, { threshold: 0.6 });
		io.observe(h);
	});

	// ---------- Count-up numbers ([data-count]) ----------
	$$('[data-count]').forEach((n) => {
		const target = parseFloat(n.dataset.count);
		const dec = parseInt(n.dataset.decimals || '0', 10);
		const suffix = n.dataset.suffix || '';
		const show = (v) => (n.textContent = v.toFixed(dec) + suffix);
		show(target);
		if (calm) return;
		show(0);
		const io = new IntersectionObserver((ents) => {
			if (!ents[0].isIntersecting) return;
			io.disconnect();
			const t0 = performance.now(), dur = 1800;
			(function step(t) {
				const p = Math.min(1, (t - t0) / dur);
				show(target * (1 - Math.pow(1 - p, 4)));
				if (p < 1) requestAnimationFrame(step);
			})(t0);
		}, { threshold: 0.8 });
		io.observe(n);
	});

	// ---------- Project filter chips (homepage grid) ----------
	const grid = $('.featured .grid');
	if (grid) {
		const items = $$(':scope > *', grid).map((w) => {
			const card = $('.card', w);
			const tags = card ? $$('.tag', card).map((t) => t.textContent.trim()) : [];
			return { w, cat: tags[0] || '', upcoming: tags.some((t) => /upcoming/i.test(t)) };
		});
		const cats = [...new Set(items.map((i) => i.cat).filter(Boolean))];
		const hasUp = items.some((i) => i.upcoming);
		const filters = ['All', ...cats, ...(hasUp ? ['Upcoming'] : [])];
		const bar = el('div', 'x-chips');
		bar.setAttribute('role', 'group');
		bar.setAttribute('aria-label', 'Filter projects');
		const fhead = $('.featured-heading');
		const badge = fhead && $('.x-count', fhead);
		const matches = (it, f) => f === 'All' || (f === 'Upcoming' ? it.upcoming : it.cat === f);
		filters.forEach((f, i) => {
			const n = items.filter((it) => matches(it, f)).length;
			const b = el('button', 'x-chip' + (i === 0 ? ' is-on' : ''), `${f}<span>${n}</span>`);
			b.type = 'button';
			b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
			b.addEventListener('click', () => {
				$$('.x-chip', bar).forEach((c) => { c.classList.toggle('is-on', c === b); c.setAttribute('aria-pressed', String(c === b)); });
				let k = 0;
				items.forEach((it) => {
					const show = matches(it, f);
					it.w.classList.toggle('x-gone', !show);
					if (show) {
						it.w.classList.add('is-visible');
						if (!calm && it.w.animate) {
							it.w.animate(
								[{ opacity: 0, transform: 'translateY(14px) scale(0.97)' }, { opacity: 1, transform: 'none' }],
								{ duration: 450, delay: k * 45, easing: 'cubic-bezier(0.16,1,0.3,1)', fill: 'backwards' }
							);
						}
						k++;
					}
				});
				if (badge) badge.textContent = String(k);
			});
			bar.appendChild(b);
		});
		grid.before(bar);
	}

	// ---------- Project page: sticky "On this page" bar ----------
	const prose = $('article.prose');
	if (prose && !hero) {
		const hs = $$('h2', prose);
		if (hs.length >= 3) {
			const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
			hs.forEach((h) => { if (!h.id) h.id = slug(h.textContent); });
			const nav = el('nav', 'x-toc');
			nav.setAttribute('aria-label', 'On this page');
			const track = el('div', 'x-toc-track');
			const links = hs.map((h) => {
				const a = el('a', 'x-toc-a');
				a.href = '#' + h.id;
				a.textContent = h.textContent;
				track.appendChild(a);
				return a;
			});
			nav.appendChild(track);
			prose.before(nav);
			const spy = () => {
				let cur = 0;
				hs.forEach((h, i) => { if (h.getBoundingClientRect().top < 140) cur = i; });
				const atTop = hs[0].getBoundingClientRect().top > 140;
				links.forEach((a, i) => a.classList.toggle('is-on', !atTop && i === cur));
				const on = links[cur];
				if (!atTop && on) {
					const l = on.offsetLeft - track.clientWidth / 2 + on.clientWidth / 2;
					track.scrollTo({ left: l, behavior: calm ? 'auto' : 'smooth' });
				}
			};
			let tk = false;
			addEventListener('scroll', () => { if (!tk) { tk = true; requestAnimationFrame(() => { spy(); tk = false; }); } }, { passive: true });
			spy();
		}
	}

	// ---------- Command palette ----------
	const go = (href) => () => { location.href = href; };
	const ext = (href) => () => window.open(href, '_blank', 'noopener');
	const socials = $$('header .social-links a').map((a) => [a.textContent.trim(), a.href]);
	let projectEntries = [];
	try {
		const raw = $('#x-projects');
		if (raw) projectEntries = JSON.parse(raw.textContent).map(([t, u]) => [t, 'Project', go(u)]);
	} catch (e) {}
	const cmds = [
		['Home', 'Go to', go('/')],
		['Projects', 'Go to', go('/projects')],
		['About', 'Go to', go('/about')],
		['Sponsorships & stats', 'Go to', go('/stats')],
		['E-Ink Calendar preorder', 'Go to', go('/preorder/eink-calendar')],
		...projectEntries,
		['E-Ink Calendar setup', 'Go to', go('/setup')],
		['Privacy policy', 'Go to', go('/privacy')],
		...socials.map(([n, h]) => [n.replace(/^(Follow on|Subscribe on|View source on)\s*/, 'Open '), 'Link', ext(h)]),
		['Day mode (light)', 'Appearance', () => switchMode('light', true, palBtn)],
		['Night mode (dark)', 'Appearance', () => switchMode('dark', true, palBtn)],
		['Toggle day / night', 'Appearance', () => switchMode(isLight() ? 'dark' : 'light', true, palBtn)],
		...Object.keys(THEMES).map((t) => ['Accent colour: ' + t, 'Theme', () => setTheme(t, true)]),
		['Scroll to top', 'Action', () => scrollTo({ top: 0, behavior: calm ? 'auto' : 'smooth' })],
		['Copy page link', 'Action', async () => { try { await navigator.clipboard.writeText(location.href); say('Link copied'); } catch (e) { say('Could not copy'); } }],
		['Party mode', 'Fun', () => party()],
	];
	const pal = el('div', 'x-pal');
	pal.setAttribute('role', 'dialog');
	pal.setAttribute('aria-label', 'Command palette');
	pal.innerHTML = '<div class="x-pal-box"><input type="text" placeholder="Type a command or page..." aria-label="Search commands" autocomplete="off" spellcheck="false"><div class="x-pal-scroll"><ul></ul></div><div class="x-pal-foot"><span>&uarr;&darr; navigate</span><span>&crarr; select</span><span>esc close</span></div></div>';
	doc.body.appendChild(pal);
	const inp = $('input', pal), list = $('ul', pal);
	const listBar = customCursor ? makeBar({
		host: $('.x-pal-scroll', pal), cls: 'x-sb-list', thumbMax: 80, scrollTarget: list, observe: list,
		getMax: () => list.scrollHeight - list.clientHeight,
		getPos: () => list.scrollTop,
		ratio: () => list.clientHeight / list.scrollHeight,
		setPos: (v, smooth) => list.scrollTo({ top: v, behavior: smooth ? 'smooth' : 'auto' }),
	}) : null;
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
		if (listBar) listBar.layout();
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
