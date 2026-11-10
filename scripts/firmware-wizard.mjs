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
const ask = async (q, def) => {
	const a = (await rl.question(def ? `${q} [${def}]: ` : `${q}: `)).trim().replace(/^["']|["']$/g, '');
	return a || def || '';
};
const yes = async (q, def = 'y') => /^y/i.test(await ask(`${q} (y/n)`, def));
const line = () => console.log('-'.repeat(64));
const clear = () => process.stdout.write('\x1b[2J\x1b[3J\x1b[H'); // clears the window (and its scrollback)
const header = (title) => {
	clear();
	console.log(`E-Ink Calendar firmware${title ? '  >  ' + title : ''}\n`);
};
const isVer = (v) => /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v || '');
const cmp = (a, b) => {
	const x = a.split('.').map(Number), y = b.split('.').map(Number);
	for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
	return 0;
};
const bump = (v) => {
	const [a, b, c] = v.split('.').map(Number);
	return `${a}.${b}.${c + 1}`;
};
const load = () => JSON.parse(readFileSync(DATA, 'utf8'));
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

function channelsOf(d, v) {
	return ['stable', 'beta'].filter((c) => d.channels[c]?.version === v);
}
function showReleases(d, n = 5) {
	const list = [...d.releases].sort((a, b) => cmp(b.version, a.version)).slice(0, n);
	if (!list.length) return console.log('  (no versions yet)');
	for (const r of list) {
		const on = channelsOf(d, r.version);
		console.log(`  ${r.version.padEnd(8)} ${r.date}  ${(r.size / 1024 / 1024).toFixed(2)} MB  ${on.length ? '<- ' + on.join(' + ') : '      '}  ${r.notes || ''}`);
	}
}
function showChannels(d) {
	for (const c of ['stable', 'beta']) {
		const ch = d.channels[c];
		console.log(`  ${c === 'stable' ? 'Everyone (stable)' : 'Beta (your test calendars)'}: ${ch.version ?? 'nothing yet'}${ch.version ? (ch.auto ? ', installs on next wake' : ', Update now only') : ''}`);
	}
}

// Commit the release files, push, and wait until the site serves the .bin.
// newFile: false when no new .bin is uploaded (a revert or a send), so there's nothing to wait for.
async function publish(message, version, newFile = true) {
	const files = ['src/data/firmware-releases.json'];
	if (version && existsSync(join(ROOT, 'public/fw', version + '.bin'))) files.push(`public/fw/${version}.bin`);
	try {
		git('add', ...files);
		git('commit', '-m', message);
	} catch (e) {
		console.log('\nCouldn\'t commit:\n' + (e.stdout || e.message));
		return false;
	}
	console.log('\nPushing...');
	const push = spawnSync('git', ['push'], { cwd: ROOT, stdio: 'inherit' });
	if (push.status !== 0) {
		console.log('\nThe push failed. Nothing reaches the calendars until it is pushed: fix the problem above, then run "git push".');
		return false;
	}
	if (!newFile) {
		console.log('Pushed. It takes effect when the Cloudflare deploy finishes (usually a minute or two).');
		return true;
	}
	console.log('Pushed. Waiting for the site to deploy (up to 10 minutes)...');
	const url = `${SITE}/fw/${version}.bin`;
	const want = load().channels;
	for (let i = 0; i < 60; i++) {
		await new Promise((r) => setTimeout(r, 10000));
		try {
			const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
			if (res.ok) {
				console.log(`\nLive: ${url}`);
				console.log(`Calendars on stable will run ${want.stable.version ?? '(nothing)'}, beta ${want.beta.version ?? '(nothing)'}.`);
				return true;
			}
		} catch {}
		process.stdout.write('.');
	}
	console.log(`\nStill not live after 10 minutes. Check the deploy in Cloudflare. (${url})`);
	return false;
}

async function newVersion() {
	const d = load();
	header('Release a new version');
	console.log('Latest versions:');
	showReleases(d);
	const latest = [...d.releases].sort((a, b) => cmp(b.version, a.version))[0]?.version ?? '1.0.0';
	line();
	console.log('In Arduino: set FW_VERSION, then Sketch > Export Compiled Binary.');
	console.log('Use main_partial.ino.bin (not .merged, .bootloader or .partitions). You can drag the file in here.\n');
	const p = prefs();
	let file;
	for (;;) {
		file = await ask('Compiled binary', p.bin || DEFAULT_BIN);
		if (existsSync(file) && statSync(file).isFile()) break;
		console.log("  That file doesn't exist. Try again.");
	}
	const st = statSync(file);
	console.log(`  ${(st.size / 1024 / 1024).toFixed(2)} MB, exported ${ago(Date.now() - st.mtimeMs)}.`);
	if (Date.now() - st.mtimeMs > 60 * 60 * 1000 && !(await yes('  That export is over an hour old. Use it anyway?', 'n'))) return;
	savePrefs({ ...p, bin: file });

	// Suggest the version written inside the binary, if one newer than the latest is there.
	const bin = readFileSync(file);
	const found = [...new Set([...bin.toString('latin1').matchAll(/\0(\d{1,3}\.\d{1,3}\.\d{1,3})\0/g)].map((m) => m[1]))].filter((v) => cmp(v, latest) > 0);
	const suggest = found.length === 1 ? found[0] : bump(latest);
	if (found.length === 1) console.log(`  The file says it's version ${found[0]}.`);
	let version;
	for (;;) {
		version = await ask(`New version number (latest is ${latest})`, suggest);
		if (!isVer(version)) console.log('  Like 1.0.3.');
		else if (d.releases.some((r) => r.version === version)) console.log(`  ${version} already exists. Pick a new number.`);
		else break;
	}
	if (cmp(version, latest) <= 0) console.log(`  Note: ${version} is older than ${latest}. Calendars only move to it with a revert.`);
	const notes = await ask("What's new (shown on the dashboard)", '');

	console.log('\nWho gets it?');
	console.log('  1) Beta only: your own test calendars first (recommended)');
	console.log('  2) Everyone');
	const who = (await ask('Choose', '1')) === '2' ? 'stable' : 'beta';
	console.log('\nHow?');
	console.log('  1) Installs by itself on the next wake (midnight or a button press)');
	console.log('  2) Only when someone clicks Update now on the dashboard');
	const manual = (await ask('Choose', '1')) === '2';

	line();
	console.log(`Version ${version} from ${file}`);
	console.log(`To: ${who === 'stable' ? 'everyone' : 'beta'}, ${manual ? 'Update now only' : 'on the next wake'}. Notes: ${notes || '(none)'}`);
	if (!(await yes('Go ahead?'))) return console.log('Nothing done.');

	if (!release('add', file, '--version', version, '--notes', notes)) return console.log('\nNothing was sent. Fix the problem above and run the wizard again.');
	const extra = manual ? ['--manual'] : [];
	// "Everyone" also moves beta, so beta is never behind stable.
	const okBeta = cmp(version, load().channels.beta.version ?? '0.0.0') > 0 ? release('send', version, '--channel', 'beta', ...extra) : true;
	const okStable = who === 'stable' ? release('send', version, '--channel', 'stable', ...extra) : true;
	if (!okBeta || !okStable) {
		console.log('\nAdded, but not sent. Check the message above.');
		await publish(`Firmware ${version} (added)`, version);
		return;
	}
	await publish(`Firmware ${version} to ${who === 'stable' ? 'everyone' : 'beta'}`, version);
}

async function promote() {
	const d = load();
	header('Send beta to everyone');
	const b = d.channels.beta.version;
	const s = d.channels.stable.version;
	if (!b || (s && cmp(b, s) <= 0)) return console.log(`\nBeta (${b ?? 'nothing'}) isn't ahead of everyone (${s ?? 'nothing'}). Nothing to send.`);
	console.log(`\nSend ${b} (now on beta) to everyone? They're on ${s ?? 'nothing yet'}.`);
	const manual = (await ask('1) on their next wake  2) Update now only', '1')) === '2';
	if (!(await yes('Go ahead?'))) return;
	if (release('send', b, '--channel', 'stable', ...(manual ? ['--manual'] : []))) await publish(`Firmware ${b} to everyone`, b, false);
}

async function revert() {
	const d = load();
	header('Emergency revert');
	console.log('\nEmergency revert: calendars go back to an older version on their next wake,');
	console.log('with no link on the dashboard. Release a fixed, newer version afterwards.\n');
	showChannels(d);
	const ch = (await ask('Which calendars? 1) everyone  2) beta', '1')) === '2' ? 'beta' : 'stable';
	const cur = d.channels[ch].version;
	if (!cur) return console.log('Nothing is on that channel yet.');
	const older = d.releases.filter((r) => cmp(r.version, cur) < 0).sort((a, b) => cmp(b.version, a.version));
	if (!older.length) return console.log(`There's no version older than ${cur} to go back to.`);
	console.log(`\nThey're on ${cur}. Go back to:`);
	older.slice(0, 5).forEach((r, i) => console.log(`  ${i + 1}) ${r.version}  ${r.date}  ${r.notes || ''}`));
	const pick = older[Number(await ask('Choose', '1')) - 1];
	if (!pick) return console.log('Nothing done.');
	if (!(await yes(`Send ${ch === 'stable' ? 'everyone' : 'beta'} back from ${cur} to ${pick.version}?`, 'n'))) return console.log('Nothing done.');
	if (release('revert', pick.version, '--channel', ch)) await publish(`Revert ${ch} to ${pick.version}`, pick.version, false);
}

function listAll() {
	const d = load();
	header('All versions');
	showChannels(d);
	line();
	console.log('All versions:');
	showReleases(d, 1000);
	for (const r of [...d.releases].sort((a, b) => cmp(b.version, a.version)).slice(0, 1)) {
		console.log(`\nNewest: ${r.version}, ${r.size} bytes, sha256 ${r.sha256.slice(0, 16)}...`);
		console.log(`  ${SITE}/fw/${r.version}.bin`);
	}
}

async function main() {
	header();
	// Up to date with what's deployed (and on the right branch).
	try {
		const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
		if (branch !== 'main') console.log(`Note: you're on branch "${branch}", not main. Releases only go live from main.\n`);
		const dirty = git('status', '--porcelain', '--', 'src/data/firmware-releases.json', 'public/fw');
		if (dirty) console.log('Note: there are uncommitted firmware changes:\n' + dirty + '\n');
		console.log('Getting the latest from GitHub...');
		spawnSync('git', ['pull', '--ff-only', '-q'], { cwd: ROOT, stdio: 'inherit' });
	} catch {
		console.log("Couldn't run git. Is Git installed?");
	}
	for (;;) {
		const d = load();
		header();
		showChannels(d);
		line();
		console.log('  1) Release a new version');
		console.log('  2) Send the beta version to everyone');
		console.log('  3) Emergency revert to an older version');
		console.log('  4) List all versions');
		console.log('  5) Quit');
		const c = await ask('Choose', '1');
		try {
			if (c === '1') await newVersion();
			else if (c === '2') await promote();
			else if (c === '3') await revert();
			else if (c === '4') listAll();
			else break;
		} catch (e) {
			console.log('\nSomething went wrong: ' + (e?.message || e));
		}
		await rl.question('\nPress Enter to go back to the menu.');
	}
	rl.close();
}
main();
