// Your own design, from the layout builder. The widgets and where they sit are saved per device;
// see builder/model.ts for what a layout is and builder/render.ts for how each widget draws.
import type { LayoutCtx } from '../context';
import { renderCustom } from '../builder/render';

export function custom(ctx: LayoutCtx): string {
	return renderCustom(ctx);
}
