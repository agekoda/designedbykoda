// Planner: a week strip across the top, your events on the left and your Google Tasks on the right.
// It is a fixed design built from the same widgets as the layout builder, so it needs no firmware change.
import type { LayoutCtx } from '../context';
import { renderCustom } from '../builder/render';
import { sanitizeLayout, templateById } from '../builder/model';

export function planner(ctx: LayoutCtx): string {
	return renderCustom({ ...ctx, custom: sanitizeLayout(templateById('planner').build()) });
}
