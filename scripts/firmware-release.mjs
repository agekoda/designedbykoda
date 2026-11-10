// Publishes a firmware version for over-the-air updates. See OTA.md.
//
//   node scripts/firmware-release.mjs add <file.bin> --version 1.0.1 [--notes "..."]
//       checks and signs the build, copies it to public/fw/1.0.1.bin, records it (no calendar
//       gets it yet)
//   node scripts/firmware-release.mjs send 1.0.1 --channel beta|stable [--manual]
//       makes it the version that channel's calendars should run. --manual: only when
//       "Update now" is clicked, instead of on their next wake
//   node scripts/firmware-release.mjs revert 1.0.0 --channel stable
//       emergency: send calendars back to an older version (always installs, no clicking)
//   node scripts/firmware-release.mjs list
//
// Then commit and deploy as usual. Nothing reaches a calendar until the site is deployed.
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url)); // works on Windows too
const DATA = join(ROOT, 'src/data/firmware-releases.json');
const KEY = process.env.FIRMWARE_KEY || join(homedir(), '.designedbykoda/firmware-signing-key.pem');
const MARKER = 'DBK-EINK-OTA-1';
const SLOT = 1966080; // app slot of "Minimal SPIFFS (1.9MB APP with OTA)"

const args = process.argv.slice(2);
const opt = (name) => {
	const i = args.indexOf('--' + name);
	return i >= 0 ? args[i + 1] : undefined;
};
const flag = (name) => args.includes('--' + name);
const die = (m) => {
	console.error('Stopped: ' + m);
	process.exit(1);
};
const isVer = (v) => /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v || '');
const cmp = (a, b) => {
	const x = a.split('.').map(Number), y = b.split('.').map(Number);
	for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
	return 0;
};
const load = () => JSON.parse(readFileSync(DATA, 'utf8'));
const save = (d) => writeFileSync(DATA, JSON.stringify(d, null, 2) + '\n');
const channelArg = () => {
	const c = opt('channel');
	if (c !== 'beta' && c !== 'stable') die('say --channel beta or --channel stable.');
	return c;
};

const [cmd] = args;
if (cmd === 'add') {
	const file = args[1];
	const version = opt('version');
	if (!file || !existsSync(file)) die('give the .bin file Arduino exported (Sketch > Export Compiled Binary).');
	if (!isVer(version)) die('give --version like 1.0.1 (the same as FW_VERSION in the sketch).');
	const bin = readFileSync(file);
	if (bin[0] !== 0xe9) die("that isn't an ESP32 app image (use main_partial.ino.bin, not the merged or bootloader one).");
	if (bin.length > SLOT) die(`it's ${bin.length} bytes, bigger than the ${SLOT}-byte app slot.`);
	if (bin.length < 100000) die('that file is too small to be the firmware.');
	if (!bin.includes(Buffer.from(MARKER))) die(`no ${MARKER} marker inside: this build can't update itself again, so it must never be sent.`);
	if (!bin.includes(Buffer.from('\0' + version + '\0'))) die(`the build doesn't contain "${version}". Is FW_VERSION in the sketch set to ${version}?`);
	const d = load();
	if (d.releases.some((r) => r.version === version)) die(`${version} already exists. Versions can't be reused: bump FW_VERSION.`);
	if (!existsSync(KEY)) die(`no signing key at ${KEY}. Run node scripts/firmware-keys.mjs first (once ever).`);
	const key = createPrivateKey(readFileSync(KEY));
	const sha = createHash('sha256').update(bin).digest();
	const sig = sign('sha256', bin, key); // DER ECDSA over SHA-256(bin): what the calendar checks
	if (!verify('sha256', bin, createPublicKey(key), sig)) die('the signature does not check out.');
	// the public key in the build must be this key's, or the calendar would refuse every update
	const pub = createPublicKey(key).export({ type: 'spki', format: 'pem' }).toString().trim();
	const pubBody = pub.split('\n').slice(1, -1).join('\n');
	if (!bin.includes(Buffer.from(pubBody.split('\n')[1]))) die("the build's OTA_PUBLIC_KEY isn't this signing key. Paste the key from firmware-keys.mjs into the sketch.");
	copyFileSync(file, join(ROOT, 'public/fw', version + '.bin'));
	d.releases.push({ version, size: bin.length, sha256: sha.toString('hex'), sig: sig.toString('base64'), date: new Date().toISOString().slice(0, 10), notes: opt('notes') || '' });
	save(d);
	console.log(`Added ${version} (${bin.length} bytes). Next: send it to beta, test on your own calendar, then stable.`);
} else if (cmd === 'send' || cmd === 'revert') {
	const version = args[1];
	const ch = channelArg();
	const d = load();
	const r = d.releases.find((x) => x.version === version);
	if (!r) die(`${version} hasn't been added.`);
	if (!existsSync(join(ROOT, 'public/fw', version + '.bin'))) die(`public/fw/${version}.bin is missing.`);
	const cur = d.channels[ch].version;
	if (cmd === 'send' && cur && cmp(version, cur) <= 0) die(`${ch} is on ${cur}. To go back to an older one, use revert.`);
	if (cmd === 'revert' && (!cur || cmp(version, cur) >= 0)) die(`revert is for going back to an older version than ${cur}.`);
	if (cmd === 'send' && ch === 'stable' && d.channels.beta.version && cmp(d.channels.beta.version, version) < 0 && !flag('skip-beta'))
		die(`${version} hasn't been on beta. Send it to beta and test it first (or add --skip-beta if you really mean it).`);
	d.channels[ch] = { version, auto: cmd === 'revert' ? true : !flag('manual') };
	if (ch === 'stable' && d.channels.beta.version && cmp(d.channels.beta.version, version) < 0) d.channels.beta = { ...d.channels[ch] };
	save(d);
	console.log(`${ch} calendars will now ${cmd === 'revert' ? 'go back to' : 'get'} ${version}${d.channels[ch].auto ? ' on their next wake' : ' when Update now is clicked'}. Commit and deploy.`);
} else if (cmd === 'list') {
	const d = load();
	for (const [k, v] of Object.entries(d.channels)) console.log(`${k}: ${v.version ?? '(none)'}${v.version ? (v.auto ? ' (automatic)' : ' (Update now only)') : ''}`);
	for (const r of d.releases) console.log(`  ${r.version}  ${r.date}  ${r.size} bytes  ${r.notes}`);
} else {
	console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(0, 15).join('\n'));
}
