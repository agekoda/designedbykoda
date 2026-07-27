// Global interaction layer:
// - custom cursor, magnetic buttons, nav island pill — only on real mice
// - scroll reveal — runs everywhere (touch included), since it's not
//   cursor-dependent; only prefers-reduced-motion skips it, via CSS.

(function () {
	// ---------- Scroll reveal ----------
	// Fades + floats elements up into place as they enter the viewport.
	// Anything already visible on load reveals almost immediately rather
	// than waiting for a scroll.
	const revealEls = document.querySelectorAll('.reveal');
	if (revealEls.length) {
		const observer = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting) {
						entry.target.classList.add('is-visible');
						observer.unobserve(entry.target);
					}
				});
			},
			{ threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
		);
		revealEls.forEach((el) => observer.observe(el));
	}

	// ---------- Cursor / magnetic buttons / nav pill ----------
	// Only makes sense with a real mouse — skipped entirely on touch
	// devices and when reduced motion is requested.
	const canHover = window.matchMedia('(pointer: fine)').matches;
	const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	if (!canHover || reducedMotion) return;

	document.documentElement.classList.add('has-custom-cursor');

	// ---------- Custom cursor ----------
	const cursor = document.createElement('div');
	cursor.className = 'custom-cursor';
	document.body.appendChild(cursor);

	let mouseX = window.innerWidth / 2;
	let mouseY = window.innerHeight / 2;
	let cursorX = mouseX;
	let cursorY = mouseY;
	const trail = 0.4; // lower = laggier/smoother trailing, higher = tighter/snappier

	window.addEventListener('mousemove', (e) => {
		mouseX = e.clientX;
		mouseY = e.clientY;
	});

	function tick() {
		cursorX += (mouseX - cursorX) * trail;
		cursorY += (mouseY - cursorY) * trail;
		cursor.style.transform = `translate(${cursorX}px, ${cursorY}px) translate(-50%, -50%)`;
		requestAnimationFrame(tick);
	}
	requestAnimationFrame(tick);

	// Grow the cursor over anything clickable.
	const hoverTargets = 'a, button, [role="button"], input, textarea, .card';
	document.addEventListener('mouseover', (e) => {
		if (e.target.closest(hoverTargets)) cursor.classList.add('is-hovering');
	});
	document.addEventListener('mouseout', (e) => {
		if (e.target.closest(hoverTargets)) cursor.classList.remove('is-hovering');
	});
	document.addEventListener('mousedown', () => cursor.classList.add('is-active'));
	document.addEventListener('mouseup', () => cursor.classList.remove('is-active'));
	document.addEventListener('mouseleave', () => cursor.classList.add('is-hidden'));
	document.addEventListener('mouseenter', () => cursor.classList.remove('is-hidden'));

	// ---------- Magnetic buttons ----------
	// Elements opt in with data-magnetic. Pull strength and max travel are
	// tuned per-element via data attributes, with sane defaults.
	const magnets = document.querySelectorAll('[data-magnetic]');
	magnets.forEach((el) => {
		const strength = parseFloat(el.dataset.magneticStrength || '0.35');
		const radius = parseFloat(el.dataset.magneticRadius || '70');

		el.addEventListener('mousemove', (e) => {
			const rect = el.getBoundingClientRect();
			const cx = rect.left + rect.width / 2;
			const cy = rect.top + rect.height / 2;
			const dx = e.clientX - cx;
			const dy = e.clientY - cy;
			el.style.transition = 'transform 0.08s linear';
			el.style.transform = `translate(${dx * strength}px, ${dy * strength}px)`;
			void radius; // reserved for future falloff tuning
		});

		el.addEventListener('mouseleave', () => {
			el.style.transition = 'transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)';
			el.style.transform = 'translate(0, 0)';
		});
	});

	// ---------- Nav "island" pill ----------
	const nav = document.querySelector('nav .internal-links');
	if (nav) {
		const pill = document.createElement('div');
		pill.className = 'nav-pill';
		nav.appendChild(pill);
		nav.style.position = 'relative';

		const links = nav.querySelectorAll('a');
		const activeLink = nav.querySelector('a.active');

		function movePillTo(el) {
			if (!el) return;
			const navRect = nav.getBoundingClientRect();
			const rect = el.getBoundingClientRect();
			pill.style.width = `${rect.width}px`;
			pill.style.height = `${rect.height}px`;
			pill.style.transform = `translate(${rect.left - navRect.left}px, ${rect.top - navRect.top}px)`;
			pill.classList.add('is-visible');
		}

		links.forEach((link) => {
			link.addEventListener('mouseenter', () => movePillTo(link));
		});
		nav.addEventListener('mouseleave', () => {
			if (activeLink) {
				movePillTo(activeLink);
			} else {
				pill.classList.remove('is-visible');
			}
		});

		if (activeLink) {
			// Position without animating on first paint.
			requestAnimationFrame(() => {
				pill.style.transition = 'none';
				movePillTo(activeLink);
				requestAnimationFrame(() => {
					pill.style.transition = '';
				});
			});
		}
	}
})();