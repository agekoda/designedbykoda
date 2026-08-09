// Global interaction layer:
// - custom cursor, magnetic buttons, nav island pill — only on real mice
// - scroll reveal — runs everywhere (touch included), since it's not
//   cursor-dependent; only prefers-reduced-motion skips it, via CSS.
// - image lightbox — runs everywhere, click any non-card image to view
//   it fullscreen.

(function () {
	// ---------- Image + model lightbox ----------
	// Every <img> inside <main> opens fullscreen on click, except project
	// card thumbnails (those navigate to the project page instead — see
	// the .card exclusion below). Works on any image on the site,
	// including plain <img> tags typed directly into markdown content
	// (e.g. the schematic photos), not just ones from our own components.
	// 3D models use the same overlay (see ProjectModel.astro, which calls
	// window.openModelLightbox on a genuine click — not a drag-to-rotate).
	const overlay = document.createElement('div');
	overlay.className = 'lightbox-overlay';
	overlay.innerHTML = '<button class="lightbox-close" aria-label="Close">&times;</button>';
	document.body.appendChild(overlay);
	const closeBtn = overlay.querySelector('.lightbox-close');
	let media = null; // whichever <img> or <model-viewer> is currently shown

	function clearMedia() {
		if (media) {
			media.remove();
			media = null;
		}
	}

	function openLightbox(src, alt) {
		clearMedia();
		media = document.createElement('img');
		media.src = src;
		media.alt = alt || '';
		overlay.appendChild(media);
		overlay.classList.add('is-open');
		document.body.style.overflow = 'hidden';
	}

	function openModelLightbox(src, cameraOrbit) {
		clearMedia();
		media = document.createElement('model-viewer');
		media.setAttribute('src', src);
		media.setAttribute('camera-controls', '');
		media.setAttribute('auto-rotate', '');
		media.setAttribute('interaction-prompt', 'none');
		media.setAttribute('shadow-intensity', '1');
		media.setAttribute('exposure', '1');
		media.setAttribute('environment-image', 'neutral');
		if (cameraOrbit) media.setAttribute('camera-orbit', cameraOrbit);
		overlay.appendChild(media);
		overlay.classList.add('is-open');
		document.body.style.overflow = 'hidden';

		// Same grab-cursor override as the inline models — model-viewer sets
		// its own cursor (possibly inside its shadow root), which our
		// custom-cursor system can't reach with plain CSS alone.
		let rafId = null;
		function forceCursorNone() {
			if (document.documentElement.classList.contains('has-custom-cursor')) {
				media.style.setProperty('cursor', 'none', 'important');
				const root = media.shadowRoot;
				if (root) {
					root.querySelectorAll('*').forEach((el) => {
						if (el.style && el.style.cursor && el.style.cursor !== 'none') {
							el.style.setProperty('cursor', 'none', 'important');
						}
					});
				}
			}
			rafId = requestAnimationFrame(forceCursorNone);
		}
		media.addEventListener('pointerenter', () => {
			if (rafId === null) forceCursorNone();
		});
		media.addEventListener('pointerleave', () => {
			if (rafId !== null) {
				cancelAnimationFrame(rafId);
				rafId = null;
			}
		});
	}
	// Exposed so ProjectModel.astro's click-vs-drag detection can call it.
	window.openModelLightbox = openModelLightbox;

	function closeLightbox() {
		overlay.classList.remove('is-open');
		document.body.style.overflow = '';
		clearMedia();
	}

	document.querySelectorAll('main img:not(.card img)').forEach((img) => {
		img.addEventListener('click', () => {
			openLightbox(img.currentSrc || img.src, img.alt);
		});
	});
	// Clicking anywhere in the overlay except the media itself closes it —
	// covers the close button and clicking the dark background/sides.
	overlay.addEventListener('click', (e) => {
		if (e.target !== media) closeLightbox();
	});
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') closeLightbox();
	});

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
			// Match the link's horizontal position/width exactly, but centre
			// vertically within the nav row itself, rather than copying the
			// link's own box top — every link should be the same height, so
			// this keeps the pill visually centred regardless of any small
			// padding/line-height quirk on the anchor.
			const top = (navRect.height - rect.height) / 2;
			pill.style.width = `${rect.width}px`;
			pill.style.height = `${rect.height}px`;
			pill.style.transform = `translate(${rect.left - navRect.left}px, ${top}px)`;
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