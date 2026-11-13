// Small SVG charts. One colour per chart (the accent) because each shows one thing; hover any mark
// for its value. Status colours are only used where they mean a state, and always beside a label.
'use strict';
const Charts = {
	// Vertical bars over time. points: [{ label, value, tip }]
	bars(points, { height = 150, every = 5, width = 640 } = {}) {
		const W = width, H = height, padL = 26, padB = 18, padT = 8;
		const max = Math.max(1, ...points.map((p) => p.value));
		const top = max <= 4 ? 4 : Math.ceil(max / 4) * 4;
		const slot = (W - padL) / points.length;
		const bw = Math.max(3, Math.min(18, slot - 3));
		const y = (v) => padT + (H - padT - padB) * (1 - v / top);
		const grid = [0, top / 2, top].map((v) => `<line class="grid-line" x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('');
		const bars = points.map((p, i) => {
			const x = padL + i * slot + (slot - bw) / 2, h = Math.max(p.value ? 2 : 0, H - padB - y(p.value));
			const last = i === points.length - 1;
			const lab = last ? `<text x="${W}" y="${H - 4}" text-anchor="end">${esc(p.label)}</text>` : i % every === 0 && i < points.length - every * 0.7 ? `<text x="${x + bw / 2}" y="${H - 4}" text-anchor="middle">${esc(p.label)}</text>` : '';
			return `<g><rect class="hit" x="${padL + i * slot}" y="${padT}" width="${slot}" height="${H - padB - padT}" data-tip="${esc(p.tip)}"/><rect class="bar" pointer-events="none" x="${x}" y="${H - padB - h}" width="${bw}" height="${h}" rx="${Math.min(4, bw / 2, h / 2)}"/>${lab}</g>`;
		}).join('');
		return raw(`<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img">${grid}${bars}</svg>`);
	},
	// Ranked horizontal bars. items: [{ name, n, tip, act, arg }]
	hbars(items, { empty = 'Nothing yet.' } = {}) {
		if (!items.length) return html`<div class="empty">${empty}</div>`;
		const max = Math.max(1, ...items.map((i) => i.n));
		return html`<div class="hbars">${items.map((i) => html`<div class="hbar" data-tip="${i.tip || `${i.name}|${i.n}`}"><span class="name">${i.label || i.name}</span><span class="track"><i style="width:${Math.max(2, (i.n / max) * 100)}%"></i></span><span class="n">${i.n}</span></div>`)}</div>`;
	},
	// A line over time with a point you can hover. pts: [[unixSeconds, value]]
	line(pts, { height = 150, fmt = (v) => v, min, max } = {}) {
		if (pts.length < 2) return html`<div class="empty">Not enough readings yet.</div>`;
		const W = 460, H = height, padL = 38, padB = 18, padT = 8;
		const x0 = pts[0][0], x1 = pts[pts.length - 1][0];
		const lo = min ?? Math.min(...pts.map((p) => p[1])), hi = max ?? Math.max(...pts.map((p) => p[1]));
		const x = (t) => padL + ((t - x0) / Math.max(1, x1 - x0)) * (W - padL - 6);
		const y = (v) => padT + (H - padT - padB) * (1 - (v - lo) / Math.max(1e-9, hi - lo));
		const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join('');
		const grid = [lo, (lo + hi) / 2, hi].map((v) => `<line class="grid-line" x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${esc(fmt(v))}</text>`).join('');
		const slot = (W - padL) / pts.length;
		const hits = pts.map((p, i) => `<g class="pt"><rect class="hit" x="${x(p[0]) - slot / 2}" y="0" width="${Math.max(2, slot)}" height="${H - padB}" data-tip="${esc(fmt(p[1]))}|${esc(dateTime(p[0]))}"/><circle cx="${x(p[0])}" cy="${y(p[1])}" r="4" fill="var(--accent)" stroke="#121212" stroke-width="2" pointer-events="none"/></g>`).join('');
		return raw(`<svg class="chart line" viewBox="0 0 ${W} ${H}" width="100%" role="img">${grid}<path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>${hits}<text x="${padL}" y="${H - 4}">${esc(day(x0))}</text><text x="${W - 6}" y="${H - 4}" text-anchor="end">${esc(day(x1))}</text><style>.line .pt circle{opacity:0}.line .pt:hover circle{opacity:1}</style></svg>`);
	},
	// 90 little day cells for uptime. days: [{ day, pct }]
	strip(days) {
		return html`<div class="strip">${days.map((d) => html`<i class="${d.pct === null ? '' : d.pct >= 99.5 ? 'g' : d.pct >= 95 ? 'w' : 'b'}" data-tip="${d.day}|${d.pct === null ? 'no checks' : (Math.round(d.pct * 100) / 100) + '% up'}"></i>`)}</div>`;
	},
};
// Count things per local day for the last n days. Returns [{ label, value, tip }]
function perDay(times, n, noun) {
	const start = new Date();
	start.setHours(0, 0, 0, 0);
	const out = [];
	for (let i = n - 1; i >= 0; i--) {
		const a = start.getTime() / 1000 - i * 86400, b = a + 86400;
		const v = times.filter((t) => t >= a && t < b).length;
		out.push({ label: day(a), value: v, tip: `${day(a)}|${plural(v, noun)}` });
	}
	return out;
}
