// Photo frame: your picture, edge to edge. Nothing else on the screen.
import { Draw, PAPER } from '../draw';
import { FRAME, FRAME_BYTES } from '../image';
import type { LayoutCtx } from '../context';

export function frame(ctx: LayoutCtx): string {
	const d = new Draw(ctx.family, ctx.dark);
	const img = ctx.frameImage;
	if (img && img.length === FRAME_BYTES) {
		// Stored as dark dots; on a dark screen the ink is white, so flip it to keep the picture the right way round.
		const bytes = ctx.dark ? img.map((b) => ~b & 0xff) : img;
		d.bitmapBytes(FRAME.x, FRAME.y, FRAME.w, FRAME.h, bytes);
		return d.toString();
	}
	d.fill(0, 0, 400, 30);
	d.text(10, 21, 'sb', 'PHOTO FRAME', { color: PAPER });
	d.text(200, 130, 'mb', 'Add your photo', { align: 'center' });
	d.text(200, 158, 's', 'Open your dashboard, choose Customize,', { align: 'center' });
	d.text(200, 176, 's', 'then the Picture tab.', { align: 'center' });
	return d.toString();
}
