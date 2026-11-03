// To-do: your Google Tasks, open ones first, with a tick box for each.
import { Draw, PAPER } from '../draw';
import { measure } from '../measure';
import { dayIdx, dayShort, monthShort, tmOf, type LayoutCtx, type TaskItem } from '../context';
import { batteryIcon } from '../batteryIcon';
import { parseDay } from './countdown';

const ROWS = 8;
const ROW_H = 28;
const TOP = 36;

function dueLabel(due: string | undefined, today: number): string {
	const n = due ? parseDay(due) : null;
	if (n === null) return '';
	if (n < today) return 'Overdue';
	if (n === today) return 'Today';
	if (n === today + 1) return 'Tomorrow';
	const t = tmOf(n * 86400 + 43200);
	return `${dayShort(t)} ${t.mday} ${monthShort(t)}`;
}

export function todo(ctx: LayoutCtx): string {
	const d = new Draw(ctx.family, ctx.dark);
	const fam = ctx.family;
	const now = tmOf(ctx.nowLocal);
	const today = dayIdx(ctx.nowLocal);

	d.fill(0, 0, 400, 30);
	d.text(10, 21, 'sb', 'TO-DO', { color: PAPER });
	d.text(392, 21, 's', `${dayShort(now)} ${now.mday} ${monthShort(now)}`, { align: 'right', color: PAPER });
	batteryIcon(d, ctx, 200, 7, 'center', PAPER);

	if (ctx.tasksState === 'needs_permission') {
		d.text(200, 118, 'mb', 'Connect Google Tasks', { align: 'center' });
		d.text(200, 146, 's', 'Open your dashboard, choose Customize,', { align: 'center' });
		d.text(200, 164, 's', 'then press "Connect Google Tasks".', { align: 'center' });
		return d.toString();
	}
	if (ctx.tasksState === 'error' || !ctx.tasks) {
		d.text(200, 130, 'mb', "Couldn't load your tasks", { align: 'center' });
		d.text(200, 158, 's', 'It will try again at the next update.', { align: 'center' });
		return d.toString();
	}

	const open: TaskItem[] = ctx.tasks.filter((t) => !t.done);
	const done: TaskItem[] = ctx.tasks.filter((t) => t.done);
	const list = [...open, ...done];
	if (!list.length) {
		d.text(200, 150, 'bb', 'All done!', { align: 'center', scale: 2 });
		d.text(200, 186, 's', 'Nothing on your list.', { align: 'center' });
		return d.toString();
	}

	list.slice(0, ROWS).forEach((t, i) => {
		const y = TOP + i * ROW_H;
		const bx = 12;
		const by = y + 4;
		if (t.done) {
			d.fillRound(bx, by, 18, 18, 3);
			d.line(bx + 4, by + 9, bx + 8, by + 13, PAPER);
			d.line(bx + 5, by + 9, bx + 9, by + 13, PAPER);
			d.line(bx + 8, by + 13, bx + 14, by + 5, PAPER);
			d.line(bx + 9, by + 13, bx + 15, by + 5, PAPER);
		} else {
			d.round(bx, by, 18, 18, 3);
			d.round(bx + 1, by + 1, 16, 16, 2);
		}
		const due = t.done ? '' : dueLabel(t.due, today);
		const dueW = due ? measure(fam, 's', due).w + 12 : 0;
		const maxW = 392 - 42 - dueW;
		d.text(42, y + 19, 'm', t.title, { maxW });
		if (t.done) d.hline(42, y + 13, Math.min(maxW, measure(fam, 'm', t.title).w));
		if (due) d.text(392, y + 18, 's', due, { align: 'right' });
		d.dots(12, y + ROW_H - 1, 380, 4);
	});

	batteryIcon(d, ctx, 10, 272, 'left');
	const more = list.length - ROWS;
	const summary = `${open.length} to do` + (more > 0 ? `   +${more} more` : '');
	d.text(392, 285, 's', summary, { align: 'right' });
	return d.toString();
}
