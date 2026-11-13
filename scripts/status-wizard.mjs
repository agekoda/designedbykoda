// Status page incidents. Double-click status-incident.bat in the repo folder (or: node scripts/status-wizard.mjs).
// Adds, closes and deletes rows in the live status_incidents table through wrangler, so it needs your
// Cloudflare login. KODA_DRYRUN=1 shows the SQL without sending it.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DB = 'eink-calendar-db';
const SITE = 'https://designedbykoda.com';
const DRY = !!process.env.KODA_DRYRUN;

const rl = createInterface({ input: process.stdin, output: process.stdout });

// ---------------------------------------------------------------- looks (same as firmware.bat)
const useColor = !process.env.NO_COLOR && process.stdout.isTTY;
const paint = (code) => (t) => (useColor ? `\x1b[${code}m${t}\x1b[0m` : String(t));
const c = { bold: paint('1'), dim: paint('2'), cyan: paint('36'), green: paint('32'), yellow: paint('33'), red: paint('31'), inv: paint('7') };
const W = 70;
const strip = (t) => String(t).replace(/\x1b\[[0-9;]*m/g, '');
const pad = (t, n) => String(t) + ' '.repeat(Math.max(0, n - strip(t).length));
const cut = (t, n) => (String(t).length > n ? String(t).slice(0, n - 1) + '…' : String(t));
const say = (t = '') => console.log('  ' + t);
const gap = () => console.log('');
const rule = () => say(c.dim('─'.repeat(W - 4)));
const title = (t) => {
	gap();
	say(c.bold(t));
	rule();
};
const ok = (t) => say(c.green('• ') + t);
const warn = (t) => say(c.yellow('! ') + t);
const bad = (t) => say(c.red('× ') + t);
const clear = () => process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
const header = (where) => {
	clear();
	const left = '  designedbykoda status page';
	const right = (DRY ? 'dry run · ' : '') + (where ? where + '  ' : '');
	gap();
	console.log(c.inv(c.bold(pad(left, W - strip(right).length) + right)));
};
const ask = async (q, def) => {
	const a = (await rl.question('  ' + c.cyan('› ') + q + (def ? c.dim(` [${def}]`) : '') + ': ')).trim();
	return a || def || '';
};
const yes = async (q, def = 'y') => /^y/i.test(await ask(`${q} ${c.dim('(y/n)')}`, def));
async function choose(q, options, def = 1) {
	options.forEach((o, i) => say(`${c.bold(c.cyan(String(i + 1)))}  ${o}`));
	gap();
	const n = Number(await ask(q, String(def)));
	return Number.isInteger(n) && n >= 1 && n <= options.length ? n - 1 : -1;
}

// ---------------------------------------------------------------- database
// Double quotes would break the command line, so they become apostrophes.
const text = (s) => "'" + String(s).replace(/"/g, "'").replace(/[\r\n]+/g, ' ').replace(/'/g, "''") + "'";
const NOW = "CAST((julianday('now') - 2440587.5) * 86400 AS INTEGER)";

// Runs one statement on the live database. Returns the rows, or null if it failed.
function sql(q, { quiet = false } = {}) {
	const one = q.replace(/[\r\n]+/g, ' ').trim();
	if (DRY) {
		say(c.dim('Would run: ' + one));
		return [];
	}
	if (!quiet) say(c.dim('Talking to the database…'));
	const args = ['wrangler', 'd1', 'execute', DB, '--remote', '--json', '--command'];
	const r =
		process.platform === 'win32'
			? spawnSync(`npx ${args.join(' ')} "${one}"`, { cwd: ROOT, encoding: 'utf8', shell: true })
			: spawnSync('npx', [...args, one], { cwd: ROOT, encoding: 'utf8' });
	try {
		const out = JSON.parse(r.stdout.slice(r.stdout.search(/^\s*\[/m)));
		if (r.status === 0) return out.flatMap((x) => x.results ?? []);
	} catch {}
	bad("The database didn't answer.");
	say(c.dim((r.stderr || r.stdout || r.error?.message || '').trim().split('\n').slice(-6).join('\n  ')));
	say(c.dim('Usually: not logged in (run "npx wrangler login") or no internet.'));
	return null;
}

const COMPONENTS = [
	['website', 'Website', 'the pages and dashboard'],
	['device_api', 'Device API', 'what the calendars talk to'],
	['database', 'Database', 'pairing, devices, settings'],
	['google_signin', 'Google sign-in', ''],
	['google_calendar', 'Google Calendar', ''],
	['cloudflare', 'Cloudflare', 'Cloudflare itself'],
	[null, 'Whole site', 'not one specific service'],
];
const SEVERITIES = [
	['outage', c.red('Outage'), 'red, something is down'],
	['degraded', c.yellow('Degraded'), 'amber, slow or partly working'],
	['maintenance', c.yellow('Maintenance'), 'amber, planned work'],
	['info', c.cyan('Info'), "a notice only, the banner doesn't change"],
];
const compName = (k) => COMPONENTS.find((x) => x[0] === (k ?? null))?.[1] ?? k;
const sevName = (k) => SEVERITIES.find((x) => x[0] === k)?.[1] ?? k;
const ago = (t) => {
	const m = Math.round((Date.now() / 1000 - t) / 60);
	return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};

const recent = (n = 10) =>
	sql(`SELECT id, component, title, severity, source, started_at, resolved_at FROM status_incidents ORDER BY started_at DESC LIMIT ${n};`, { quiet: true });

function showList(rows, { onlyOpen = false } = {}) {
	const list = onlyOpen ? rows.filter((r) => !r.resolved_at) : rows;
	if (!list.length) return say(c.dim(onlyOpen ? 'Nothing ongoing. All good.' : 'No incidents yet.'));
	say(c.dim(pad('Id', 6) + pad('State', 11) + pad('Severity', 13) + pad('Service', 17) + 'Title'));
	for (const r of list) {
		const state = r.resolved_at ? c.dim('resolved') : c.bold(c.red('ongoing'));
		say(pad(c.bold(r.id), 6) + pad(state, 11) + pad(sevName(r.severity), 13) + pad(compName(r.component), 17) + cut(r.title, 30));
		say(pad('', 6) + c.dim(`started ${ago(r.started_at)}${r.source && r.source !== 'manual' ? ', found automatically' : ''}`));
	}
}

// ---------------------------------------------------------------- 1) add
async function add() {
	header('Add');
	title('Which service is it about?');
	const ci = await choose(
		'Choose',
		COMPONENTS.map(([, n, d]) => pad(n, 17) + c.dim(d)),
		COMPONENTS.length
	);
	if (ci < 0) return say('Nothing done.');
	title('How serious is it?');
	const si = await choose(
		'Choose',
		SEVERITIES.map(([, n, d]) => pad(n, 14) + c.dim(d)),
		1
	);
	if (si < 0) return say('Nothing done.');

	title('Details');
	let head = '';
	while (!head) head = await ask('Title ' + c.dim('(short, e.g. Calendar updates delayed)'));
	const body = await ask('Message ' + c.dim('(what people should know, Enter to skip)'));
	let mins;
	for (;;) {
		const m = await ask('Started how many minutes ago', '0');
		mins = Number(m);
		if (Number.isInteger(mins) && mins >= 0) break;
		bad('A whole number of minutes, like 15.');
	}

	const [comp] = COMPONENTS[ci];
	const [sev] = SEVERITIES[si];
	title('Check');
	say(pad(c.dim('Service'), 14) + compName(comp));
	say(pad(c.dim('Severity'), 14) + sevName(sev));
	say(pad(c.dim('Title'), 14) + c.bold(head));
	say(pad(c.dim('Message'), 14) + (body || c.dim('none')));
	say(pad(c.dim('Started'), 14) + (mins ? `${mins} min ago` : 'just now'));
	gap();
	if (!(await yes('Put it on the live status page?'))) return say('Nothing done.');
	gap();
	const q = `INSERT INTO status_incidents (component, title, body, severity, source, started_at) VALUES (${comp ? text(comp) : 'NULL'}, ${text(head)}, ${body ? text(body) : 'NULL'}, ${text(sev)}, 'manual', ${NOW}${mins ? ' - ' + mins * 60 : ''});`;
	if (sql(q)) ok(`Added. It shows on ${c.cyan(SITE + '/status')} within about 30 seconds.`);
}

// Pick one incident from a list. Returns it, or null.
async function pickIncident(rows, what) {
	if (!rows.length) {
		say(c.dim(`There's nothing to ${what}.`));
		return null;
	}
	const n = await choose(
		'Choose',
		rows.map((r) => pad(sevName(r.severity), 13) + pad(compName(r.component), 17) + cut(r.title, 28) + c.dim(`  ${ago(r.started_at)}`)),
		1
	);
	return rows[n] ?? null;
}

// ---------------------------------------------------------------- 2) close
async function close() {
	header('Close');
	const rows = recent(30);
	if (!rows) return;
	title('Which one is fixed?');
	const r = await pickIncident(
		rows.filter((x) => !x.resolved_at),
		'close'
	);
	if (!r) return say('Nothing done.');
	gap();
	if (!(await yes(`Mark "${r.title}" as resolved?`))) return say('Nothing done.');
	gap();
	if (sql(`UPDATE status_incidents SET resolved_at = ${NOW} WHERE id = ${Number(r.id)} AND resolved_at IS NULL;`)) ok('Closed. It moves to Past incidents.');
}

// ---------------------------------------------------------------- 3) list
function list() {
	header('Recent');
	const rows = recent(15);
	if (!rows) return;
	title('Recent incidents');
	showList(rows);
}

// ---------------------------------------------------------------- 4) delete
async function remove() {
	header('Delete');
	const rows = recent(15);
	if (!rows) return;
	title('Which one should go for good?');
	say(c.dim('Deleting removes it from the history too. To end one, use Close instead.'));
	gap();
	const r = await pickIncident(rows, 'delete');
	if (!r) return say('Nothing done.');
	gap();
	if (!(await yes(c.red('Delete') + ` "${r.title}" for good?`, 'n'))) return say('Nothing done.');
	gap();
	if (sql(`DELETE FROM status_incidents WHERE id = ${Number(r.id)};`)) ok('Deleted.');
}

// ---------------------------------------------------------------- menu
async function main() {
	if (!existsSync(join(ROOT, 'wrangler.json'))) {
		header();
		bad("Couldn't find wrangler.json. Keep status-incident.bat in the designedbykoda folder.");
		rl.close();
		return;
	}
	for (;;) {
		header();
		say(c.dim('Checking what is on the status page…'));
		const rows = recent(10);
		header();
		title('Ongoing right now');
		if (rows) showList(rows, { onlyOpen: true });
		title('What do you want to do?');
		const n = await choose('Choose', ['Add an incident or notice', 'Close an ongoing incident', 'Show recent incidents', 'Delete an incident', 'Quit'], 1);
		if (n === 4) break;
		try {
			if (n === 0) await add();
			else if (n === 1) await close();
			else if (n === 2) list();
			else if (n === 3) await remove();
			else continue;
		} catch (e) {
			gap();
			bad('Something went wrong: ' + (e?.message || e));
		}
		gap();
		await rl.question('  ' + c.dim('Press Enter to go back to the menu.'));
	}
	rl.close();
}
main();
