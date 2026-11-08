// QR codes for the layout builder's QR widget: what goes inside one (a link, a Wi-Fi login,
// plain text) and the 1-bit picture of it. Pure maths, no DOM, so the server and the editor's
// live preview draw exactly the same code.
import qrcode from 'qrcode-generator';

qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];

export type QrMode = 'link' | 'wifi' | 'text';
export type WifiSecurity = 'WPA' | 'WEP' | 'nopass';

// Wi-Fi QR fields escape \ ; , : and " with a backslash.
const esc = (s: string) => s.replace(/([\\;,:"])/g, '\\$1');

export function wifiPayload(ssid: string, password: string, security: WifiSecurity, hidden = false): string {
	const sec = security === 'nopass' ? 'nopass' : security;
	return `WIFI:T:${sec};S:${esc(ssid)};${sec === 'nopass' ? '' : `P:${esc(password)};`}${hidden ? 'H:true;' : ''};`;
}

// A link with no scheme gets https:// so phones open it as a web page.
export function linkPayload(url: string): string {
	const u = url.trim();
	if (!u) return '';
	if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return u;
	return 'https://' + u;
}

export interface QrMatrix {
	size: number; // modules per side
	dark: (r: number, c: number) => boolean;
}

// null when the text is empty or too long for a QR code.
export function qrMatrix(text: string): QrMatrix | null {
	if (!text) return null;
	try {
		const q = qrcode(0, 'M');
		q.addData(text, 'Byte');
		q.make();
		const size = q.getModuleCount();
		return { size, dark: (r, c) => q.isDark(r, c) };
	} catch {
		return null;
	}
}

// Packs the code into a 1-bit picture `scale` dots per module (rows padded to whole bytes,
// most significant bit first, 1 = dark module), the format Draw.bitmapBytes takes.
export function qrBits(m: QrMatrix, scale: number): { w: number; bytes: Uint8Array } {
	const w = m.size * scale;
	const stride = Math.ceil(w / 8);
	const bytes = new Uint8Array(stride * w);
	for (let r = 0; r < m.size; r++) {
		for (let c = 0; c < m.size; c++) {
			if (!m.dark(r, c)) continue;
			for (let dy = 0; dy < scale; dy++) {
				const y = r * scale + dy;
				for (let dx = 0; dx < scale; dx++) {
					const x = c * scale + dx;
					bytes[y * stride + (x >> 3)] |= 0x80 >> (x & 7);
				}
			}
		}
	}
	return { w, bytes };
}
