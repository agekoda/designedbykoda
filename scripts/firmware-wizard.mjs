// Firmware release wizard. Double-click firmware.bat in the repo folder (or: node scripts/firmware-wizard.mjs).
// It does what scripts/firmware-release.mjs does, step by step, then commits, pushes and waits
// for the deploy. The release list comes from the repo after a git pull, which is exactly what
// the live site serves once deployed.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DATA = join(ROOT, 'src/data/firmware-releases.json');
const RELEASE = join(ROOT, 'scripts/firmware-release.mjs');
const SITE = process.env.FW_SITE || 'https://designedbykoda.com';
const PREFS_DIR = join(homedir(), '.designedbykoda');
const PREFS = join(PREFS_DIR, 'wizard.json');
const DEFAULT_BIN = join(homedir(), 'Downloads', 'main_partial', 'build', 'esp32.esp32.esp32c3', 'main_partial.ino.bin');

const rl = createInterface({ input: process.stdin, output: process.stdout });

// ---------------------------------------------------------------- looks
const useColor = !process.env.NO_COLOR && process.stdout.isTTY;
const paint = (code) => (t) => (useColor ? `\x1b[${code}m${t}\x1b[0m` : String(t));
const c = { bold: paint('1'), dim: paint('2'), cyan: paint('36'), green: paint('32'), yellow: paint('33'), red: paint('31'), inv: paint('7') };
const W = 70;
const strip = (t) => String(t).replace(/\x1b\[[0-9;]*m/g, '');
const pad = (t, n) => String(t) + ' '.repeat(Math.max(0, n - strip(t).length));
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
const clear = () => process.stdout.write('\x1b[2J\x1b[3J\x1b[H'); // clears the window (and its scrollback)
const header = (where) => {
	clear();
	const left = '  E-Ink Calendar firmware';
	const right = where ? where + '  ' : '';
	gap();
	console.log(c.inv(c.bold(pad(left, W - strip(right).length) + right)));
};
const ask = async (q, def) => {
	const a = (await rl.question('  ' + c.cyan('› ') + q + (def ? c.dim(` [${def}]`) : '') + ': ')).trim().replace(/^["']|["']$/g, '');
	return a || def || '';
};
const yes = async (q, def = 'y') => /^y/i.test(await ask(`${q} ${c.dim('(y/n)')}`, def));
// Numbered choices. Returns the 0-based index picked, or -1.
async function choose(q, options, def = 1) {
	options.forEach((o, i) => say(`${c.bold(c.cyan(String(i + 1)))}  ${o}`));
	gap();
	const n = Number(await ask(q, String(def)));
	return Number.isInteger(n) && n >= 1 && n <= options.length ? n - 1 : -1;
}

// ---------------------------------------------------------------- data
const isVer = (v) => /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v || '');
const cmp = (a, b) => {
	const x = a.split('.').map(Number), y = b.split('.').map(Number);
	for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
	return 0;
};
const bump = (v) => {
	const [a, b, n] = v.split('.').map(Number);
	return `${a}.${b}.${n + 1}`;
};
const load = () => JSON.parse(readFileSync(DATA, 'utf8'));
const sorted = (d) => [...d.releases].sort((a, b) => cmp(b.version, a.version));
const prefs = () => {
	try {
		return JSON.parse(readFileSync(PREFS, 'utf8'));
	} catch {
		return {};
	}
};
const savePrefs = (p) => {
	try {
		mkdirSync(PREFS_DIR, { recursive: true });
		writeFileSync(PREFS, JSON.stringify(p, null, 2));
	} catch {}
};
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
const release = (...a) => spawnSync(process.execPath, [RELEASE, ...a], { cwd: ROOT, stdio: 'inherit' }).status === 0;
const ago = (ms) => {
	const m = Math.round(ms / 60000);
	return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};
const who = (ch) => (ch === 'stable' ? 'everyone' : 'beta');

function onWhich(d, v) {
	return ['stable', 'beta'].filter((ch) => d.channels[ch]?.version === v).map(who).join(' + ');
}
function showChannels(d) {
	for (const ch of ['stable', 'beta']) {
		const x = d.channels[ch];
		const name = ch === 'stable' ? 'Everyone' : 'Beta  ' + c.dim('(your test calendars)');
		const v = x.version ? c.bold(c.green(x.version)) : c.dim('nothing yet');
		const how = x.version ? c.dim(x.auto ? 'installs on next wake' : 'Update now only') : '';
		say(pad(name, 34) + pad(v, 10) + how);
	}
}
function showReleases(d, n = 5) {
	const list = sorted(d).slice(0, n);
	if (!list.length) return say(c.dim('No versions yet.'));
	say(c.dim(pad('Version', 10) + pad('Date', 13) + pad('Size', 10) + pad('Running on', 18) + 'Notes'));
	for (const r of list) {
		const on = onWhich(d, r.version);
		say(pad(c.bold(r.version), 10) + pad(r.date, 13) + pad((r.size / 1024 / 1024).toFixed(2) + ' MB', 10) + pad(on ? c.green(on) : c.dim('·'), 18) + (r.notes || c.dim('no notes')));
	}
}
function overview(d) {
	title('Calendars are running');
	showChannels(d);
	title('Latest versions');
	showReleases(d);
}

// Commit the release files, push, and (for a new file) wait until the site serves it.
async function publish(message, version, newFile = true) {
	const files = ['src/data/firmware-releases.json'];
	if (version && existsSync(join(ROOT, 'public/fw', version + '.bin'))) files.push(`public/fw/${version}.bin`);
	gap();
	try {
		git('add', ...files);
		git('commit', '-m', message);
	} catch (e) {
		bad("Couldn't commit:");
		say(c.dim(String(e.stdout || e.message).trim()));
		return false;
	}
	say(c.dim('Pushing to GitHub…'));
	const push = spawnSync('git', ['push', '-q'], { cwd: ROOT, stdio: 'inherit' });
	if (push.status !== 0) {
		bad('The push failed. Nothing reaches the calendars until it is pushed.');
		say(c.dim('Fix the problem above, then run "git push".'));
		return false;
	}
	ok('Pushed.');
	if (!newFile) {
		say(c.dim('It takes effect when the Cloudflare deploy finishes, usually a minute or two.'));
		return true;
	}
	process.stdout.write('  ' + c.dim('Waiting for the site to deploy '));
	const url = `${SITE}/fw/${version}.bin`;
	for (let i = 0; i < 60; i++) {
		await new Promise((r) => setTimeout(r, 10000));
		try {
			const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
			if (res.ok) {
				gap();
				ok(`Live: ${c.cyan(url)}`);
				return true;
			}
		} catch {}
		process.stdout.write(c.dim('.'));
	}
	gap();
	warn(`Still not live after 10 minutes. Check the deploy in Cloudflare.`);
	return false;
}

// ---------------------------------------------------------------- 1) release a new version
async function newVersion() {
	const d = load();
	header('New version');
	title('Latest versions');
	showReleases(d);
	const latest = sorted(d)[0]?.version ?? '1.0.0';

	title('The file');
	say('In Arduino: set ' + c.bold('FW_VERSION') + ', then ' + c.bold('Sketch > Export Compiled Binary') + '.');
	say('Use ' + c.bold('main_partial.ino.bin') + c.dim(' (not .merged, .bootloader or .partitions).'));
	say(c.dim('You can drag the file into this window.'));
	gap();
	const p = prefs();
	let file;
	for (;;) {
		file = await ask('Compiled binary', p.bin || DEFAULT_BIN);
		if (existsSync(file) && statSync(file).isFile()) break;
		bad("That file doesn't exist. Try again.");
	}
	const st = statSync(file);
	say(c.dim(`${(st.size / 1024 / 1024).toFixed(2)} MB, exported ${ago(Date.now() - st.mtimeMs)}.`));
	if (Date.now() - st.mtimeMs > 60 * 60 * 1000 && !(await yes(c.yellow('That export is over an hour old.') + ' Use it anyway?', 'n'))) return;
	savePrefs({ ...p, bin: file });

	// Suggest the version written inside the binary. The file also holds other version numbers
	// (the ESP32 core's, like 3.3.11), so only a number just after the latest release counts.
	const bin = readFileSync(file);
	const [lM, lm] = latest.split('.').map(Number);
	const found = [...new Set([...bin.toString('latin1').matchAll(/\0(\d{1,3}\.\d{1,3}\.\d{1,3})\0/g)].map((m) => m[1]))].filter((v) => {
		const [M, m] = v.split('.').map(Number);
		return cmp(v, latest) > 0 && M === lM && m <= lm + 1;
	});
	const suggest = found.length === 1 ? found[0] : bump(latest);

	title('Details');
	if (found.length === 1) say(c.dim(`The file says it's version ${found[0]}.`));
	let version;
	for (;;) {
		version = await ask(`Version number ${c.dim(`(latest is ${latest})`)}`, suggest);
		if (!isVer(version)) bad('Like 1.0.3.');
		else if (d.releases.some((r) => r.version === version)) bad(`${version} already exists. Pick a new number.`);
		else break;
	}
	if (cmp(version, latest) <= 0) warn(`${version} is older than ${latest}.`);
	const notes = await ask("What's new " + c.dim('(shown on the dashboard)'), '');

	title('Who gets it?');
	const w = await choose('Choose', ['Beta only ' + c.dim('(your own test calendars first, recommended)'), 'Everyone'], 1);
	if (w < 0) return say('Nothing done.');
	const toAll = w === 1;
	title('When?');
	const h = await choose('Choose', ['By itself on the next wake ' + c.dim('(midnight or a button press)'), 'Only when someone clicks Update now'], 1);
	if (h < 0) return say('Nothing done.');
	const manual = h === 1;

	title('Check');
	say(pad(c.dim('Version'), 14) + c.bold(version));
	say(pad(c.dim('File'), 14) + file);
	say(pad(c.dim('Goes to'), 14) + (toAll ? 'everyone' : 'beta') + c.dim(manual ? ', Update now only' : ', on the next wake'));
	say(pad(c.dim('Notes'), 14) + (notes || c.dim('none')));
	gap();
	if (!(await yes('Go ahead?'))) return say('Nothing done.');
	gap();

	if (!release('add', file, '--version', version, '--notes', notes)) return bad('Nothing was sent. Fix the problem above and run the wizard again.');
	const extra = manual ? ['--manual'] : [];
	// "Everyone" also moves beta, so beta is never behind everyone.
	const okBeta = cmp(version, load().channels.beta.version ?? '0.0.0') > 0 ? release('send', version, '--channel', 'beta', ...extra) : true;
	const okStable = toAll ? release('send', version, '--channel', 'stable', ...extra) : true;
	if (!okBeta || !okStable) {
		warn('Added, but not sent. Check the message above.');
		await publish(`Firmware ${version} (added)`, version);
		return;
	}
	await publish(`Firmware ${version} to ${toAll ? 'everyone' : 'beta'}`, version);
}

// ---------------------------------------------------------------- 2) beta to everyone
async function promote() {
	const d = load();
	header('Beta to everyone');
	title('Calendars are running');
	showChannels(d);
	const b = d.channels.beta.version;
	const s = d.channels.stable.version;
	gap();
	if (!b || (s && cmp(b, s) <= 0)) return say(`Beta ${c.dim(`(${b ?? 'nothing'})`)} isn't ahead of everyone ${c.dim(`(${s ?? 'nothing'})`)}, so there's nothing to send.`);
	say(`Send ${c.bold(b)} to everyone? They're on ${c.bold(s ?? 'nothing yet')}.`);
	gap();
	const h = await choose('Choose', ['On their next wake', 'Only when someone clicks Update now'], 1);
	if (h < 0) return say('Nothing done.');
	if (!(await yes('Go ahead?'))) return say('Nothing done.');
	gap();
	if (release('send', b, '--channel', 'stable', ...(h === 1 ? ['--manual'] : []))) await publish(`Firmware ${b} to everyone`, b, false);
}

// ---------------------------------------------------------------- 3) move to another version
// Back (an emergency revert) or forward (to any version already added), without a new build.
async function moveVersion() {
	const d = load();
	header('Change version');
	say(c.dim('Move calendars to any version already added: back to an older one if a release has'));
	say(c.dim('a problem, or forward again afterwards. They change on their next wake.'));
	title('Calendars are running');
	showChannels(d);
	title('Which calendars?');
	const w = await choose('Choose', ['Everyone', 'Only beta'], 1);
	if (w < 0) return say('Nothing done.');
	const ch = w === 0 ? 'stable' : 'beta';
	const cur = d.channels[ch].version;
	const others = sorted(d).filter((r) => r.version !== cur).slice(0, 8);
	if (!others.length) return say(c.dim('There are no other versions to move to.'));

	title(`They're on ${cur ?? 'nothing yet'}. Move them to:`);
	const n = await choose(
		'Choose',
		others.map((r) => {
			const dir = !cur ? '' : cmp(r.version, cur) > 0 ? c.green('forward ') : c.yellow('back    ');
			return pad(c.bold(r.version), 9) + dir + c.dim(r.date + '  ') + (r.notes || '');
		}),
		1
	);
	const pick = others[n];
	if (!pick) return say('Nothing done.');
	const back = cur && cmp(pick.version, cur) < 0;
	gap();
	if (!(await yes(`Move ${who(ch)} ${back ? 'back' : 'forward'} from ${cur ?? 'nothing'} to ${c.bold(pick.version)}?`, back ? 'n' : 'y'))) return say('Nothing done.');
	gap();
	let done;
	if (back) {
		done = release('revert', pick.version, '--channel', ch);
	} else {
		// forward: beta first, so everyone never runs something beta hasn't
		const bv = load().channels.beta.version;
		done = ch === 'beta' || !bv || cmp(pick.version, bv) <= 0 ? true : release('send', pick.version, '--channel', 'beta');
		if (done) done = release('send', pick.version, '--channel', ch);
	}
	if (done) await publish(`Move ${who(ch)} to ${pick.version}`, pick.version, false);
}

// ---------------------------------------------------------------- 4) list
function listAll() {
	const d = load();
	header('All versions');
	title('Calendars are running');
	showChannels(d);
	title('Every version');
	showReleases(d, 1000);
	const r = sorted(d)[0];
	if (r) {
		gap();
		say(c.dim(`Newest file: ${SITE}/fw/${r.version}.bin`));
		say(c.dim(`SHA-256 ${r.sha256.slice(0, 32)}…`));
	}
}

// ---------------------------------------------------------------- menu
async function main() {
	header();
	try {
		const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
		if (branch !== 'main') warn(`You're on branch "${branch}", not main. Releases only go live from main.`);
		const dirty = git('status', '--porcelain', '--', 'src/data/firmware-releases.json', 'public/fw');
		if (dirty) warn('There are uncommitted firmware changes:\n' + c.dim(dirty));
		say(c.dim('Getting the latest from GitHub…'));
		spawnSync('git', ['pull', '--ff-only', '-q'], { cwd: ROOT, stdio: 'inherit' });
	} catch {
		bad("Couldn't run git. Is Git installed?");
	}
	for (;;) {
		header();
		overview(load());
		title('What do you want to do?');
		const n = await choose('Choose', ['Release a new version', 'Send the beta version to everyone', 'Change version ' + c.dim('(back or forward)'), 'List all versions', 'Quit'], 1);
		if (n === 4) break;
		try {
			if (n === 0) await newVersion();
			else if (n === 1) await promote();
			else if (n === 2) await moveVersion();
			else if (n === 3) listAll();
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
