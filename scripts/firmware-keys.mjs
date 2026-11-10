// Makes the key pair that signs firmware updates. Run ONCE, ever:
//   node scripts/firmware-keys.mjs
// The private key goes to ~/.designedbykoda/firmware-signing-key.pem (NOT in the repo). Back it
// up somewhere safe (a USB stick, a password manager). Calendars only install updates signed
// with it, so if it's lost, shipped calendars can never be updated again; if it leaks, someone
// else could sign firmware for them. The public key is printed: paste it into OTA_PUBLIC_KEY.
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const dir = join(homedir(), '.designedbykoda');
const file = join(dir, 'firmware-signing-key.pem');
if (existsSync(file)) {
	console.error(`${file} already exists. Not replacing it: calendars already trust that key.`);
	process.exit(1);
}
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
mkdirSync(dir, { recursive: true });
writeFileSync(file, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
const pub = publicKey.export({ type: 'spki', format: 'pem' });
writeFileSync(join(dir, 'firmware-signing-key.pub.pem'), pub);
console.log(`Private key saved to ${file}. Back it up now.\n`);
console.log('Paste this into OTA_PUBLIC_KEY in the firmware, between the two KEY lines:\n');
console.log(pub);
