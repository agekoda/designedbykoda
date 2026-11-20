// Add ?timing to any page's address to see what the page waited on, on this device.
// Shows the page's own steps (looking up the address, connecting, the server, downloading) and the
// slowest files, so a slow browser can be told apart from a slow network or a slow server.
(function () {
	if (!/[?&]timing\b/.test(location.search) && location.hash !== '#timing') return;
	function show() {
		var nav = performance.getEntriesByType('navigation')[0] || {};
		var ms = function (a, b) { return a && b ? Math.round(b - a) + ' ms' : '-'; };
		var rows = [
			['Looking up the address', ms(nav.domainLookupStart, nav.domainLookupEnd)],
			['Connecting (incl. secure)', ms(nav.connectStart, nav.connectEnd)],
			['Server answering', ms(nav.requestStart, nav.responseStart)],
			['Downloading the page', ms(nav.responseStart, nav.responseEnd)],
			['Page ready to use', ms(nav.startTime || 0.0001, nav.domContentLoadedEventEnd)],
			['Everything loaded', ms(nav.startTime || 0.0001, nav.loadEventEnd)],
			['Time since tap', Math.round(performance.now()) + ' ms'],
			['Protocol', nav.nextHopProtocol || '?'],
		];
		var res = performance.getEntriesByType('resource').slice().sort(function (a, b) { return b.duration - a.duration; }).slice(0, 8);
		var box = document.createElement('div');
		box.setAttribute('style', 'position:fixed;left:8px;right:8px;bottom:8px;z-index:99999;background:#000;color:#fff;font:12px/1.45 ui-monospace,Menlo,monospace;padding:10px 12px;border-radius:10px;border:1px solid #444;max-height:60vh;overflow:auto;white-space:pre-wrap');
		var text = rows.map(function (r) { return r[0] + ': ' + r[1]; }).join('\n') + '\n\nSlowest files:\n' + res.map(function (r) {
			var name = r.name.replace(location.origin, '').slice(0, 48);
			var kb = r.transferSize ? Math.round(r.transferSize / 1024) + ' KB' : r.transferSize === 0 ? 'kept' : '';
			return Math.round(r.duration) + ' ms  ' + kb + '  ' + name + '  (started ' + Math.round(r.startTime) + ')';
		}).join('\n') + '\n\nTap to close. Screenshot this and send it.';
		box.textContent = text;
		box.onclick = function () { box.remove(); };
		document.body.appendChild(box);
	}
	// after the page and its previews have had a moment
	if (document.readyState === 'complete') setTimeout(show, 2500);
	else window.addEventListener('load', function () { setTimeout(show, 2500); });
})();
