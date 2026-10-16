/* Dual VFD display simulator. Self-contained: builds its own markup + CSS inside #vfd-sim.
   Behaviour mirrors the firmware (22 cells, HV518, 13 modes, light-sensor brightness). The glass tubes are drawn
   in code on top of the board art. Optional: data-board="/path/board.svg" swaps in real board art
   (ids used if present: vfd-left-body, vfd-right-body, vfd-left-pads, vfd-right-pads, light-sensor, btn-mode). */
(function () {
'use strict';
var root = document.getElementById('vfd-sim');
if (!root || root.getAttribute('data-ready')) return;
root.setAttribute('data-ready', '1');
var NS = 'http://www.w3.org/2000/svg';
var RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- font (from the firmware) ---------- */
var A = 1, B = 2, C = 4, D = 8, E = 16, F_ = 32, G = 64, DP = 128, COMMA = 256, HYPH = 512;
var DIG = [0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F];
var LET = [0x77, 0x7C, 0x39, 0x5E, 0x79, 0x71, 0x3D, 0x76, 0x06, 0x1E, 0x75, 0x38, 0x55, 0x54, 0x3F, 0x73, 0x67, 0x50, 0x6D, 0x78, 0x3E, 0x22, 0x2A, 0x76, 0x6E, 0x5B, 0x63];
function pat(ch) {
  if (ch >= '0' && ch <= '9') return DIG[ch.charCodeAt(0) - 48];
  var u = ch.toUpperCase();
  if (u >= 'A' && u <= 'Z') return LET[u.charCodeAt(0) - 65];
  if (ch === '*') return LET[26];
  if (ch === '.') return DP;
  if (ch === ',') return COMMA;
  if (ch === '-') return HYPH;
  return 0; // space, colon, pipe and anything else stay dark
}
var BITS = [A, B, C, D, E, F_, G, DP, COMMA, HYPH];

/* ---------- display buffer ---------- */
var N = 22, buf = [], raw = [];
function clearAll() { for (var i = 0; i < N; i++) { buf[i] = ' '; raw[i] = null; } }
function writeStr(s, pos, len) { for (var i = 0; i < len && pos + i < N; i++) buf[pos + i] = i < s.length ? s[i] : ' '; }
function centre(s, pos, len) { s = s.slice(0, len); var l = Math.floor((len - s.length) / 2); writeStr(new Array(l + 1).join(' ') + s, pos, len); }
function right(s, pos, len) { s = s.slice(-len); writeStr(new Array(len - s.length + 1).join(' ') + s, pos, len); }
function p2(n) { return (n < 10 ? '0' : '') + n; }
function timeMs(ms) { // HH:MM:SS.cc
  var t = Math.max(0, Math.floor(ms)), h = Math.floor(t / 3600000) % 100, m = Math.floor(t / 60000) % 60, s = Math.floor(t / 1000) % 60, cs = Math.floor((t % 1000) / 10);
  return p2(h) + ':' + p2(m) + ':' + p2(s) + '.' + p2(cs);
}

/* ---------- scroller ---------- */
var sc = { active: false, text: '', delay: 180, loop: true, max: 0, off: 0, last: 0, loops: 0 };
function scStart(msg, delay, loop, max, now) {
  sc.text = new Array(N + 1).join(' ') + msg + new Array(N + 1).join(' '); sc.delay = delay; sc.loop = loop; sc.max = max; sc.off = 0; sc.last = now; sc.loops = 0; sc.active = true;
  writeStr(sc.text.substr(0, N), 0, N);
}
function scTick(now) {
  if (!sc.active || now - sc.last < sc.delay) return;
  sc.last = now; sc.off++;
  if (sc.off > sc.text.length - N) { sc.off = 0; sc.loops++; if (sc.max && sc.loops >= sc.max) { sc.active = false; return; } }
  writeStr(sc.text.substr(sc.off, N), 0, N);
}

/* ---------- modes ---------- */
var MODES = ['CLOCK', 'WORLD CLOCKS', 'WEATHER', 'CRYPTO', 'COUNTDOWN', 'WORD CLOCK', 'BINARY CLOCK', 'SYSTEM INFO', 'MORSE', 'PONG', 'TIMER', 'STOPWATCH', 'LUX'];
var LABELS = ['Clock', 'World clocks', 'Weather', 'Crypto', 'Countdown', 'Word clock', 'Binary clock', 'System info', 'Morse', 'Pong', 'Timer', 'Stopwatch', 'Lux'];
var CAPS = [
  'Time with centiseconds on the left tube, the date on the right.',
  'Perth, London, New York and Tokyo take turns every 4 seconds. The firmware has no daylight saving, so London and New York are fixed offsets.',
  'The weather scrolls across both tubes three times, then the display freezes until you change mode. (Sample text here, the real one is fetched over Wi-Fi.)',
  'Crypto prices scroll five times. (Sample prices here, the real ones are fetched over Wi-Fi.)',
  'Days, hours, minutes and seconds to the target date, with the event label on the right.',
  'The time in words, scrolled across both tubes.',
  'Each digit is shown as a 4-bit binary column on segments A to D: top segment = 8, bottom = 1.',
  'Uptime, free heap, Wi-Fi signal and CPU frequency, a new page every 4 seconds.',
  'The message in Morse code. A dot lights two cells, a dash lights eleven.',
  'A ball bounces between the ends and the score counts the bounces. In the firmware the paddles are invisible and the ball is drawn as a zero.',
  'Countdown timer. Hold the button for a second to start, pause, or reset after it expires.',
  'Stopwatch. Hold the button to start or stop. A short press resets it when stopped.',
  'Live ambient light from the sensor, in lux. Move the room-light slider to change it.'
];
var ZONES = [['PERTH', 28800], ['LONDON', 3600], ['NEW YORK', -14400], ['TOKYO', 32400]];
var MORSE = { A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..' };
var MORSE_MESSAGE = 'KODA';
var COUNTDOWN_TARGET = 1798761600000, COUNTDOWN_LABEL = 'NEW YEAR';
var TIMER_DEFAULT = 300000;

var mode = 0, phase = 'off', phaseUntil = 0, modeStart = 0;
var S = { zone: 0, lastZone: 0, sysPage: 0, lastSys: 0, morse: [], mPos: 0, mOn: false, mLast: 0, mLetter: ' ', pong: 0, pvel: 0.35, pscore: 0, pLast: 0, tRun: false, tExp: false, tRem: TIMER_DEFAULT, tLast: 0, swRun: false, sw: 0, swLast: 0, lux: 0, luxLast: 0 };
var sensorLux = 120, litLux = 120, brightPct = 100, lastBright = 0;

function buildMorse(msg) {
  var out = [];
  for (var i = 0; i < msg.length; i++) {
    var ch = msg[i];
    if (ch === ' ') { out.push({ t: 'gap', ms: 1400 }); continue; }
    var code = MORSE[ch.toUpperCase()]; if (!code) continue;
    for (var k = 0; k < code.length; k++) { out.push({ t: code[k] === '.' ? 'dot' : 'dash', ms: code[k] === '.' ? 200 : 600, ch: ch }); if (k < code.length - 1) out.push({ t: 'gap', ms: 200 }); }
    out.push({ t: 'gap', ms: 600 });
  }
  out.push({ t: 'gap', ms: 1800 });
  return out;
}
function wordClock(h, m) {
  var nm = ['TWELVE', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN'];
  var r = Math.round(m / 5) * 5, hh = h % 12;
  if (r >= 35) hh = (hh + 1) % 12;
  if (r === 60) { r = 0; hh = (h + 1) % 12; }
  var mid = { 0: '', 5: 'FIVE PAST', 10: 'TEN PAST', 15: 'QUARTER PAST', 20: 'TWENTY PAST', 25: 'TWENTY FIVE PAST', 30: 'HALF PAST', 35: 'TWENTY FIVE TO', 40: 'TWENTY TO', 45: 'QUARTER TO', 50: 'TEN TO', 55: 'FIVE TO' }[r];
  return r === 0 ? 'IT IS ' + nm[hh] + ' OCLOCK' : 'IT IS ' + mid + ' ' + nm[hh];
}
function enterMode(m, now) {
  clearAll(); sc.active = false; modeStart = now;
  switch (m) {
    case 1: S.zone = 0; S.lastZone = now; break;
    case 2: scStart('PERTH 24*C CLEAR SKY HUMIDITY 45 WIND 14 KMH', 180, true, 3, now); break;
    case 3: scStart('BTC 67234 ETH 3412 SOL 168 XRP 0.52', 200, true, 5, now); break;
    case 5: var d = new Date(); scStart(wordClock(d.getHours(), d.getMinutes()), 220, true, 3, now); break;
    case 7: S.sysPage = 0; S.lastSys = now; break;
    case 8: S.morse = buildMorse(MORSE_MESSAGE); S.mPos = 0; S.mOn = false; S.mLast = now; S.mLetter = ' '; break;
    case 9: S.pong = 0; S.pvel = 0.35; S.pscore = 0; S.pLast = now; break;
    case 10: S.tRun = false; S.tExp = false; S.tRem = TIMER_DEFAULT; break;
    case 12: S.lux = litLux; S.luxLast = now; break;
  }
}
function setMode(m, now) { // 1 second name flash, then the mode content
  mode = m; phase = 'name'; phaseUntil = now + 1000;
  clearAll(); writeStr(MODES[m], 0, N);
}

/* ---------- per-frame update ---------- */
function update(now) {
  // auto brightness: sensor polled every 3 s, no smoothing
  if (phase !== 'off' && now - lastBright >= 3000) { lastBright = now; litLux = sensorLux; var l = Math.min(200, Math.max(5, litLux)); brightPct = Math.round(40 + (l - 5) * 60 / 195); }
  if (phase === 'off') { if (now >= phaseUntil) { phase = 'wifi'; phaseUntil = now + 1800; clearAll(); writeStr('  WIFI CONNECTING  ', 0, N); } return; }
  if (phase === 'wifi') { if (now >= phaseUntil) { mode = 0; enterMode(0, now); phase = 'run'; } return; }
  if (phase === 'name') { if (now >= phaseUntil) { enterMode(mode, now); phase = 'run'; } else return; }
  var d = new Date(), ms = d.getMilliseconds();
  switch (mode) {
    case 0:
      writeStr(p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()) + '.' + p2(Math.floor(ms / 10)), 0, 11);
      writeStr(' ' + p2(d.getDate()) + '-' + p2(d.getMonth() + 1) + '-' + d.getFullYear(), 11, 11); break;
    case 1: {
      if (now - S.lastZone >= 4000) { S.lastZone = now; S.zone = (S.zone + 1) % ZONES.length; }
      var z = ZONES[S.zone], zd = new Date(Date.now() + z[1] * 1000);
      writeStr(p2(zd.getUTCHours()) + ':' + p2(zd.getUTCMinutes()) + ':' + p2(zd.getUTCSeconds()) + '.' + p2(Math.floor(ms / 10)), 0, 11);
      centre(z[0], 11, 11); break;
    }
    case 2: case 3: case 5: scTick(now); break;
    case 4: {
      var left = Math.max(0, Math.floor((COUNTDOWN_TARGET - Date.now()) / 1000));
      var dd = Math.floor(left / 86400), hh = Math.floor(left % 86400 / 3600), mm = Math.floor(left % 3600 / 60), ss = left % 60;
      writeStr(dd + 'd ' + p2(hh) + ':' + p2(mm) + ':' + p2(ss), 0, 11); centre(COUNTDOWN_LABEL, 11, 11); break;
    }
    case 6: {
      var nib = function (n) { return (n & 8 ? A : 0) | (n & 4 ? B : 0) | (n & 2 ? C : 0) | (n & 1 ? D : 0); };
      clearAll();
      var h = d.getHours(), mi = d.getMinutes(), s = d.getSeconds();
      raw[0] = nib(Math.floor(h / 10)); raw[1] = nib(h % 10); raw[2] = DP; raw[3] = nib(Math.floor(mi / 10)); raw[4] = nib(mi % 10); raw[5] = DP; raw[6] = nib(Math.floor(s / 10)); raw[7] = nib(s % 10);
      writeStr(' ' + p2(h) + ':' + p2(mi) + ':' + p2(s) + '  ', 11, 11); break;
    }
    case 7: {
      if (now - S.lastSys >= 4000) { S.lastSys = now; S.sysPage = (S.sysPage + 1) % 4; }
      var up = Math.floor((now - 0) / 1000) + 5025, pages = [['UPTIME', p2(Math.floor(up / 3600)) + ':' + p2(Math.floor(up / 60) % 60) + ':' + p2(up % 60)], ['FREE HEAP', '212 KB'], ['WIFI RSSI', '-58 DBM'], ['CPU FREQ', '240 MHZ']], pg = pages[S.sysPage];
      centre(pg[0], 0, 11); centre(pg[1], 11, 11); break;
    }
    case 8: {
      var seq = S.morse, st = seq[S.mPos];
      if (now - S.mLast >= st.ms) { S.mLast = now; S.mPos = (S.mPos + 1) % seq.length; st = seq[S.mPos]; }
      clearAll();
      if (st.t === 'dot') { buf[10] = '1'; buf[11] = '1'; } else if (st.t === 'dash') { for (var q = 5; q <= 15; q++) buf[q] = '8'; }
      if (st.ch) S.mLetter = st.ch; if (st.t !== 'gap' || st.ms < 1800) buf[20] = S.mLetter; break;
    }
    case 9: {
      if (now - S.pLast >= 40) {
        S.pLast += 40; if (now - S.pLast > 200) S.pLast = now;
        S.pong += S.pvel;
        if (S.pong >= 21) { S.pong = 21; S.pvel = -Math.abs(S.pvel); S.pscore = (S.pscore + 1) % 100; }
        if (S.pong <= 0) { S.pong = 0; S.pvel = Math.abs(S.pvel); S.pscore = (S.pscore + 1) % 100; }
      }
      clearAll(); buf[0] = '|'; buf[21] = '|';
      var sc2 = p2(S.pscore); buf[9] = sc2[0]; buf[10] = sc2[1]; buf[11] = sc2[0]; buf[12] = sc2[1];
      buf[Math.round(S.pong)] = 'O'; break;
    }
    case 10: {
      if (S.tRun) { S.tRem -= now - S.tLast; if (S.tRem <= 0) { S.tRem = 0; S.tRun = false; S.tExp = true; } }
      S.tLast = now;
      writeStr(timeMs(S.tRem), 0, 11);
      writeStr(S.tRun ? ' COUNTING  ' : S.tExp ? '  EXPIRED  ' : 'HOLD 2S RUN', 11, 11); break;
    }
    case 11: {
      if (S.swRun) S.sw += now - S.swLast;
      S.swLast = now;
      writeStr(timeMs(S.sw), 0, 11);
      writeStr(S.swRun ? '  RUNNING  ' : S.sw > 0 ? ' SHORT=RST ' : 'HOLD 2S RUN', 11, 11); break;
    }
    case 12:
      if (now - S.luxLast >= 500) { S.luxLast = now; S.lux = sensorLux; }
      centre('AMBIENT', 0, 11); right(Math.round(S.lux) + ' LX', 11, 11); break;
  }
}
function shortPress(now) {
  if (phase !== 'run' && phase !== 'name') return;
  if (mode === 11 && !S.swRun && S.sw > 0) { S.sw = 0; return; }
  setMode((mode + 1) % MODES.length, now);
}
function holdAction(now) {
  if (phase !== 'run') return;
  if (mode === 10) { if (S.tExp) { S.tExp = false; S.tRem = TIMER_DEFAULT; } else { S.tRun = !S.tRun; S.tLast = now; } }
  else if (mode === 11) { S.swRun = !S.swRun; S.swLast = now; }
}

/* ---------- styles ---------- */
var css = '' +
'#vfd-sim{--ba:#3ff2d6;--bd:rgba(255,255,255,.12);--bp:rgba(255,255,255,.035);margin:28px 0;font-family:inherit;color:#e5edf5}' +
'#vfd-sim *{box-sizing:border-box}' +
'html.has-custom-cursor #vfd-sim *{cursor:none!important}' +
'#vfd-sim button{font:inherit;color:inherit}' +
'#vfd-sim .vs{outline:none;border:1px solid var(--bd);border-radius:18px;padding:18px;background:radial-gradient(120% 90% at 20% 0,rgba(63,242,214,.06),transparent 60%),rgba(8,12,18,.6)}' +
'#vfd-sim .vs:focus-visible{box-shadow:0 0 0 2px var(--ba)}' +
'#vfd-sim .vs-stage{position:relative;width:100%;user-select:none}' +
'#vfd-sim .vs-svg{display:block;width:100%;height:auto;overflow:visible;color:#e8eef4}' +
'#vfd-sim #vs-board>g{stroke-width:2.6}' +
'#vfd-sim .vs-svg .ln{fill:none;stroke:currentColor;stroke-width:1.5;stroke-linejoin:round;stroke-linecap:round}' +
'#vfd-sim .vs-svg .dimln{stroke-opacity:.4}' +
'#vfd-sim .vs-svg .lbl{fill:#8da0b3;font-family:ui-monospace,Menlo,monospace;letter-spacing:.04em}' +
'#vfd-sim .vs-b{position:absolute;background:transparent;border:0;border-radius:8px;padding:0}' +
'#vfd-sim .vs-b:hover{background:rgba(63,242,214,.16)}' +
'#vfd-sim .vs-b:focus-visible,#vfd-sim .vs-chip:focus-visible,#vfd-sim .vs-press:focus-visible,#vfd-sim .vs-ghost:focus-visible{outline:2px solid var(--ba)}' +
'#vfd-sim .vs-sec{margin:14px 0 0}' +
'#vfd-sim .vs-sec h4{margin:0 0 8px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#8da0b3;font-weight:600}' +
'#vfd-sim .vs-chips{display:flex;flex-wrap:wrap;gap:8px}' +
'#vfd-sim .vs-chip{font-size:13px;color:#e5edf5;background:transparent;border:1px solid var(--bd);border-radius:999px;padding:7px 13px;transition:.2s}' +
'#vfd-sim .vs-chip:hover{border-color:rgba(63,242,214,.6)}' +
'#vfd-sim .vs-chip.on{border-color:var(--ba);background:rgba(63,242,214,.14);color:#fff}' +
'#vfd-sim .vs-cap{margin:12px 0 0;font-size:14px;line-height:1.55;color:#b7c4d1;min-height:3.1em}' +
'#vfd-sim .vs-row{display:flex;flex-wrap:wrap;align-items:center;gap:14px 22px;margin-top:14px}' +
'#vfd-sim .vs-ctl{display:flex;align-items:center;gap:10px;font-size:13px;color:#b7c4d1}' +
'#vfd-sim .vs-ctl input[type=range]{width:200px;accent-color:#3ff2d6}' +
'#vfd-sim .vs-ctl b{color:#fff;font-variant-numeric:tabular-nums;min-width:4.2em}' +
'#vfd-sim .vs-press{position:relative;overflow:hidden;border:1px solid var(--bd);background:rgba(255,255,255,.04);border-radius:12px;padding:11px 18px;font-size:14px;touch-action:none}' +
'#vfd-sim .vs-press i{position:absolute;left:0;bottom:0;height:3px;width:0;background:var(--ba)}' +
'#vfd-sim .vs-press.hold i{width:100%;transition:width 1s linear}' +
'#vfd-sim .vs-hint{font-size:12.5px;color:#8da0b3}' +
'#vfd-sim .vs-ghost{font-size:13px;color:#9fb0c1;background:none;border:1px solid var(--bd);border-radius:999px;padding:7px 14px;transition:.2s}' +
'#vfd-sim .vs-ghost:hover{color:#fff;border-color:rgba(255,255,255,.4)}' +
'#vfd-sim .vs-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}';
var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

/* ---------- placeholder board art (replaced by the real SVG when data-board is given) ---------- */
var VB = '0 0 1812 512';
var ART = "\n\n<g fill=\"none\" stroke=\"#e8eef4\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\">\n\n<g id=\"board\">\n  <path d=\"M1756.0,506.0 A50.0,50.0 0 0 0 1806.0,456.0 L1806.0,56.0 A50.0,50.0 0 0 0 1756.0,6.0 L1637.142,6.0 A20.0,20.0 0 0 0 1617.142,26.0 L1617.142,60.2 A20.0,20.0 0 0 1 1597.142,80.2 L1440.4,80.2 A20.0,20.0 0 0 1 1420.4,60.2 L1420.4,26.0 A20.0,20.0 0 0 0 1400.4,6.0 L56.0,6.0 A50.0,50.0 0 0 0 6.0,56.0 L6.0,456.0 A50.0,50.0 0 0 0 56.0,506.0 L1756.0,506.0 Z\"/>\n  <circle cx=\"1756.0\" cy=\"56.0\" r=\"16.0\"/>\n  <circle cx=\"1756.0\" cy=\"456.0\" r=\"16.0\"/>\n  <circle cx=\"56.0\" cy=\"56.0\" r=\"16.0\"/>\n  <circle cx=\"56.0\" cy=\"456.0\" r=\"16.0\"/>\n</g>\n\n<g id=\"vfd-right-pads\">\n  <circle cx=\"1000.23\" cy=\"424.7\" r=\"8.5\" data-pin=\"1\" data-pin1=\"square\"/>\n  <circle cx=\"1025.63\" cy=\"424.7\" r=\"8.5\" data-pin=\"2\"/>\n  <circle cx=\"1051.03\" cy=\"424.7\" r=\"8.5\" data-pin=\"3\"/>\n  <circle cx=\"1076.43\" cy=\"424.7\" r=\"8.5\" data-pin=\"4\"/>\n  <circle cx=\"1101.83\" cy=\"424.7\" r=\"8.5\" data-pin=\"5\"/>\n  <circle cx=\"1127.23\" cy=\"424.7\" r=\"8.5\" data-pin=\"6\"/>\n  <circle cx=\"1152.63\" cy=\"424.7\" r=\"8.5\" data-pin=\"7\"/>\n  <circle cx=\"1178.03\" cy=\"424.7\" r=\"8.5\" data-pin=\"8\"/>\n  <circle cx=\"1203.43\" cy=\"424.7\" r=\"8.5\" data-pin=\"9\"/>\n  <circle cx=\"1228.83\" cy=\"424.7\" r=\"8.5\" data-pin=\"10\"/>\n  <circle cx=\"1254.23\" cy=\"424.7\" r=\"8.5\" data-pin=\"11\"/>\n  <circle cx=\"1279.63\" cy=\"424.7\" r=\"8.5\" data-pin=\"12\"/>\n  <circle cx=\"1305.03\" cy=\"424.7\" r=\"8.5\" data-pin=\"13\"/>\n  <circle cx=\"1330.43\" cy=\"424.7\" r=\"8.5\" data-pin=\"14\"/>\n  <circle cx=\"1355.83\" cy=\"424.7\" r=\"8.5\" data-pin=\"15\"/>\n  <circle cx=\"1381.23\" cy=\"424.7\" r=\"8.5\" data-pin=\"16\"/>\n  <circle cx=\"1406.63\" cy=\"424.7\" r=\"8.5\" data-pin=\"17\"/>\n  <circle cx=\"1432.03\" cy=\"424.7\" r=\"8.5\" data-pin=\"18\"/>\n  <circle cx=\"1457.43\" cy=\"424.7\" r=\"8.5\" data-pin=\"19\"/>\n  <circle cx=\"1482.83\" cy=\"424.7\" r=\"8.5\" data-pin=\"20\"/>\n  <circle cx=\"1508.23\" cy=\"424.7\" r=\"8.5\" data-pin=\"21\"/>\n  <circle cx=\"1533.63\" cy=\"424.7\" r=\"8.5\" data-pin=\"22\"/>\n  <circle cx=\"1559.03\" cy=\"424.7\" r=\"8.5\" data-pin=\"23\"/>\n  <circle cx=\"1584.43\" cy=\"424.7\" r=\"8.5\" data-pin=\"24\"/>\n  <circle cx=\"1609.83\" cy=\"424.7\" r=\"8.5\" data-pin=\"25\"/>\n  <circle cx=\"1635.23\" cy=\"424.7\" r=\"8.5\" data-pin=\"26\"/>\n</g>\n\n<g id=\"vfd-right-body\">\n  <rect x=\"987.53\" y=\"412.0\" width=\"660.4\" height=\"25.4\" rx=\"0.0\" stroke-opacity=\"0.35\"/>\n</g>\n\n<g id=\"vfd-left-pads\">\n  <circle cx=\"176.77\" cy=\"424.7\" r=\"8.5\" data-pin=\"1\" data-pin1=\"square\"/>\n  <circle cx=\"202.17\" cy=\"424.7\" r=\"8.5\" data-pin=\"2\"/>\n  <circle cx=\"227.57\" cy=\"424.7\" r=\"8.5\" data-pin=\"3\"/>\n  <circle cx=\"252.97\" cy=\"424.7\" r=\"8.5\" data-pin=\"4\"/>\n  <circle cx=\"278.37\" cy=\"424.7\" r=\"8.5\" data-pin=\"5\"/>\n  <circle cx=\"303.77\" cy=\"424.7\" r=\"8.5\" data-pin=\"6\"/>\n  <circle cx=\"329.17\" cy=\"424.7\" r=\"8.5\" data-pin=\"7\"/>\n  <circle cx=\"354.57\" cy=\"424.7\" r=\"8.5\" data-pin=\"8\"/>\n  <circle cx=\"379.97\" cy=\"424.7\" r=\"8.5\" data-pin=\"9\"/>\n  <circle cx=\"405.37\" cy=\"424.7\" r=\"8.5\" data-pin=\"10\"/>\n  <circle cx=\"430.77\" cy=\"424.7\" r=\"8.5\" data-pin=\"11\"/>\n  <circle cx=\"456.17\" cy=\"424.7\" r=\"8.5\" data-pin=\"12\"/>\n  <circle cx=\"481.57\" cy=\"424.7\" r=\"8.5\" data-pin=\"13\"/>\n  <circle cx=\"506.97\" cy=\"424.7\" r=\"8.5\" data-pin=\"14\"/>\n  <circle cx=\"532.37\" cy=\"424.7\" r=\"8.5\" data-pin=\"15\"/>\n  <circle cx=\"557.77\" cy=\"424.7\" r=\"8.5\" data-pin=\"16\"/>\n  <circle cx=\"583.17\" cy=\"424.7\" r=\"8.5\" data-pin=\"17\"/>\n  <circle cx=\"608.57\" cy=\"424.7\" r=\"8.5\" data-pin=\"18\"/>\n  <circle cx=\"633.97\" cy=\"424.7\" r=\"8.5\" data-pin=\"19\"/>\n  <circle cx=\"659.37\" cy=\"424.7\" r=\"8.5\" data-pin=\"20\"/>\n  <circle cx=\"684.77\" cy=\"424.7\" r=\"8.5\" data-pin=\"21\"/>\n  <circle cx=\"710.17\" cy=\"424.7\" r=\"8.5\" data-pin=\"22\"/>\n  <circle cx=\"735.57\" cy=\"424.7\" r=\"8.5\" data-pin=\"23\"/>\n  <circle cx=\"760.97\" cy=\"424.7\" r=\"8.5\" data-pin=\"24\"/>\n  <circle cx=\"786.37\" cy=\"424.7\" r=\"8.5\" data-pin=\"25\"/>\n  <circle cx=\"811.77\" cy=\"424.7\" r=\"8.5\" data-pin=\"26\"/>\n</g>\n\n<g id=\"vfd-left-body\">\n  <rect x=\"164.07\" y=\"412.0\" width=\"660.4\" height=\"25.4\" rx=\"0.0\" stroke-opacity=\"0.35\"/>\n</g>\n\n<g id=\"light-sensor\">\n  <rect x=\"1640.982\" y=\"452.33\" width=\"68.136\" height=\"30.036\" rx=\"2.5\"/>\n  <rect x=\"1666.05\" y=\"455.83\" width=\"18.0\" height=\"8.0\" rx=\"2.0\" stroke-opacity=\"0.35\"/>\n  <rect x=\"1652.45\" y=\"470.1\" width=\"7.1\" height=\"14.0\" rx=\"1.0\" stroke-opacity=\"0.35\"/>\n  <rect x=\"1665.15\" y=\"470.1\" width=\"7.1\" height=\"14.0\" rx=\"1.0\" stroke-opacity=\"0.35\"/>\n  <rect x=\"1677.85\" y=\"470.1\" width=\"7.1\" height=\"14.0\" rx=\"1.0\" stroke-opacity=\"0.35\"/>\n  <rect x=\"1690.55\" y=\"470.1\" width=\"7.1\" height=\"14.0\" rx=\"1.0\" stroke-opacity=\"0.35\"/>\n</g>\n\n<g id=\"usbc-tht\">\n  <rect x=\"1534.0\" y=\"329.0\" width=\"15.0\" height=\"12.0\" rx=\"6.0\"/>\n  <rect x=\"1534.0\" y=\"372.0\" width=\"15.0\" height=\"12.0\" rx=\"6.0\"/>\n  <rect x=\"1486.0\" y=\"329.0\" width=\"15.0\" height=\"12.0\" rx=\"6.0\"/>\n  <rect x=\"1486.0\" y=\"372.0\" width=\"15.0\" height=\"12.0\" rx=\"6.0\"/>\n  <circle cx=\"1555.0\" cy=\"356.5\" r=\"2.974\" stroke-opacity=\"0.35\"/>\n  <circle cx=\"1480.0\" cy=\"356.5\" r=\"3.966\" stroke-opacity=\"0.35\"/>\n</g>\n\n<g id=\"esp32-antenna\">\n  <path d=\"M1609.5,75.924 L1609.5,15.1 L1429.5,15.1 L1429.5,76.969\" stroke-opacity=\"0.35\"/>\n</g>\n\n<g id=\"art-wave\">\n  <path d=\"M1806.0,121.644 L1804.0,119.637 L1800.0,115.116 L1799.0,114.429 L1798.0,114.067 L1797.0,113.98 L1795.0,114.969 L1794.0,115.857 L1792.0,118.139 L1788.0,123.501 L1786.0,125.507 L1785.0,126.247 L1784.0,126.727 L1783.0,126.818 L1782.0,126.684 L1780.0,125.444 L1778.0,123.27 L1776.0,120.691 L1774.0,118.453 L1773.0,117.67 L1772.0,117.134 L1771.0,116.878 L1769.0,117.742 L1768.0,118.598 L1766.0,120.76 L1762.0,126.252 L1760.0,128.643 L1758.0,130.517 L1756.0,131.415 L1755.0,131.345 L1753.0,130.357 L1751.0,128.002 L1748.0,123.707 L1747.0,122.597 L1746.0,121.527 L1745.0,120.833 L1744.0,120.486 L1743.0,120.697 L1741.0,122.226 L1738.0,125.871 L1734.0,131.401 L1732.0,133.686 L1730.0,135.044 L1729.0,135.257 L1728.0,134.878 L1726.0,133.383 L1724.0,131.037 L1720.0,125.855 L1719.0,125.198 L1718.0,125.078 L1716.0,126.791 L1714.0,129.443 L1711.0,133.869 L1709.0,136.458 L1707.0,138.383 L1706.0,138.94 L1705.0,138.934 L1704.0,138.26 L1702.0,135.58 L1699.0,130.75 L1697.0,128.243 L1696.0,127.233 L1694.0,126.14 L1693.0,126.269 L1692.0,126.913 L1691.0,127.84 L1690.0,129.112 L1688.0,131.886 L1684.0,138.527 L1682.0,141.197 L1681.0,142.168 L1680.0,142.808 L1679.0,143.189 L1678.0,143.165 L1677.0,142.923 L1676.0,142.222 L1674.0,139.717 L1670.0,132.81 L1668.0,129.826 L1667.0,128.868 L1666.0,128.408 L1665.0,128.341 L1663.0,129.458 L1661.0,131.575 L1653.0,143.212 L1650.0,146.689 L1649.0,147.47 L1648.0,147.901 L1647.0,147.872 L1646.0,147.598 L1644.0,145.941 L1642.0,143.076 L1637.0,134.192 L1635.0,131.6 L1634.0,130.648 L1633.0,130.5 L1632.0,130.729 L1630.0,132.577 L1629.0,133.825 L1627.0,137.154 L1626.0,139.309 L1624.0,144.478 L1622.0,150.594 L1616.0,171.405 L1614.0,177.726 L1612.0,182.533 L1611.0,184.231 L1610.0,185.143 L1609.0,185.161 L1608.0,183.237 L1607.0,179.288 L1606.0,173.488 L1605.0,165.474 L1604.0,155.25 L1601.0,119.795 L1599.0,99.167 L1598.0,92.267 L1597.0,88.351 L1596.0,87.142 L1595.0,87.869 L1594.0,89.421 L1592.0,93.816 L1590.0,99.572 L1588.0,106.506 L1585.0,118.49 L1575.0,162.518 L1572.0,174.65 L1570.0,181.819 L1568.0,187.8 L1567.0,189.965 L1565.0,193.04 L1564.0,193.323 L1563.0,191.808 L1562.0,188.133 L1561.0,182.358 L1560.0,173.814 L1559.0,162.786 L1555.0,114.418 L1554.0,104.741 L1553.0,98.448 L1552.0,94.452 L1551.0,92.337 L1550.0,92.706 L1549.0,94.007 L1548.0,95.894 L1546.0,101.133 L1544.0,107.784 L1542.0,115.41 L1539.0,127.98 L1529.0,172.469 L1525.0,187.891 L1523.0,194.077 L1521.0,198.795 L1520.0,200.442 L1519.0,201.699 L1518.0,201.656 L1517.0,199.586 L1516.0,195.571 L1515.0,189.455 L1514.0,181.234 L1513.0,170.72 L1510.0,131.77 L1508.0,111.044 L1507.0,104.103 L1506.0,99.693 L1505.0,98.281 L1504.0,98.987 L1503.0,100.567 L1501.0,105.061 L1499.0,111.002 L1497.0,117.964 L1493.0,134.22 L1483.0,179.004 L1479.0,194.744 L1477.0,200.869 L1475.0,205.729 L1474.0,207.544 L1473.0,208.875 L1472.0,209.232 L1471.0,208.364 L1470.0,205.484 L1469.0,200.312 L1468.0,192.611 L1467.0,182.599 L1465.0,158.735 L1463.0,132.271 L1462.0,122.185 L1461.0,114.233 L1460.0,108.477 L1459.0,105.205 L1458.0,104.881 L1457.0,105.941 L1456.0,107.696 L1454.0,112.34 L1452.0,118.486 L1450.0,125.709 L1446.0,142.199 L1436.0,186.674 L1432.0,202.197 L1430.0,208.6 L1428.0,213.704 L1427.0,215.538 L1426.0,216.836 L1425.0,217.247 L1424.0,216.171 L1423.0,213.223 L1422.0,208.078 L1421.0,200.447 L1420.0,189.987 L1416.0,140.043 L1415.0,129.173 L1414.0,121.527 L1413.0,115.933 L1412.0,112.786 L1411.0,111.521 L1410.0,112.158 L1409.0,113.431 L1408.0,115.401 L1406.0,120.723 L1404.0,127.453 L1399.0,147.693 L1389.0,192.075 L1386.0,204.118 L1384.0,211.336 L1382.0,217.423 L1380.0,222.153 L1379.0,223.793 L1378.0,224.964 L1377.0,225.1 L1376.0,223.489 L1375.0,219.834 L1374.0,213.913 L1373.0,205.315 L1372.0,194.05 L1368.0,141.322 L1367.0,131.616 L1366.0,124.886 L1365.0,120.488 L1364.0,118.487 L1363.0,118.547 L1362.0,119.589 L1361.0,121.247 L1360.0,123.449 L1358.0,129.089 L1356.0,135.967 L1352.0,151.898 L1341.0,199.44 L1338.0,211.312 L1336.0,218.436 L1334.0,224.569 L1332.0,229.384 L1331.0,231.108 L1330.0,232.449 L1329.0,232.964 L1328.0,232.268 L1327.0,229.337 L1326.0,223.852 L1325.0,215.592 L1323.0,192.302 L1320.0,152.596 L1319.0,141.389 L1318.0,133.996 L1317.0,128.898 L1316.0,125.864 L1315.0,125.095 L1314.0,125.894 L1313.0,127.054 L1312.0,128.908 L1311.0,131.234 L1309.0,136.986 L1307.0,143.86 L1303.0,159.722 L1293.0,203.916 L1290.0,215.849 L1287.0,226.405 L1285.0,232.263 L1283.0,236.971 L1281.0,240.099 L1280.0,240.784 L1279.0,239.748 L1278.0,237.273 L1277.0,232.072 L1276.0,224.002 L1275.0,213.651 L1271.0,160.581 L1270.0,149.694 L1269.0,141.885 L1268.0,136.264 L1267.0,132.773 L1266.0,131.739 L1265.0,132.688 L1263.0,135.988 L1261.0,141.201 L1258.0,151.064 L1254.0,166.287 L1243.0,212.152 L1240.0,223.665 L1237.0,234.103 L1235.0,240.082 L1233.0,244.506 L1232.0,246.185 L1231.0,247.462 L1230.0,248.22 L1229.0,248.108 L1228.0,246.058 L1227.0,241.796 L1226.0,234.699 L1225.0,223.753 L1220.0,157.313 L1219.0,148.365 L1218.0,142.569 L1217.0,139.203 L1216.0,138.123 L1215.0,138.753 L1214.0,140.073 L1213.0,141.914 L1211.0,146.585 L1209.0,152.583 L1205.0,166.961 L1196.0,203.747 L1194.0,210.925 L1192.0,217.201 L1190.0,222.492 L1188.0,226.376 L1186.0,229.426 L1184.0,231.559 L1183.0,232.341 L1182.0,232.576 L1181.0,232.356 L1180.0,231.896 L1178.0,229.676 L1177.0,228.187 L1172.0,218.444 L1170.0,214.86 L1169.0,213.347 L1167.0,210.858 L1165.0,209.198 L1163.0,207.995 L1162.0,207.786 L1161.0,207.797 L1160.0,207.851 L1159.0,208.194 L1156.0,209.92 L1153.0,212.763 L1147.0,219.241 L1144.0,222.133 L1141.0,224.19 L1139.0,224.782 L1137.0,224.512 L1135.0,223.559 L1134.0,222.857 L1131.0,220.176 L1127.0,216.117 L1125.0,214.346 L1124.0,213.695 L1122.0,212.758 L1120.0,212.663 L1119.0,212.891 L1117.0,213.886 L1114.0,216.502 L1107.0,224.768 L1104.0,227.685 L1102.0,229.059 L1100.0,229.874 L1099.0,230.041 L1098.0,229.94 L1097.0,229.595 L1095.0,228.459 L1094.0,227.664 L1088.0,221.49 L1085.0,218.844 L1083.0,217.722 L1081.0,217.494 L1080.0,217.729 L1078.0,218.806 L1075.0,221.331 L1073.0,223.566 L1068.0,229.767 L1065.0,232.723 L1063.0,234.144 L1061.0,235.029 L1060.0,235.239 L1059.0,235.335 L1058.0,235.122 L1056.0,234.012 L1055.0,233.262 L1053.0,231.225 L1048.0,225.208 L1046.0,223.278 L1044.0,222.19 L1042.0,222.134 L1040.0,222.833 L1037.0,225.045 L1034.0,228.321 L1029.0,234.867 L1025.0,238.912 L1022.0,240.668 L1021.0,240.797 L1020.0,240.892 L1019.0,240.603 L1016.0,238.548 L1013.0,235.389 L1009.0,230.4 L1007.0,228.279 L1006.0,227.516 L1005.0,227.079 L1003.0,226.903 L1001.0,227.421 L998.0,229.574 L995.0,232.848 L990.0,239.616 L987.0,243.2 L986.0,244.145 L984.0,245.598 L982.0,246.276 L981.0,246.34 L979.0,245.877 L977.0,244.434 L975.0,242.266 L971.0,237.213 L968.0,233.831 L966.0,232.181 L965.0,231.608 L964.0,231.34 L962.0,231.864 L960.0,233.104 L959.0,233.972 L956.0,237.263 L950.0,245.504 L947.0,248.954 L946.0,249.887 L944.0,251.317 L943.0,251.792 L942.0,252.004 L941.0,252.111 L940.0,251.966 L939.0,251.512 L937.0,250.048 L934.0,246.681 L928.0,238.822 L926.0,237.188 L924.0,236.586 L923.0,236.582 L922.0,236.83 L920.0,237.934 L919.0,238.714 L917.0,240.79 L916.0,241.941 L909.0,251.961 L906.0,255.459 L905.0,256.349 L903.0,257.73 L902.0,258.126 L900.0,258.396 L898.0,257.554 L897.0,256.816 L895.0,254.632 L888.0,244.121 L886.0,241.643 L885.0,240.713 L884.0,240.074 L883.0,239.742 L882.0,239.915 L880.0,240.872 L879.0,241.621 L876.0,244.802 L874.0,247.949 L872.0,251.885 L870.0,256.724 L867.0,265.765 L861.0,288.282 L859.0,294.801 L857.0,299.823 L856.0,301.686 L855.0,302.935 L854.0,303.661 L853.0,303.18 L852.0,301.244 L851.0,297.769 L850.0,292.469 L849.0,285.607 L848.0,277.281 L846.0,256.168 L842.0,203.409 L840.0,182.945 L839.0,175.358 L838.0,169.354 L837.0,164.953 L836.0,162.561 L835.0,161.734 L834.0,162.523 L833.0,163.901 L832.0,166.154 L831.0,168.99 L829.0,176.059 L827.0,184.56 L825.0,194.116 L822.0,209.978 L815.0,250.482 L811.0,272.539 L808.0,287.619 L806.0,296.242 L804.0,303.424 L802.0,308.81 L801.0,310.616 L800.0,311.935 L799.0,312.199 L798.0,311.288 L797.0,308.772 L796.0,304.618 L795.0,298.861 L794.0,291.324 L792.0,271.169 L787.0,207.181 L785.0,188.581 L784.0,181.747 L783.0,176.428 L782.0,172.558 L781.0,170.258 L780.0,169.561 L779.0,170.193 L778.0,171.793 L776.0,176.962 L774.0,184.172 L772.0,192.848 L768.0,213.319 L757.0,276.342 L755.0,286.678 L752.0,300.764 L750.0,308.886 L748.0,315.285 L746.0,319.709 L744.0,322.226 L743.0,320.746 L742.0,318.637 L741.0,314.857 L740.0,309.516 L739.0,302.53 L738.0,293.867 L736.0,272.142 L732.0,219.534 L731.0,208.986 L730.0,200.132 L729.0,192.796 L728.0,186.859 L727.0,182.154 L726.0,178.823 L725.0,177.325 L724.0,177.646 L723.0,178.94 L722.0,180.947 L720.0,186.802 L718.0,194.349 L716.0,203.278 L713.0,218.55 L703.0,275.955 L700.0,291.992 L697.0,306.688 L695.0,315.302 L693.0,322.543 L691.0,327.67 L690.0,329.415 L689.0,330.347 L688.0,330.369 L687.0,329.102 L686.0,326.767 L685.0,322.979 L684.0,317.502 L683.0,310.191 L681.0,290.207 L676.0,226.189 L674.0,205.971 L673.0,198.464 L672.0,192.648 L671.0,188.545 L670.0,186.021 L669.0,184.891 L668.0,185.416 L667.0,186.717 L665.0,191.248 L663.0,198.008 L661.0,206.512 L657.0,227.044 L645.0,295.518 L642.0,310.9 L640.0,320.094 L638.0,328.049 L636.0,334.197 L635.0,336.527 L634.0,338.391 L633.0,339.803 L632.0,340.241 L631.0,339.42 L630.0,337.194 L629.0,333.53 L628.0,328.099 L627.0,321.298 L626.0,312.543 L625.0,301.661 L620.0,235.627 L618.0,215.103 L617.0,207.28 L616.0,201.807 L615.0,197.586 L614.0,194.409 L613.0,192.567 L612.0,193.255 L611.0,194.705 L610.0,196.644 L609.0,199.199 L607.0,205.797 L604.0,218.848 L599.0,245.59 L589.0,304.048 L586.0,319.593 L584.0,328.783 L582.0,336.841 L580.0,343.377 L579.0,345.997 L578.0,347.996 L577.0,349.268 L576.0,349.902 L575.0,348.401 L574.0,346.123 L573.0,342.661 L572.0,337.56 L571.0,330.893 L570.0,322.154 L568.0,299.206 L564.0,247.524 L563.0,236.183 L561.0,218.458 L560.0,211.95 L559.0,207.111 L558.0,203.508 L557.0,201.432 L556.0,201.292 L555.0,202.343 L554.0,204.186 L552.0,209.517 L550.0,216.89 L548.0,225.86 L546.0,235.891 L543.0,252.377 L533.0,311.051 L531.0,321.723 L528.0,336.154 L526.0,344.495 L524.0,351.318 L523.0,353.994 L522.0,355.964 L521.0,357.581 L520.0,358.408 L519.0,358.167 L518.0,356.421 L517.0,353.293 L516.0,348.562 L515.0,342.24 L514.0,334.117 L513.0,323.797 L508.0,258.257 L506.0,236.18 L505.0,227.689 L504.0,220.973 L503.0,215.976 L502.0,212.426 L501.0,210.107 L500.0,209.502 L499.0,210.617 L498.0,212.281 L497.0,214.532 L495.0,220.762 L493.0,228.57 L491.0,237.788 L488.0,253.522 L478.0,312.249 L473.0,338.836 L470.0,352.295 L468.0,359.452 L467.0,362.42 L466.0,364.731 L465.0,366.469 L464.0,367.447 L463.0,366.938 L462.0,365.474 L461.0,362.894 L460.0,359.001 L459.0,353.209 L458.0,345.275 L457.0,335.383 L451.0,258.138 L449.0,238.062 L448.0,230.613 L447.0,224.909 L446.0,220.899 L445.0,218.415 L444.0,217.647 L443.0,218.42 L442.0,220.003 L441.0,222.127 L440.0,224.799 L438.0,231.327 L435.0,244.641 L431.0,265.878 L420.0,330.136 L417.0,345.779 L415.0,355.059 L413.0,363.215 L411.0,369.911 L410.0,372.601 L409.0,374.692 L408.0,376.071 L407.0,376.667 L406.0,375.55 L405.0,372.87 L404.0,368.688 L403.0,362.974 L402.0,355.6 L400.0,335.72 L395.0,270.5 L393.0,249.478 L392.0,241.471 L391.0,235.312 L390.0,230.774 L389.0,227.645 L388.0,226.273 L387.0,226.428 L386.0,227.825 L385.0,229.766 L383.0,235.681 L381.0,243.405 L379.0,252.461 L376.0,267.762 L364.0,337.95 L361.0,354.058 L359.0,363.87 L357.0,372.424 L355.0,379.204 L353.0,383.474 L351.0,385.836 L350.0,384.175 L349.0,381.568 L348.0,378.267 L347.0,373.218 L346.0,365.832 L344.0,345.147 L339.0,280.101 L337.0,258.339 L336.0,250.135 L335.0,243.781 L334.0,238.832 L333.0,235.686 L332.0,234.285 L331.0,234.345 L330.0,235.589 L329.0,237.564 L327.0,243.248 L325.0,250.908 L323.0,259.939 L320.0,275.486 L309.0,340.297 L304.0,367.115 L301.0,380.487 L299.0,387.414 L298.0,390.053 L297.0,392.073 L296.0,393.519 L295.0,394.133 L294.0,393.753 L293.0,391.62 L292.0,388.231 L291.0,383.508 L290.0,376.375 L289.0,367.302 L287.0,345.138 L283.0,292.146 L281.0,270.592 L280.0,262.239 L279.0,255.4 L278.0,249.979 L277.0,246.09 L276.0,243.656 L275.0,242.879 L274.0,243.771 L273.0,245.397 L271.0,250.475 L269.0,257.705 L267.0,266.67 L265.0,277.211 L263.0,288.885 L255.0,340.325 L253.0,351.207 L252.0,355.715 L250.0,363.158 L248.0,368.576 L246.0,372.608 L244.0,375.177 L243.0,375.905 L242.0,376.097 L241.0,375.703 L239.0,373.218 L238.0,371.323 L235.0,364.161 L231.0,353.358 L228.0,347.24 L225.0,343.439 L224.0,342.623 L222.0,341.664 L221.0,341.691 L219.0,342.46 L218.0,343.204 L216.0,345.104 L213.0,348.933 L206.0,358.878 L203.0,361.936 L201.0,363.082 L200.0,363.28 L199.0,363.353 L198.0,363.085 L197.0,362.72 L196.0,361.947 L194.0,359.876 L189.0,353.226 L187.0,350.982 L185.0,349.347 L184.0,348.798 L183.0,348.497 L182.0,348.591 L180.0,349.431 L178.0,351.091 L175.0,354.677 L170.0,361.813 L167.0,365.445 L165.0,367.379 L163.0,368.399 L162.0,368.496 L161.0,368.36 L160.0,368.016 L158.0,366.62 L156.0,364.411 L151.0,358.281 L148.0,355.487 L147.0,354.827 L146.0,354.506 L144.0,355.074 L142.0,356.435 L141.0,357.396 L139.0,359.562 L138.0,360.897 L132.0,369.521 L130.0,371.769 L128.0,373.175 L127.0,373.648 L125.0,373.856 L124.0,373.504 L121.0,371.342 L118.0,368.059 L115.0,363.93 L113.0,361.733 L112.0,361.022 L111.0,360.56 L110.0,360.5 L108.0,360.974 L105.0,363.353 L102.0,366.873 L98.0,372.323 L95.0,375.971 L93.0,377.731 L92.0,378.333 L91.0,378.578 L90.0,378.7 L89.0,378.391 L87.0,377.263 L84.0,374.315 L79.0,368.396 L77.0,366.738 L76.0,366.322 L75.0,366.363 L73.0,367.098 L71.0,368.66 L70.0,369.583 L68.0,371.89 L64.0,377.139 L61.0,380.66 L59.0,382.22 L57.0,383.254 L56.0,383.416 L55.0,383.362 L54.0,383.082 L53.0,382.516 L51.0,380.707 L47.0,376.105 L45.0,374.047 L43.0,372.62 L42.0,372.136 L41.0,371.907 L40.0,372.223 L38.0,373.252 L37.0,373.974 L35.0,375.84 L34.0,376.839 L28.0,384.211 L26.0,386.092 L25.0,386.847 L24.0,387.353 L22.0,387.871 L21.0,387.53 L19.0,386.43 L16.0,383.699 L12.0,379.59 L10.0,378.178 L9.0,377.825 L8.0,377.694 L7.0,377.793 L6.0,378.186\"/>\n</g>\n\n<g id=\"logo-koda\">\n  <path d=\"M175.139,56.178 L175.17,56.14 L175.233,56.065 L175.326,55.953 L175.451,55.803 L175.545,54.628 L175.608,52.428 L175.639,49.203 L175.639,44.953 L175.639,41.765 L175.639,39.64 L175.639,38.578\"/>\n  <path d=\"M147.539,60.478 L147.551,60.509 L147.576,60.572 L147.614,60.665 L147.664,60.79 L147.67,61.14 L147.633,61.715 L147.551,62.515 L147.426,63.54 L147.258,64.503 L147.045,65.403 L146.789,66.24 L146.489,67.015 L146.214,67.672 L145.964,68.209 L145.739,68.628 L145.539,68.928 L145.295,69.247 L145.008,69.584 L144.676,69.94 L144.301,70.315 L143.839,70.697 L143.289,71.084 L142.651,71.478 L141.926,71.878 L141.226,72.209 L140.551,72.472 L139.901,72.665 L139.276,72.79 L138.676,72.89 L138.101,72.965 L137.551,73.015 L137.026,73.04 L136.501,73.047 L135.976,73.034 L135.451,73.003 L134.926,72.953 L134.408,72.884 L133.895,72.797 L133.389,72.69 L132.889,72.565 L132.37,72.39 L131.833,72.165 L131.276,71.89 L130.701,71.565 L130.133,71.184 L129.57,70.747 L129.014,70.253 L128.464,69.703 L127.945,69.234 L127.458,68.847 L127.001,68.54 L126.576,68.315 L126.258,68.147 L126.045,68.034 L125.939,67.978\"/>\n  <path d=\"M102.639,73.178 L102.651,73.165 L102.676,73.14 L102.714,73.103 L102.764,73.053 L102.808,72.859 L102.845,72.522 L102.876,72.04 L102.901,71.415 L102.951,70.778 L103.026,70.128 L103.126,69.465 L103.251,68.79 L103.345,68.284 L103.408,67.947 L103.439,67.778\"/>\n  <path d=\"M118.639,51.478 L118.551,51.465 L118.376,51.44 L118.114,51.403 L117.764,51.353 L117.451,51.334 L117.176,51.347 L116.939,51.39 L116.739,51.465 L116.476,51.534 L116.151,51.597 L115.764,51.653 L115.314,51.703 L114.876,51.79 L114.451,51.915 L114.039,52.078 L113.639,52.278 L113.245,52.509 L112.858,52.772 L112.476,53.065 L112.101,53.39 L111.751,53.74 L111.426,54.115 L111.126,54.515 L110.851,54.94 L110.551,55.447 L110.226,56.034 L109.876,56.703 L109.501,57.453 L109.176,58.234 L108.901,59.047 L108.676,59.89 L108.501,60.765 L108.37,61.422 L108.283,61.859 L108.239,62.078\"/>\n  <path d=\"M108.139,62.178 L108.083,62.234 L107.97,62.347 L107.801,62.515 L107.576,62.74 L107.32,63.109 L107.033,63.622 L106.714,64.278 L106.364,65.078 L105.958,65.765 L105.495,66.34 L104.976,66.803 L104.401,67.153 L103.97,67.415 L103.683,67.59 L103.539,67.678\"/>\n  <path d=\"M175.239,68.078 L175.258,67.84 L175.295,67.365 L175.351,66.653 L175.426,65.703 L175.476,64.672 L175.501,63.559 L175.501,62.365 L175.476,61.09 L175.439,59.953 L175.389,58.953 L175.326,58.09 L175.251,57.365 L175.195,56.822 L175.158,56.459 L175.139,56.278\"/>\n  <path d=\"M175.339,68.178 L175.37,68.215 L175.433,68.29 L175.526,68.403 L175.651,68.553 L175.751,68.753 L175.826,69.003 L175.876,69.303 L175.901,69.653 L175.951,70.022 L176.026,70.409 L176.126,70.815 L176.251,71.24 L176.401,71.615 L176.576,71.94 L176.776,72.215 L177.001,72.44 L177.233,72.622 L177.47,72.759 L177.714,72.853 L177.964,72.903 L178.226,72.94 L178.501,72.965 L178.789,72.978 L179.089,72.978 L179.401,72.947 L179.726,72.884 L180.064,72.79 L180.414,72.665 L180.739,72.49 L181.039,72.265 L181.314,71.99 L181.564,71.665 L181.795,71.29 L182.008,70.865 L182.201,70.39 L182.376,69.865 L182.558,69.428 L182.745,69.078 L182.939,68.815 L183.139,68.64 L183.289,68.509 L183.389,68.422 L183.439,68.378\"/>\n  <path d=\"M125.939,67.978 L125.926,67.878 L125.901,67.678 L125.864,67.378 L125.814,66.978 L125.783,66.397 L125.77,65.634 L125.776,64.69 L125.801,63.565 L125.839,62.572 L125.889,61.709 L125.951,60.978 L126.026,60.378 L126.12,59.797 L126.233,59.234 L126.364,58.69 L126.514,58.165 L126.701,57.647 L126.926,57.134 L127.189,56.628 L127.489,56.128 L127.839,55.634 L128.239,55.147 L128.689,54.665 L129.189,54.19 L129.589,53.815 L129.889,53.54 L130.089,53.365 L130.189,53.29 L130.439,53.197 L130.839,53.084 L131.389,52.953 L132.089,52.803 L132.614,52.69 L132.964,52.615 L133.139,52.578\"/>\n  <path d=\"M125.939,67.978 L125.876,68.028 L125.751,68.128 L125.564,68.278 L125.314,68.478 L125.108,68.703 L124.945,68.953 L124.826,69.228 L124.751,69.528 L124.658,69.834 L124.545,70.147 L124.414,70.465 L124.264,70.79 L124.083,71.109 L123.87,71.422 L123.626,71.728 L123.351,72.028 L123.089,72.278 L122.839,72.478 L122.601,72.628 L122.376,72.728 L122.114,72.815 L121.814,72.89 L121.476,72.953 L121.101,73.003 L120.714,73.022 L120.314,73.009 L119.901,72.965 L119.476,72.89 L119.114,72.803 L118.814,72.703 L118.576,72.59 L118.401,72.465 L118.201,72.29 L117.976,72.065 L117.726,71.79 L117.451,71.465 L117.045,70.815 L116.508,69.84 L115.839,68.54 L115.039,66.915 L114.37,65.628 L113.833,64.678 L113.426,64.065 L113.151,63.79 L112.889,63.547 L112.639,63.334 L112.401,63.153 L112.176,63.003 L111.789,62.853 L111.239,62.703 L110.526,62.553 L109.651,62.403 L108.995,62.29 L108.558,62.215 L108.339,62.178\"/>\n  <path d=\"M154.539,57.778 L154.551,57.747 L154.576,57.684 L154.614,57.59 L154.664,57.465 L154.808,57.24 L155.045,56.915 L155.376,56.49 L155.801,55.965 L156.258,55.453 L156.745,54.953 L157.264,54.465 L157.814,53.99 L158.389,53.547 L158.989,53.134 L159.614,52.753 L160.264,52.403 L160.895,52.115 L161.508,51.89 L162.101,51.728 L162.676,51.628 L163.289,51.559 L163.939,51.522 L164.626,51.515 L165.351,51.54 L166.051,51.603 L166.726,51.703 L167.376,51.84 L168.001,52.015 L168.608,52.228 L169.195,52.478 L169.764,52.765 L170.314,53.09 L170.833,53.434 L171.32,53.797 L171.776,54.178 L172.201,54.578 L172.658,54.94 L173.145,55.265 L173.664,55.553 L174.214,55.803 L174.626,55.99 L174.901,56.115 L175.039,56.178\"/>\n  <path d=\"M204.439,68.478 L204.301,68.534 L204.026,68.647 L203.614,68.815 L203.064,69.04 L202.526,69.322 L202.001,69.659 L201.489,70.053 L200.989,70.503 L200.508,70.903 L200.045,71.253 L199.601,71.553 L199.176,71.803 L198.714,72.034 L198.214,72.247 L197.676,72.44 L197.101,72.615 L196.495,72.759 L195.858,72.872 L195.189,72.953 L194.489,73.003 L193.814,73.022 L193.164,73.009 L192.539,72.965 L191.939,72.89 L191.351,72.784 L190.776,72.647 L190.214,72.478 L189.664,72.278 L189.108,72.034 L188.545,71.747 L187.976,71.415 L187.401,71.04 L186.895,70.678 L186.458,70.328 L186.089,69.99 L185.789,69.665 L185.458,69.372 L185.095,69.109 L184.701,68.878 L184.276,68.678 L183.958,68.528 L183.745,68.428 L183.639,68.378\"/>\n  <path d=\"M154.539,57.978 L154.526,58.297 L154.501,58.934 L154.464,59.89 L154.414,61.165 L154.401,62.278 L154.426,63.228 L154.489,64.015 L154.589,64.64 L154.695,65.203 L154.808,65.703 L154.926,66.14 L155.051,66.515 L155.251,66.972 L155.526,67.509 L155.876,68.128 L156.301,68.828 L156.72,69.447 L157.133,69.984 L157.539,70.44 L157.939,70.815 L158.339,71.153 L158.739,71.453 L159.139,71.715 L159.539,71.94 L159.945,72.147 L160.358,72.334 L160.776,72.503 L161.201,72.653 L161.62,72.778 L162.033,72.878 L162.439,72.953 L162.839,73.003 L163.283,73.04 L163.77,73.065 L164.301,73.078 L164.876,73.078 L165.445,73.053 L166.008,73.003 L166.564,72.928 L167.114,72.828 L167.658,72.697 L168.195,72.534 L168.726,72.34 L169.251,72.115 L169.751,71.872 L170.226,71.609 L170.676,71.328 L171.101,71.028 L171.508,70.709 L171.895,70.372 L172.264,70.015 L172.614,69.64 L173.001,69.303 L173.426,69.003 L173.889,68.74 L174.389,68.515 L174.764,68.347 L175.014,68.234 L175.139,68.178\"/>\n  <path d=\"M147.539,59.978 L147.589,59.947 L147.689,59.884 L147.839,59.79 L148.039,59.665 L148.32,59.553 L148.683,59.453 L149.126,59.365 L149.651,59.29 L150.114,59.197 L150.514,59.084 L150.851,58.953 L151.126,58.803 L151.514,58.647 L152.014,58.484 L152.626,58.315 L153.351,58.14 L153.895,58.009 L154.258,57.922 L154.439,57.878\"/>\n  <path d=\"M133.239,52.478 L133.276,52.447 L133.351,52.384 L133.464,52.29 L133.614,52.165 L133.851,52.04 L134.176,51.915 L134.589,51.79 L135.089,51.665 L135.645,51.578 L136.258,51.528 L136.926,51.515 L137.651,51.54 L138.351,51.597 L139.026,51.684 L139.676,51.803 L140.301,51.953 L140.901,52.14 L141.476,52.365 L142.026,52.628 L142.551,52.928 L143.051,53.253 L143.526,53.603 L143.976,53.978 L144.401,54.378 L144.776,54.753 L145.101,55.103 L145.376,55.428 L145.601,55.728 L145.82,56.047 L146.033,56.384 L146.239,56.74 L146.439,57.115 L146.608,57.509 L146.745,57.922 L146.851,58.353 L146.926,58.803 L147.008,59.172 L147.095,59.459 L147.189,59.665 L147.289,59.79 L147.364,59.884 L147.414,59.947 L147.439,59.978\"/>\n  <path d=\"M133.239,52.678 L133.245,52.803 L133.258,53.053 L133.276,53.428 L133.301,53.928 L133.358,54.447 L133.445,54.984 L133.564,55.54 L133.714,56.115 L133.895,56.634 L134.108,57.097 L134.351,57.503 L134.626,57.853 L134.926,58.19 L135.251,58.515 L135.601,58.828 L135.976,59.128 L136.389,59.409 L136.839,59.672 L137.326,59.915 L137.851,60.14 L138.414,60.334 L139.014,60.497 L139.651,60.628 L140.326,60.728 L141.151,60.809 L142.126,60.872 L143.251,60.915 L144.526,60.94 L145.52,60.953 L146.233,60.953 L146.664,60.94 L146.814,60.915 L146.951,60.872 L147.076,60.809 L147.189,60.728 L147.289,60.628 L147.364,60.553 L147.414,60.503 L147.439,60.478\"/>\n  <path d=\"M183.539,68.278 L183.52,68.084 L183.483,67.697 L183.426,67.115 L183.351,66.34 L183.308,65.447 L183.295,64.434 L183.314,63.303 L183.364,62.053 L183.451,60.947 L183.576,59.984 L183.739,59.165 L183.939,58.49 L184.164,57.853 L184.414,57.253 L184.689,56.69 L184.989,56.165 L185.308,55.672 L185.645,55.209 L186.001,54.778 L186.376,54.378 L186.801,53.99 L187.276,53.615 L187.801,53.253 L188.376,52.903 L188.976,52.59 L189.601,52.315 L190.251,52.078 L190.926,51.878 L191.658,51.722 L192.445,51.609 L193.289,51.54 L194.189,51.515 L195.008,51.528 L195.745,51.578 L196.401,51.665 L196.976,51.79 L197.526,51.94 L198.051,52.115 L198.551,52.315 L199.026,52.54 L199.52,52.822 L200.033,53.159 L200.564,53.553 L201.114,54.003 L201.614,54.453 L202.064,54.903 L202.464,55.353 L202.814,55.803 L203.133,56.278 L203.42,56.778 L203.676,57.303 L203.901,57.853 L204.095,58.403 L204.258,58.953 L204.389,59.503 L204.489,60.053 L204.57,60.847 L204.633,61.884 L204.676,63.165 L204.701,64.69 L204.701,65.922 L204.676,66.859 L204.626,67.503 L204.551,67.853 L204.495,68.115 L204.458,68.29 L204.439,68.378\"/>\n  <path d=\"M102.539,38.678 L102.539,40.428 L102.539,43.928 L102.539,49.178 L102.539,56.178 L102.595,61.49 L102.708,65.115 L102.876,67.053 L103.101,67.303 L103.27,67.49 L103.383,67.615 L103.439,67.678\"/>\n  <path d=\"M204.539,68.478 L204.57,68.515 L204.633,68.59 L204.726,68.703 L204.851,68.853 L204.951,69.109 L205.026,69.472 L205.076,69.94 L205.101,70.515 L205.133,70.99 L205.17,71.365 L205.214,71.64 L205.264,71.815 L205.326,71.978 L205.401,72.128 L205.489,72.265 L205.589,72.39 L205.708,72.503 L205.845,72.603 L206.001,72.69 L206.176,72.765 L206.551,72.847 L207.126,72.934 L207.901,73.028 L208.876,73.128 L209.608,73.203 L210.095,73.253 L210.339,73.278\"/>\n</g>\n\n<g id=\"text\" fill=\"#e8eef4\" stroke=\"none\" font-family=\"Inter, 'Helvetica Neue', Arial, sans-serif\" font-weight=\"500\" letter-spacing=\"0\">\n  <text id=\"warning-text\" x=\"604.411\" y=\"482.484\" font-size=\"13.99\" textLength=\"603.955\" lengthAdjust=\"spacingAndGlyphs\">PROTOTYPE UNIT. PROBABLY WORKS&#8482;. DO NOT TAP THE VFD TOO HARD. <tspan font-weight=\"700\">HIGH VOLTAGE</tspan></text>\n  <text id=\"light-label\" x=\"1655.68\" y=\"443.44\" font-size=\"13.87\" textLength=\"39.865\" lengthAdjust=\"spacingAndGlyphs\">LIGHT</text>\n</g>\n</g>\n";
function placeholderArt() { return ART; }

/* ---------- markup ---------- */
root.innerHTML = '' +
'<div class="vs" tabindex="0" role="group" aria-label="Dual VFD display simulator. Left and right arrows change mode.">' +
'<div class="vs-stage"><svg class="vs-svg" id="vs-svg" viewBox="' + VB + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="VFD display board">' +
'<defs><filter id="vfd-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4"/></filter></defs>' +
'<svg id="vs-board" x="0" y="0" width="100%" height="100%" viewBox="' + VB + '" overflow="visible">' + placeholderArt() + '</svg>' +
'<g id="vs-tubes"></g></svg>' +
'<button class="vs-b" id="vs-ov" type="button" aria-label="Mode button (tap for next mode, hold for timer and stopwatch actions)" title="Mode button"></button></div>' +
'<p class="vs-cap" id="vs-cap" aria-live="off"></p>' +
'<div class="vs-sec"><h4>Mode <span style="text-transform:none;letter-spacing:0;font-weight:400">(sent over Bluetooth on the real clock)</span></h4><div class="vs-chips" id="vs-chips" role="group" aria-label="Modes"></div></div>' +
'<div class="vs-row">' +
' <button class="vs-press" id="vs-press" type="button">Mode button<i></i></button><span class="vs-hint">Tap for the next mode. Hold for 1 second to start or pause the Timer and Stopwatch.</span>' +
'</div>' +
'<div class="vs-row">' +
' <label class="vs-ctl" for="vs-lux">Room light <input id="vs-lux" type="range" min="0" max="100" value="45"><b id="vs-luxv"></b></label>' +
' <span class="vs-hint" id="vs-bright"></span>' +
' <button class="vs-ghost" id="vs-boot" type="button">Reboot</button>' +
'</div>' +
'<div class="vs-sr" id="vs-sr" aria-live="polite"></div>' +
'</div>';
var q = function (s) { return root.querySelector(s); };
var svg = q('#vs-svg'), board = q('#vs-board'), widget = q('.vs'), tubesG = q('#vs-tubes');
var gid = function (id) { return board.querySelector('#' + id); };

/* ---------- tubes ---------- */
var SEGW = 22, SEGH = 42, T = 4.4, GP = 1.4;
function poly(pts) { var e = document.createElementNS(NS, 'polygon'); e.setAttribute('points', pts.map(function (p) { return p[0].toFixed(2) + ',' + p[1].toFixed(2); }).join(' ')); return e; }
function hbar(yc, x1, x2) { return [[x1, yc], [x1 + T / 2, yc - T / 2], [x2 - T / 2, yc - T / 2], [x2, yc], [x2 - T / 2, yc + T / 2], [x1 + T / 2, yc + T / 2]]; }
function vbar(xc, y1, y2) { return [[xc, y1], [xc + T / 2, y1 + T / 2], [xc + T / 2, y2 - T / 2], [xc, y2], [xc - T / 2, y2 - T / 2], [xc - T / 2, y1 + T / 2]]; }
function segGeo() {
  var x1 = T / 2 + GP, x2 = SEGW - T / 2 - GP, h2 = SEGH / 2;
  return [
    hbar(T / 2, x1, x2), vbar(SEGW - T / 2, T / 2 + GP, h2 - GP), vbar(SEGW - T / 2, h2 + GP, SEGH - T / 2 - GP), hbar(SEGH - T / 2, x1, x2),
    vbar(T / 2, h2 + GP, SEGH - T / 2 - GP), vbar(T / 2, T / 2 + GP, h2 - GP), hbar(h2, x1, x2),
    'dp', 'comma', 'hyph'
  ];
}
var cells = [], litLayer, glowUse, dimLayer, tubeSize = { s: 1 };
function mkSeg(g, geo, cls) {
  var e;
  if (geo === 'dp') { e = document.createElementNS(NS, 'circle'); e.setAttribute('cx', SEGW + 5); e.setAttribute('cy', SEGH - 2.4); e.setAttribute('r', 2.5); }
  else if (geo === 'comma') e = poly([[SEGW + 3, SEGH - 4], [SEGW + 7, SEGH - 4], [SEGW + 7, SEGH], [SEGW + 4.4, SEGH + 5], [SEGW + 2.8, SEGH + 4.2], [SEGW + 4.4, SEGH]]);
  else if (geo === 'hyph') e = poly([[SEGW / 2 - 4.5, SEGH * 0.34 - 1.6], [SEGW / 2 + 4.5, SEGH * 0.34 - 1.6], [SEGW / 2 + 4.5, SEGH * 0.34 + 1.6], [SEGW / 2 - 4.5, SEGH * 0.34 + 1.6]]);
  else e = poly(geo);
  e.setAttribute('class', cls); g.appendChild(e); return e;
}
function buildTubes() {
  tubesG.innerHTML = ''; cells = [];
  var bodies = [gid('vfd-left-body'), gid('vfd-right-body')];
  if (!bodies[0] || !bodies[1]) return;
  var geo = segGeo();
  var glass = document.createElementNS(NS, 'g'); dimLayer = document.createElementNS(NS, 'g'); litLayer = document.createElementNS(NS, 'g'); litLayer.setAttribute('id', 'vfd-lit');
  tubesG.appendChild(glass); tubesG.appendChild(dimLayer); tubesG.appendChild(litLayer);
  glowUse = document.createElementNS(NS, 'use'); glowUse.setAttribute('href', '#vfd-lit'); glowUse.setAttribute('filter', 'url(#vfd-glow)'); tubesG.appendChild(glowUse);
  bodies.forEach(function (b) {
    var bb = b.getBBox(), gh = bb.width * 0.235, bd = gid('board').getBBox(), gy = bd.y + bd.height / 2 - gh / 2;
    var out = document.createElementNS(NS, 'rect'); out.setAttribute('x', bb.x); out.setAttribute('y', gy); out.setAttribute('width', bb.width); out.setAttribute('height', gh); out.setAttribute('rx', 14); out.setAttribute('fill', 'rgba(10,22,24,.92)'); out.setAttribute('stroke', '#e8eef4'); out.setAttribute('stroke-width', 2.4); glass.appendChild(out);
    var sheen = document.createElementNS(NS, 'rect'); sheen.setAttribute('x', bb.x + 12); sheen.setAttribute('y', gy + 8); sheen.setAttribute('width', bb.width - 24); sheen.setAttribute('height', gh - 16); sheen.setAttribute('rx', 8); sheen.setAttribute('fill', 'rgba(2,12,12,.9)'); sheen.setAttribute('stroke', 'rgba(255,255,255,.14)'); sheen.setAttribute('stroke-width', 1.5); glass.appendChild(sheen);
    var innerW = bb.width - 44, pitch = innerW / 11, s = Math.min(pitch * 0.68 / SEGW, (gh - 44) / SEGH), cy = gy + gh / 2;
    for (var c = 0; c < 11; c++) {
      var cx = bb.x + 22 + pitch * (c + 0.5), tr = 'translate(' + (cx - SEGW * s / 2) + ' ' + (cy - SEGH * s / 2) + ') scale(' + s + ') skewX(-4)';
      var gd = document.createElementNS(NS, 'g'); gd.setAttribute('transform', tr); dimLayer.appendChild(gd);
      var gl = document.createElementNS(NS, 'g'); gl.setAttribute('transform', tr); litLayer.appendChild(gl);
      var lit = [];
      geo.forEach(function (g2) { var d = mkSeg(gd, g2, ''); d.setAttribute('fill', 'rgba(63,242,214,.09)'); d.setAttribute('stroke', 'none'); var e = mkSeg(gl, g2, ''); e.setAttribute('fill', '#5ff7dd'); e.setAttribute('stroke', 'none'); e.setAttribute('opacity', 0); lit.push(e); });
      cells.push({ lit: lit, mask: 0 });
    }
  });
  var op = brightOpacity(); litLayer.setAttribute('opacity', op); glowUse.setAttribute('opacity', op * 0.9);
}
function brightOpacity() { return phase === 'off' ? 0 : 0.28 + 0.72 * brightPct / 100; }
function render() {
  if (!cells.length) return;
  for (var i = 0; i < N; i++) {
    var m = raw[i] !== null ? raw[i] : pat(buf[i]);
    if (m === cells[i].mask) continue; cells[i].mask = m;
    for (var b = 0; b < 10; b++) cells[i].lit[b].setAttribute('opacity', m & BITS[b] ? 1 : 0);
  }
  var op = brightOpacity();
  if (op !== render.op) { render.op = op; litLayer.setAttribute('opacity', op); glowUse.setAttribute('opacity', op * 0.9); }
}

/* ---------- overlay button + layout ---------- */
function layout() {
  buildTubes();
  var b = gid('btn-mode'), ov = q('#vs-ov'), sr = svg.getBoundingClientRect();
  if (b && sr.width) {
    var r = b.getBoundingClientRect(), pad = 6;
    ov.style.display = ''; ov.style.left = (r.left - sr.left - pad) + 'px'; ov.style.top = (r.top - sr.top - pad) + 'px'; ov.style.width = (r.width + pad * 2) + 'px'; ov.style.height = (r.height + pad * 2) + 'px';
  } else ov.style.display = 'none';
}
if (window.ResizeObserver) new ResizeObserver(function () { var b = gid('btn-mode'), ov = q('#vs-ov'), sr = svg.getBoundingClientRect(); if (b && sr.width) { var r = b.getBoundingClientRect(); ov.style.left = (r.left - sr.left - 6) + 'px'; ov.style.top = (r.top - sr.top - 6) + 'px'; ov.style.width = (r.width + 12) + 'px'; ov.style.height = (r.height + 12) + 'px'; } }).observe(svg);
var boardUrl = root.getAttribute('data-board');
function applyBoard(text) {
  var d = new DOMParser().parseFromString(text, 'image/svg+xml'), s = d.documentElement;
  if (!s.querySelector('#vfd-left-body') || !s.querySelector('#vfd-right-body')) return;
  var vb = s.getAttribute('viewBox'); if (vb) { svg.setAttribute('viewBox', vb); board.setAttribute('viewBox', vb); }
  board.innerHTML = s.innerHTML; layout();
}
if (boardUrl && window.fetch) fetch(boardUrl).then(function (r) { return r.ok ? r.text() : Promise.reject(); }).then(applyBoard).catch(function () { });

/* ---------- controls ---------- */
var chipsEl = q('#vs-chips'), capEl = q('#vs-cap');
LABELS.forEach(function (l, i) {
  var b = document.createElement('button'); b.type = 'button'; b.className = 'vs-chip'; b.textContent = l; b.setAttribute('aria-pressed', 'false');
  b.onclick = function () { if (phase === 'run' || phase === 'name') setMode(i, clock()); sync(); };
  chipsEl.appendChild(b);
});
var t0 = performance.now(); function clock() { return performance.now() - t0; }
function sync() {
  Array.prototype.forEach.call(chipsEl.children, function (b, i) { var on = i === mode && (phase === 'run' || phase === 'name'); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  capEl.textContent = phase === 'run' || phase === 'name' ? CAPS[mode] : 'Starting up. The real display stays dark for about 3 seconds while the high-voltage supply warms up, then shows WIFI CONNECTING. This demo plays the boot faster.';
}
var luxEl = q('#vs-lux');
function luxFromSlider() { var v = +luxEl.value / 100; return Math.round(1000 * v * v); }
luxEl.oninput = function () { sensorLux = luxFromSlider(); q('#vs-luxv').textContent = sensorLux + ' lux'; };
sensorLux = luxFromSlider(); q('#vs-luxv').textContent = sensorLux + ' lux';
q('#vs-boot').onclick = function () { reboot(); };
function reboot() { var n = clock(); phase = 'off'; phaseUntil = n + 1200; clearAll(); brightPct = 100; lastBright = n; sc.active = false; S.tRun = false; S.tExp = false; S.tRem = TIMER_DEFAULT; S.swRun = false; S.sw = 0; sync(); }

/* press / hold */
var press = { timer: 0, fired: false, down: false }, pressBtn = q('#vs-press');
function pDown(e) {
  if (e && e.preventDefault) e.preventDefault();
  if (press.down) return; press.down = true; press.fired = false; pressBtn.classList.add('hold');
  press.timer = setTimeout(function () { press.fired = true; holdAction(clock()); sync(); }, 1000);
}
function pUp() {
  if (!press.down) return; press.down = false; clearTimeout(press.timer); pressBtn.classList.remove('hold');
  if (!press.fired) { shortPress(clock()); sync(); }
}
function bindPress(el) {
  el.addEventListener('pointerdown', pDown);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { el.addEventListener(ev, function (e) { if (ev === 'pointerleave' || ev === 'pointercancel') { press.fired = true; } pUp(); }); });
  el.addEventListener('click', function (e) { if (e.detail === 0) { shortPress(clock()); sync(); } });
}
bindPress(pressBtn); bindPress(q('#vs-ov'));
widget.addEventListener('keydown', function (e) {
  if (e.target !== widget) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); shortPress(clock()); sync(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); if (phase === 'run' || phase === 'name') { setMode((mode + MODES.length - 1) % MODES.length, clock()); sync(); } }
});

/* ---------- loop ---------- */
var raf = 0, lastDraw = 0, visible = true, lastSr = 0;
function frame() {
  raf = requestAnimationFrame(frame);
  var now = clock(); if (now - lastDraw < 28) return; lastDraw = now;
  var wasPhase = phase; update(now); if (phase !== wasPhase) sync();
  render();
  if (now - lastSr > 2000) { lastSr = now; var txt = buf.join('').replace(/\s+/g, ' ').trim(); q('#vs-sr').textContent = phase === 'off' ? 'Display off' : 'Display: ' + (txt || 'blank'); }
  var bp = q('#vs-bright'); var bt = 'Display brightness ' + (phase === 'off' ? 0 : brightPct) + '% (set by the light sensor)'; if (bp.textContent !== bt) bp.textContent = bt;
}
function run() { if (!raf && visible && !document.hidden) { raf = requestAnimationFrame(frame); } }
function halt() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
if (window.IntersectionObserver) new IntersectionObserver(function (e) { visible = e[0].isIntersecting; visible ? run() : halt(); }, { rootMargin: '120px' }).observe(root);
document.addEventListener('visibilitychange', function () { document.hidden ? halt() : run(); });

clearAll();
setTimeout(function () { layout(); phase = 'run'; mode = 0; modeStart = clock(); enterMode(0, clock()); sync(); run(); }, 0);
root.__vfd = { setMode: function (m) { setMode(m, clock()); }, press: function () { shortPress(clock()); }, hold: function () { holdAction(clock()); }, buf: function () { return buf.join(''); }, mode: function () { return mode; }, phase: function () { return phase; }, lux: function (v) { sensorLux = v; }, reboot: reboot, bright: function () { return brightPct; }, raw: function () { return raw.slice(); }, cell: function (i) { return cells[i] && cells[i].mask; } };
})();
