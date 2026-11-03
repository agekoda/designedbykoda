// A made-up landscape (sun over layered hills) used as the Photo frame's thumbnail,
// so the layout card shows what a photo looks like before you add your own.
import { DEFAULT_IMAGE_SETTINGS, FRAME, ditherGray, packBits } from './image';

export function sampleFrameBytes(): Uint8Array {
	const { w, h } = FRAME;
	const g = new Float32Array(w * h);
	const ridge = (x: number, seed: number, amp: number, base: number) =>
		base + amp * (Math.sin(x * 0.011 + seed) * 0.55 + Math.sin(x * 0.027 + seed * 2.3) * 0.28 + Math.sin(x * 0.061 + seed * 4.1) * 0.12);
	const sun = { x: 278, y: 150, r: 34 };
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			// sky: darker at the top, bright near the horizon
			let v = 70 + (y / 200) * 175;
			const dx = x - sun.x;
			const dy = y - sun.y;
			const dist = Math.sqrt(dx * dx + dy * dy);
			v += Math.max(0, 1 - dist / 170) * 70; // glow
			if (dist < sun.r) v = 255;
			// hills, far to near
			if (y > ridge(x, 1.2, 26, 178)) v = 188 - (y - 178) * 0.25;
			if (y > ridge(x, 3.7, 34, 208)) v = 128 - (y - 208) * 0.3;
			if (y > ridge(x, 6.1, 30, 244)) v = 52 - (y - 244) * 0.2;
			g[y * w + x] = Math.max(0, Math.min(255, v));
		}
	}
	return packBits(ditherGray(g, w, h, { ...DEFAULT_IMAGE_SETTINGS }), w, h);
}
