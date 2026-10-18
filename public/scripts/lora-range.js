/* LoRa range planner for designedbykoda.com
   A top-down landscape with two radios. Drag the other radio (or use the slider) and the view
   zooms smoothly to keep both in frame. The radio model is the same one the LoRa Portable
   Messenger simulator uses (see lora-sim.js). Anything marked GUESS is my own estimate. */
(function () {
'use strict';
var root = document.getElementById('lora-range');
if (!root || root.getAttribute('data-ready')) return;
root.setAttribute('data-ready', '1');

var RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- radio model (same formulas as the simulator) ---------- */
var ENVS = [
  { n: 'Open', L: 10, k: 4.3 },
  { n: 'Forest', L: 18, k: 30 },       /* GUESS: not in the firmware or simulator, my own estimate */
  { n: 'Suburban', L: 15, k: 12.6 },
  { n: 'Urban', L: 20, k: 42 }
];
var BANDS = [{ n: '915 MHz', f: 915 }, { n: '868 MHz', f: 868 }];
var FRAG_MAX = 179, HEADER_BYTES = 21;
var SIGMA = 2;                         /* dB of per-packet fading, same as the simulator */
var CAP_MAH = 3000;
var D_MIN = 0.02, D_MAX = 30;          /* km */

function noiseFloor() { return -174 + 10 * Math.log10(125000) + 6; }
function snrLim(sf) { return -7.5 - 2.5 * (sf - 7); }
function sens(sf) { return noiseFloor() + snrLim(sf); }
function pathLoss(dKm, fMHz, env) { return 32.44 + 20 * Math.log10(fMHz) + 20 * Math.log10(dKm) + env.L + Math.min(env.k * dKm, 70); }
function airtime(sf, bytes) {
  var tsym = Math.pow(2, sf) / 125000 * 1000, de = tsym > 16 ? 1 : 0, pre = 12.25 * tsym;
  var n = 8 + Math.max(Math.ceil((8 * bytes - 4 * sf + 28 + 16) / (4 * (sf - 2 * de))) * 7, 0);
  return pre + n * tsym;
}
function packetCount(chars) { return Math.max(1, Math.ceil(chars / FRAG_MAX)); }
function airTotal(sf, chars) {
  var left = chars, ms = 0, n = packetCount(chars);
  for (var i = 0; i < n; i++) { var l = Math.min(FRAG_MAX, left); left -= l; ms += airtime(sf, HEADER_BYTES + l); }
  return ms;
}
/* GUESS: SX1262 transmit current at each power setting, from its datasheet figures (rounded) */
var TX_MA = [[2, 25], [10, 32], [14, 45], [17, 90], [20, 105], [22, 118]];
function txMa(p) {
  if (p <= TX_MA[0][0]) return TX_MA[0][1];
  for (var i = 1; i < TX_MA.length; i++) if (p <= TX_MA[i][0]) { var a = TX_MA[i - 1], b = TX_MA[i]; return a[1] + (b[1] - a[1]) * (p - a[0]) / (b[0] - a[0]); }
  return TX_MA[TX_MA.length - 1][1];
}
var SCREENS = [{ n: 'Off', bl: 0 }, { n: 'Dim', bl: 8 }, { n: 'Full', bl: 100 }];

function erf(x) { var s = x < 0 ? -1 : 1; x = Math.abs(x); var t = 1 / (1 + 0.3275911 * x); var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return s * y; }
function phi(z) { return 0.5 * (1 + erf(z / Math.SQRT2)); }
function gauss() { var u = 0; while (!u) u = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random()); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

/* ---------- state ---------- */
var S = { day: 0, sf: 10, pwr: 22, env: 0, band: 0, chars: 17, perHr: 12, screen: 2 };
var rem = { x: 1.2, y: -0.12 };         /* other radio, km from yours (y is down) */
var cam = { cx: 0.6, cy: -0.06, ls: Math.log(300), mode: 'follow' };
var ringR = { good: 1, max: 1, lg: 0, lm: 0 };        /* displayed (animated) radii in km */
var envA = [1, 0, 0, 0];
var drag = false, dragHint = true, lastPtr = null;
var packets = [], hist = [], autoT = 1.2, pulses = [];

function dist() { return Math.max(D_MIN, Math.min(D_MAX, Math.hypot(rem.x, rem.y))); }
function setDist(d) {
  d = clamp(d, D_MIN, D_MAX); var cur = Math.hypot(rem.x, rem.y) || 1;
  rem.x = rem.x / cur * d; rem.y = rem.y / cur * d;
}
function metrics() {
  var d = dist(), env = ENVS[S.env], f = BANDS[S.band].f;
  var rssi = S.pwr - pathLoss(d, f, env), margin = rssi - sens(S.sf);
  return { d: d, rssi: rssi, need: sens(S.sf), margin: margin, p: phi(margin / SIGMA) };
}
/* distance (km) where the link margin equals m dB. Margin only falls with distance, so bisect. */
function rangeFor(m) {
  var env = ENVS[S.env], f = BANDS[S.band].f, lo = 0.002, hi = 400, need = S.pwr - sens(S.sf) - m;
  if (pathLoss(lo, f, env) > need) return lo;
  for (var i = 0; i < 48; i++) { var mid = (lo + hi) / 2; if (pathLoss(mid, f, env) > need) hi = mid; else lo = mid; }
  return lo;
}
function battery() {
  var bl = SCREENS[S.screen].bl, idle = 62 + 0.9 * bl;         /* the simulator's own draw model */
  var air = airTotal(S.sf, S.chars) / 1000, duty = clamp(S.perHr * air / 3600, 0, 1);
  var avg = idle * (1 - duty) + txMa(S.pwr) * duty;
  return { hours: CAP_MAH / avg, avg: avg, duty: duty, air: air };
}

/* ---------- formatting ---------- */
function fmtKm(d) {
  if (d < 1) { var m = d * 1000; return (m < 100 ? Math.round(m / 5) * 5 : Math.round(m / 10) * 10) + ' m'; }
  return d.toFixed(d < 10 ? 2 : 1) + ' km';
}
function fmtLen(km) { return km < 1 ? Math.round(km * 1000) + ' m' : (km % 1 === 0 ? km : +km.toFixed(1)) + ' km'; }
function fmtHours(h) { if (h < 1) return Math.round(h * 60) + ' min'; if (h < 72) return (h < 10 ? h.toFixed(1) : Math.round(h)) + ' h'; return (h / 24).toFixed(1) + ' days'; }
function fmtAir(ms) { return ms < 1000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(2) + ' s'; }
function sgn(n) { return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(Math.round(n)); }

/* ---------- DOM ---------- */
var CSS = '' +
'#lora-range{display:block;width:100%}' +
'#lora-range *{box-sizing:border-box}' +
'#lora-range .lr{position:relative;width:100%;height:calc(100svh - 106px);min-height:660px;background:#070b10;border-top:1px solid var(--border,#262626);border-bottom:1px solid var(--border,#262626);overflow:hidden;color:#e8eef4;font-family:inherit}' +
'#lora-range .lr-map{position:absolute;inset:0}' +
'#lora-range canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y}' +
'#lora-range .lr-card{background:rgba(9,13,19,.84);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:14px 16px;box-shadow:0 8px 30px rgba(0,0,0,.45)}' +
'#lora-range .lr-left,#lora-range .lr-right{position:absolute;top:16px;width:300px;max-height:calc(100% - 32px);overflow:auto}' +
'#lora-range .lr-left{left:16px}#lora-range .lr-right{right:16px}' +
'#lora-range .lr-bottom{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);width:min(640px,calc(100% - 700px));min-width:420px}' +
'#lora-range .lr-title{font-size:15px;font-weight:700;margin:0 0 10px;letter-spacing:.2px}' +
'#lora-range .lr-t{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8d99a6;margin:12px 0 6px}' +
'#lora-range .lr-t:first-of-type{margin-top:0}' +
'#lora-range .lr-seg{display:flex;gap:4px}' +
'#lora-range .lr-seg button{flex:1;min-width:0;padding:7px 0;border-radius:8px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);color:#c3ccd5;font:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:background .15s,border-color .15s,color .15s}' +
'#lora-range .lr-seg button:hover{border-color:rgba(255,255,255,.3)}' +
'#lora-range .lr-seg button[aria-pressed=true]{background:rgba(90,160,220,.2);border-color:#5aa0dc;color:#fff}' +
'#lora-range .lr-row{display:flex;justify-content:space-between;align-items:baseline;gap:10px;font-size:13px;color:#c3ccd5;margin:10px 0 2px}' +
'#lora-range .lr-row b{color:#fff;font-weight:700;font-variant-numeric:tabular-nums}' +
'#lora-range input[type=range]{width:100%;margin:4px 0 2px;accent-color:#5aa0dc;height:22px;background:transparent;cursor:pointer}' +
'#lora-range .lr-big{font-size:34px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums}' +
'#lora-range .lr-chip{display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:700;border:1px solid currentColor;vertical-align:middle;margin-left:8px}' +
'#lora-range .lr-sub{font-size:12px;color:#8d99a6;margin-top:4px;line-height:1.35}' +
'#lora-range .lr-sep{height:1px;background:rgba(255,255,255,.1);margin:12px 0}' +
'#lora-range .lr-kv{display:flex;justify-content:space-between;gap:10px;font-size:13px;margin:7px 0;color:#c3ccd5}' +
'#lora-range .lr-kv b{color:#fff;text-align:right;font-variant-numeric:tabular-nums}' +
'#lora-range .lr-kv small{display:block;color:#8d99a6;font-size:11.5px;font-weight:400;margin-top:1px}' +
'#lora-range .lr-dots{display:flex;gap:4px;margin-top:6px;min-height:10px}' +
'#lora-range .lr-dots i{width:10px;height:10px;border-radius:50%;background:#50dc6e}' +
'#lora-range .lr-dots i.x{background:#e64646}' +
'#lora-range .lr-btns{display:flex;gap:6px;margin-top:12px}' +
'#lora-range .lr-btn{flex:1;padding:8px 6px;border-radius:9px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;font:inherit;font-size:13px;font-weight:600;cursor:pointer}' +
'#lora-range .lr-btn:hover{border-color:#5aa0dc}' +
'#lora-range .lr-btn[aria-pressed=true]{background:rgba(90,160,220,.22);border-color:#5aa0dc}' +
'#lora-range .lr-dist{display:flex;align-items:center;gap:16px}' +
'#lora-range .lr-dist .lr-dv{min-width:92px;font-size:24px;font-weight:700;font-variant-numeric:tabular-nums}' +
'#lora-range .lr-dist input{flex:1}' +
'#lora-range .lr-ends{display:flex;justify-content:space-between;font-size:11px;color:#8d99a6;margin-top:2px}' +
'#lora-range canvas.day{filter:invert(1) hue-rotate(180deg) brightness(.98) saturate(1.15)}' +
'#lora-range .lr-note{font-size:11.5px;color:#8d99a6;line-height:1.4;margin-top:10px}' +
'#lora-range details summary{cursor:pointer;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8d99a6;margin:12px 0 4px;list-style:none}' +
'#lora-range details summary::-webkit-details-marker{display:none}' +
'#lora-range details summary::after{content:" +";color:#5aa0dc}' +
'#lora-range details[open] summary::after{content:" \\2212"}' +
'@media (max-width:1000px){' +
'#lora-range .lr{height:auto;min-height:0;display:flex;flex-direction:column}' +
'#lora-range .lr-map{position:relative;inset:auto;height:62svh;min-height:420px}' +
'#lora-range .lr-left,#lora-range .lr-right{position:static;width:auto;max-height:none;margin:12px 12px 0;overflow:visible}' +
'#lora-range .lr-right{margin-bottom:12px;order:2;margin-top:12px}#lora-range .lr-left{order:3}#lora-range .lr-map{order:1}' +
'#lora-range .lr-bottom{left:12px;right:12px;bottom:12px;transform:none;width:auto;min-width:0}' +
'#lora-range .lr-dist .lr-dv{min-width:78px;font-size:20px}' +
'}';

var style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);

function segHtml(id, labels) { return '<div class="lr-seg" id="' + id + '">' + labels.map(function (l, i) { return '<button type="button" data-v="' + i + '" aria-pressed="false">' + l + '</button>'; }).join('') + '</div>'; }
root.innerHTML = '' +
'<div class="lr">' +
' <div class="lr-map">' +
'  <canvas id="lr-cv" aria-label="Top-down map of two radios. Drag the other radio to change the distance."></canvas>' +
'  <div class="lr-bottom lr-card">' +
'   <div class="lr-dist"><div class="lr-dv" id="lr-dv"></div><input id="lr-dist" type="range" min="0" max="1000" step="1" aria-label="Distance between the radios"></div>' +
'   <div class="lr-ends"><span>20 m</span><span>distance between the radios</span><span>30 km</span></div>' +
'  </div>' +
' </div>' +
' <div class="lr-left lr-card">' +
'  <div class="lr-title">LoRa range planner</div>' +
'  <div class="lr-t">Spreading factor</div>' + segHtml('lr-sf', ['7', '8', '9', '10', '11', '12']) +
'  <div class="lr-row"><span>Transmit power</span><b id="lr-pwv"></b></div><input id="lr-pw" type="range" min="2" max="22" step="1" aria-label="Transmit power in dBm">' +
'  <div class="lr-t">Terrain</div>' + segHtml('lr-env', ['Open', 'Forest', 'Suburban', 'Urban']) +
'  <div class="lr-t">Band</div>' + segHtml('lr-band', ['915 MHz', '868 MHz']) +
'  <details open><summary>Messages and battery</summary>' +
'   <div class="lr-row"><span>Message length</span><b id="lr-chv"></b></div><input id="lr-ch" type="range" min="1" max="360" step="1" aria-label="Message length in characters">' +
'   <div class="lr-row"><span>Messages per hour</span><b id="lr-phv"></b></div><input id="lr-ph" type="range" min="1" max="120" step="1" aria-label="Messages per hour">' +
'   <div class="lr-row"><span>Screen</span></div>' + segHtml('lr-scr', ['Off', 'Dim', 'Full']) +
'  </details>' +
' </div>' +
' <div class="lr-right lr-card">' +
'  <div class="lr-t" style="margin-top:0">Signal at this distance</div>' +
'  <div><span class="lr-big" id="lr-mg"></span><span class="lr-chip" id="lr-chip"></span></div>' +
'  <div class="lr-sub" id="lr-mgs"></div>' +
'  <div class="lr-sep"></div>' +
'  <div class="lr-kv"><span>Estimated range<small>solid link / barely works</small></span><b id="lr-rg"></b></div>' +
'  <div class="lr-kv"><span>Delivery chance<small>this distance, per packet</small></span><b id="lr-pr"></b></div>' +
'  <div class="lr-dots" id="lr-dots" aria-label="Recent test packets"></div>' +
'  <div class="lr-kv"><span>Airtime<small id="lr-pk"></small></span><b id="lr-at"></b></div>' +
'  <div class="lr-kv"><span>Battery life<small id="lr-bs"></small></span><b id="lr-bt"></b></div>' +
'  <div class="lr-t" style="margin-top:12px">Map</div>' + segHtml('lr-theme', ['Night', 'Day']) +
'  <div class="lr-btns"><button type="button" class="lr-btn" id="lr-send">Send test packet</button><button type="button" class="lr-btn" id="lr-fit" aria-pressed="false">Fit range</button></div>' +
'  <div class="lr-note">Estimates from a simplified model, the same one as the LoRa simulator. Real range depends on antennas, terrain and weather. Forest loss and transmit current are my own estimates.</div>' +
' </div>' +
'</div>';

function $(id) { return document.getElementById(id); }
var cv = $('lr-cv'), ctx = cv.getContext('2d');
var FONT = getComputedStyle(root).fontFamily || 'system-ui, sans-serif';
var W = 0, H = 0, DPR = 1, area = { cx: 0, cy: 0, w: 0, h: 0 };

function layout() {
  var r = cv.getBoundingClientRect(); W = r.width; H = r.height;
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  /* the part of the map not covered by the floating panels */
  var lf = root.querySelector('.lr-left'), rt = root.querySelector('.lr-right'), bt = root.querySelector('.lr-bottom');
  var mr = root.querySelector('.lr-map').getBoundingClientRect();
  var left = 0, right = W, top = 56, bottom = H - 8;
  if (getComputedStyle(lf).position === 'absolute') {
    var a = lf.getBoundingClientRect(), b = rt.getBoundingClientRect();
    left = a.right - mr.left + 16; right = b.left - mr.left - 16;
  }
  var t = bt.getBoundingClientRect(); bottom = t.top - mr.top - 20;
  area = { cx: (left + right) / 2, cy: (top + bottom) / 2, w: Math.max(240, right - left), h: Math.max(160, bottom - top) };
}

/* ---------- camera ---------- */
function targetCam() {
  if (cam.mode === 'range') {
    var rr = Math.max(ringR.max, 0.01) * 1.08;
    return { cx: 0, cy: 0, ls: Math.log(Math.min(area.w, area.h) * 0.5 / rr) };
  }
  var ax = Math.max(Math.abs(rem.x), 0.004), ay = Math.max(Math.abs(rem.y), 0.004);
  var s = Math.min(area.w * 0.6 / ax, area.h * 0.5 / ay);
  return { cx: rem.x / 2, cy: rem.y / 2, ls: Math.log(clamp(s, 8, 60000)) };
}
/* Critically damped spring ("smooth damp"): eases in and out, never overshoots, and does not
   depend on the frame rate. This is what keeps the zoom feeling smooth instead of snapping. */
function damp(o, key, target, smooth, dt) {
  var vk = 'v' + key, om = 2 / smooth, x = om * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  var ch = o[key] - target, tmp = ((o[vk] || 0) + om * ch) * dt;
  o[vk] = ((o[vk] || 0) - om * tmp) * e;
  o[key] = target + (ch + tmp) * e;
}
function stepCam(dt) {
  /* while the radio is held, keep re-reading what is under the pointer every frame: held outside the fitted view it zooms out, held inside it zooms in, held on the edge it stays put */
  if (drag && lastPtr) moveTo(lastPtr[0], lastPtr[1]);
  var t = targetCam();
  if (RM) { cam.ls = t.ls; cam.cx = t.cx; cam.cy = t.cy; ringR.lg = Math.log(rangeFor(10)); ringR.lm = Math.log(rangeFor(0)); }
  else {
    damp(cam, 'ls', t.ls, drag ? 0.9 : 0.6, dt);
    damp(cam, 'cx', t.cx, drag ? 0.5 : 0.5, dt);
    damp(cam, 'cy', t.cy, drag ? 0.5 : 0.5, dt);
    damp(ringR, 'lg', Math.log(rangeFor(10)), 0.4, dt);
    damp(ringR, 'lm', Math.log(rangeFor(0)), 0.4, dt);
  }
  ringR.good = Math.exp(ringR.lg); ringR.max = Math.exp(ringR.lm);
  for (var i = 0; i < envA.length; i++) { var tgt = i === S.env ? 1 : 0; envA[i] += clamp(tgt - envA[i], -dt / 0.45, dt / 0.45); }
}
function sc() { return Math.exp(cam.ls); }
function X(wx) { return area.cx + (wx - cam.cx) * sc(); }
function Y(wy) { return area.cy + (wy - cam.cy) * sc(); }
function WX(px) { return cam.cx + (px - area.cx) / sc(); }
function WY(py) { return cam.cy + (py - area.cy) / sc(); }

/* ---------- procedural landscape ---------- */
function hash(i, j, k, salt) {
  var h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k + 1, 1274126177) + Math.imul(salt + 7, 2147483629)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, k) {
  var xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  var a = hash(xi, yi, k, 91), b = hash(xi + 1, yi, k, 91), c = hash(xi, yi + 1, k, 91), d = hash(xi + 1, yi + 1, k, 91);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
var C0 = 0.0015, LV = 12;          /* smallest cell 1.5 m, each level 3x bigger */
function layerAlpha(px) { return sstep(22, 40, px) * (1 - sstep(66, 120, px)); }

/* Everything below is drawn in real-world sizes. A tree is ~6 m wide, a house ~12 m, a block ~80 m, so as you zoom
   out the individual things shrink and fade away and bigger structure (woods, lakes, built-up areas, main roads) takes over. */
var RI0 = 0, RI1 = 0, RJ0 = 0, RJ1 = 0;
function cellRange(c) { RI0 = Math.floor(WX(0) / c) - 1; RI1 = Math.ceil(WX(W) / c) + 1; RJ0 = Math.floor(WY(0) / c) - 1; RJ1 = Math.ceil(WY(H) / c) + 1; return (RI1 - RI0) * (RJ1 - RJ0) < 16000; }

/* multi-scale density field: real feature sizes from 50 m to ~1000 km; coarse levels use only the big octaves, so the same
   woods / towns / lakes stay in the same place while the small detail fades in or out */
var OCT = [0.05, 0.15, 0.45, 1.35, 4, 12, 36, 108, 324, 972];
var OCS = [], OSN = [];
for (var oj = 0; oj < 10; oj++) { OCS.push(Math.cos(oj * 0.9 + 0.4)); OSN.push(Math.sin(oj * 0.9 + 0.4)); }
function oct(wx, wy, j, salt) {          /* each octave is rotated differently so the value noise never lines up with the axes */
  var sc0 = OCT[j], x = (wx * OCS[j] - wy * OSN[j]) / sc0, y = (wx * OSN[j] + wy * OCS[j]) / sc0;
  return vnoise(x, y, salt * 16 + j) - 0.5;
}
var OFF = { 5: [201.3, -885.4], 17: [781.3, -216.9], 31: [-57.7, 174], 300: [325.5, 692.5], 400: [804.6, 372.9] };   /* shifts picked so the start point sits in a pleasant spot */
function dens(wx, wy, cmin, salt) {
  var sum = 0, n = 0, j, of = OFF[salt]; if (of) { wx += of[0]; wy += of[1]; }
  for (j = 0; j < 10; j++) { var sc0 = OCT[j]; if (sc0 < 2.2 * cmin) continue; sum += oct(wx, wy, j, salt); n++; }
  var v = n ? 0.5 + sum / Math.sqrt(n) * 1.35 : 0.5;
  return v;
}
/* same field, but octaves fade in and out smoothly as the zoom changes (L = spacing of the sample lattice in km) */
function densS(wx, wy, L, salt) {
  var sum = 0, w2 = 0, j, of = OFF[salt]; if (of) { wx += of[0]; wy += of[1]; }
  for (j = 0; j < 10; j++) { var sc0 = OCT[j], w = sstep(1.8, 3.2, sc0 / L); if (w <= 0) continue; sum += w * oct(wx, wy, j, salt); w2 += w * w; }
  var v = w2 > 1e-6 ? 0.5 + sum / Math.sqrt(w2) * 1.35 * Math.min(1, Math.sqrt(w2)) : 0.5;
  return v;
}
function mkGrid() { return { buf: new Float32Array(1), nx: 0, ny: 0, gi0: 0, gj0: 0, st: 1 }; }
function gridBuild(g, i0, i1, j0, j1, c, st, cmin, salt) {
  g.st = st; g.gi0 = Math.floor(i0 / st); g.gj0 = Math.floor(j0 / st);
  g.nx = Math.ceil(i1 / st) - g.gi0 + 2; g.ny = Math.ceil(j1 / st) - g.gj0 + 2;
  if (g.buf.length < g.nx * g.ny) g.buf = new Float32Array(g.nx * g.ny);
  for (var a = 0; a < g.nx; a++) for (var b = 0; b < g.ny; b++) g.buf[a * g.ny + b] = dens((g.gi0 + a) * st * c, (g.gj0 + b) * st * c, cmin, salt);
}
function gridBuildS(g, L, salt) {
  g.st = 1; g.gi0 = Math.floor(WX(0) / L) - 1; g.gj0 = Math.floor(WY(0) / L) - 1;
  g.nx = Math.ceil(WX(W) / L) - g.gi0 + 2; g.ny = Math.ceil(WY(H) / L) - g.gj0 + 2;
  if (g.buf.length < g.nx * g.ny) g.buf = new Float32Array(g.nx * g.ny);
  for (var a = 0; a < g.nx; a++) for (var b = 0; b < g.ny; b++) g.buf[a * g.ny + b] = densS((g.gi0 + a) * L, (g.gj0 + b) * L, L, salt);
}
function gridAt(g, i, j) {
  var fx = i / g.st - g.gi0, fy = j / g.st - g.gj0, a = Math.floor(fx), b = Math.floor(fy); fx -= a; fy -= b; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  var o = a * g.ny + b, v00 = g.buf[o], v10 = g.buf[o + g.ny], v01 = g.buf[o + 1], v11 = g.buf[o + g.ny + 1];
  return v00 + (v10 - v00) * fx + (v01 - v00) * fy + (v00 - v10 - v01 + v11) * fx * fy;
}
var gA = mkGrid(), gB = mkGrid();

function blobs(path, g, i0, i1, j0, j1, c, s, thr, rad, wide) {   /* union of circles where the field is above thr */
  for (var i = i0; i <= i1; i++) for (var j = j0; j <= j1; j++) {
    if (gridAt(g, i + 0.5, j + 0.5) <= thr) continue;
    var x = X((i + 0.5) * c), y = Y((j + 0.5) * c), r = c * s * rad * (0.85 + 0.3 * hash(i, j, 3, 5));
    path.moveTo(x + r, y); path.arc(x, y, r, 0, 6.2832);
  }
}

/* ---- shared helpers for rotated neighbourhoods ---- */
var FX = 0, FY = 0, FC = 1, FS = 0, SS = 1, PX = 0, PY = 0, QX = 0, QY = 0;
function setFrame(cx, cy, th, s) { FX = cx; FY = cy; FC = Math.cos(th); FS = Math.sin(th); SS = s; }
function loc(u, v) {
  QX = FX + u * FC - v * FS; QY = FY + u * FS + v * FC;
  PX = area.cx + (QX - cam.cx) * SS; PY = area.cy + (QY - cam.cy) * SS;
}
function quad(p, u, v, hu, hv, a) {
  if (hu * SS < 3.4) { loc(u, v); p.rect(PX - hu * SS, PY - hv * SS, 2 * hu * SS, 2 * hv * SS); return; }   /* tiny: skip the rotation */
  var ca = Math.cos(a), sa = Math.sin(a);
  loc(u + (-hu) * ca - (-hv) * sa, v + (-hu) * sa + (-hv) * ca); p.moveTo(PX, PY);
  loc(u + hu * ca - (-hv) * sa, v + hu * sa + (-hv) * ca); p.lineTo(PX, PY);
  loc(u + hu * ca - hv * sa, v + hu * sa + hv * ca); p.lineTo(PX, PY);
  loc(u + (-hu) * ca - hv * sa, v + (-hu) * sa + hv * ca); p.lineTo(PX, PY);
  p.closePath();
}
function dotAt(p, u, v, r) { loc(u, v); p.moveTo(PX + r, PY); p.arc(PX, PY, r, 0, 6.2832); }
function line(p, u0, v0, u1, v1) { loc(u0, v0); p.moveTo(PX, PY); loc(u1, v1); p.lineTo(PX, PY); }

/* ---- streams (open land + forest) ---- */
var SW = 1;
function streamX(wy, env) { var p = env ? 2.1 : 0.4; return 0.42 * Math.sin(wy / 0.95 + p) + 0.16 * Math.sin(wy / 0.31 + p * 2.3) * SW + 2.4 * Math.sin(wy / 7 + p) + 0.9 * Math.sin(wy / 2.3 + p * 1.7); }
function drawStream(aEnv, env, s) {
  var y0 = WY(0) - 0.05, y1 = WY(H) + 0.05, n = Math.min(400, Math.ceil(H / 5) + 2), st = (y1 - y0) / n, i;
  SW = sstep(40, 160, s);
  var bank = new Path2D();
  for (i = 0; i <= n; i++) { var y = y0 + i * st, x = X(streamX(y, env)), yy = Y(y); if (i) bank.lineTo(x, yy); else bank.moveTo(x, yy); }
  var w = clamp(0.012 * s, 1.6, 12);
  ctx.globalAlpha = aEnv; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(120,170,140,0.10)'; ctx.lineWidth = w + 5; ctx.stroke(bank);
  ctx.strokeStyle = 'rgba(110,175,225,0.30)'; ctx.lineWidth = w; ctx.stroke(bank);
  ctx.globalAlpha = 1;
}

/* ---- roads: irregular spacing, some lines missing, gently wavy ---- */
var AC = 1, AS = 0, AD = 1, AW = 0, AL = 1, AK = 0;
function avSetup(phi, D, wig, len, key) { AC = Math.cos(phi); AS = Math.sin(phi); AD = D; AW = wig; AL = len; AK = key; }
function avOn(n) { return hash(n, 7, AK, 4) > 0.3; }
function avOff(n) { return n * AD + (hash(n, 7, AK, 3) - 0.5) * 0.55 * AD; }
function avDist(wx, wy) {
  var a = wx * AC + wy * AS, b = -wx * AS + wy * AC + AW * Math.sin(a / AL), n0 = Math.round(b / AD), best = 1e9;
  for (var n = n0 - 1; n <= n0 + 1; n++) { if (!avOn(n)) continue; var d = Math.abs(b - avOff(n)); if (d < best) best = d; }
  return best;
}
function drawAvenues(widthPx, rgba) {
  var xs = [WX(0), WX(W)], ys = [WY(0), WY(H)], amin = 1e9, amax = -1e9, bmin = 1e9, bmax = -1e9, i, j, s = sc();
  for (i = 0; i < 2; i++) for (j = 0; j < 2; j++) {
    var a = xs[i] * AC + ys[j] * AS, b = -xs[i] * AS + ys[j] * AC;
    if (a < amin) amin = a; if (a > amax) amax = a; if (b < bmin) bmin = b; if (b > bmax) bmax = b;
  }
  var n0 = Math.floor((bmin - AW) / AD) - 1, n1 = Math.ceil((bmax + AW) / AD) + 1, steps = Math.min(220, Math.ceil((amax - amin) * s / 24) + 2), p = new Path2D();
  if (n1 - n0 > 40) return;
  for (var n = n0; n <= n1; n++) {
    if (!avOn(n)) continue;
    for (i = 0; i <= steps; i++) {
      var aa = amin + (amax - amin) * i / steps, bb = avOff(n) - AW * Math.sin(aa / AL);
      var px = X(aa * AC - bb * AS), py = Y(aa * AS + bb * AC);
      if (i) p.lineTo(px, py); else p.moveTo(px, py);
    }
  }
  ctx.lineJoin = 'round'; ctx.strokeStyle = rgba; ctx.lineWidth = widthPx; ctx.stroke(p);
}

/* ---------- drawing ---------- */
function drawTerrain(envIdx, aEnv) {
  var s = sc(), k, c, px, a;
  massLayers(envIdx, s, aEnv);
  for (k = 0; k < LV; k++) {
    c = C0 * Math.pow(3, k); px = c * s; a = layerAlpha(px) * aEnv;
    if (envIdx === 0 && a >= 0.012 && cellRange(c)) { ctx.globalAlpha = a; contours(k, c, s); }
    if (envIdx >= 2) {                                 /* road hierarchy: only roads whose spacing makes sense at this zoom */
      var D = (envIdx === 2 ? 14 : 12) * c, ra = sstep(260, 420, D * s) * (1 - sstep(1500, 2600, D * s)) * aEnv;
      if (ra > 0.012) { ctx.globalAlpha = ra; avSetup(envIdx === 2 ? 0.5 : 0.62, D, 0.9 * c, 4 * c, 20 + k); drawAvenues(Math.max(1.3, c * s * 0.13), envIdx === 2 ? 'rgba(210,220,235,0.11)' : 'rgba(190,205,235,0.13)'); }
    }
  }
  ctx.globalAlpha = 1;
  if (envIdx === 0) openObjects(s, aEnv);
  else if (envIdx === 1) forestObjects(s, aEnv);
  else if (envIdx === 2) { speckle(2, s, aEnv); suburbObjects(s, aEnv); }
  else { speckle(3, s, aEnv); urbanObjects(s, aEnv); }
  if (envIdx <= 1) drawStream(aEnv, envIdx, s);
}

/* ---- soft density maps: rendered small and scaled up, so woods / towns / lakes get smooth natural edges ---- */
var FRES = 8, fcan = null, fctx = null, fimg = null, fw = 0, fh = 0, fo = [0, 0, 0, 0];
function fieldPaint(g, L, fn) {
  var w = Math.ceil(W / FRES), h = Math.ceil(H / FRES);
  if (!fcan) { fcan = document.createElement('canvas'); fctx = fcan.getContext('2d'); }
  if (fw !== w || fh !== h) { fcan.width = fw = w; fcan.height = fh = h; fimg = fctx.createImageData(w, h); }
  var d = fimg.data, x, y, o = 0, ic = 1 / L, wx0 = WX(0), wy0 = WY(0), stp = FRES / sc();
  for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
    fn(gridAt(g, (wx0 + x * stp) * ic, (wy0 + y * stp) * ic));
    d[o++] = fo[0]; d[o++] = fo[1]; d[o++] = fo[2]; d[o++] = fo[3] * 255;
  }
  fctx.putImageData(fimg, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.drawImage(fcan, 0, 0, w * FRES, h * FRES);
}
function band(v, t0, t1) { var t = clamp((v - t0) / (t1 - t0), 0, 1); return t * t * (3 - 2 * t); }
function massLayers(envIdx, s, aEnv) {
  var L = 36 / s;
  ctx.globalAlpha = aEnv;
  if (envIdx <= 1) {
    gridBuildS(gA, L, 31);
    fieldPaint(gA, L, function (v) { fo[0] = 90; fo[1] = 150; fo[2] = 215; fo[3] = band(v, 0.76, 0.8) * 0.2; });
  }
  if (envIdx === 0) {
    gridBuildS(gB, L, 17);
    fieldPaint(gB, L, function (v) { fo[0] = 165; fo[1] = 195; fo[2] = 130; fo[3] = 0.05 + band(v, 0.3, 0.55) * 0.08; });
  } else if (envIdx === 1) {
    gridBuildS(gB, L, 5);
    fieldPaint(gB, L, function (v) { var t1 = band(v, 0.3, 0.55), t2 = band(v, 0.55, 0.75); fo[0] = 56 + 10 * t2; fo[1] = 140 + 12 * t2; fo[2] = 100 + 8 * t2; fo[3] = 0.07 + t1 * 0.16 + t2 * 0.08; });
  } else if (envIdx === 2) {
    gridBuildS(gB, L, 300);
    fieldPaint(gB, L, function (v) { fo[0] = 170; fo[1] = 190; fo[2] = 215; fo[3] = band(v, 0.3, 0.55) * 0.17; });
  } else {
    gridBuildS(gB, L, 400);
    fieldPaint(gB, L, function (v) { var t1 = band(v, 0.3, 0.5), t2 = band(v, 0.55, 0.72); fo[0] = 140 + 30 * t2; fo[1] = 170 + 35 * t2; fo[2] = 220 + 25 * t2; fo[3] = t1 * 0.15 + t2 * 0.1; });
  }
  ctx.globalAlpha = 1;
}

/* ---- Open: contour lines at every scale ---- */
var cornerBuf = new Float32Array(1);
function contours(k, c, s) {
  var i0 = RI0, i1 = RI1, j0 = RJ0, j1 = RJ1, i, j, nx = i1 - i0 + 2, ny = j1 - j0 + 2;
  if (cornerBuf.length < nx * ny) cornerBuf = new Float32Array(nx * ny);
  for (i = 0; i < nx; i++) for (j = 0; j < ny; j++) cornerBuf[i * ny + j] = vnoise((i0 + i) / 5, (j0 + j) / 5, k) * 0.7 + vnoise((i0 + i) / 2.2 + 40, (j0 + j) / 2.2, k) * 0.3;
  var lines = new Path2D(), major = new Path2D(), levels = [0.36, 0.46, 0.56, 0.66];
  for (i = 0; i < nx - 1; i++) for (j = 0; j < ny - 1; j++) {
    var a = cornerBuf[i * ny + j], b = cornerBuf[(i + 1) * ny + j], cc = cornerBuf[(i + 1) * ny + j + 1], d = cornerBuf[i * ny + j + 1];
    var mn = Math.min(a, b, cc, d), mx = Math.max(a, b, cc, d), ci = i0 + i, cj = j0 + j;
    for (var L = 0; L < 4; L++) {
      var t = levels[L]; if (t < mn || t > mx) continue;
      var cs = (a > t ? 8 : 0) | (b > t ? 4 : 0) | (cc > t ? 2 : 0) | (d > t ? 1 : 0);
      if (cs === 0 || cs === 15) continue;
      var tx = ci + (t - a) / (b - a), ty = cj, rx = ci + 1, ry = cj + (t - b) / (cc - b), bx = ci + (t - d) / (cc - d), by = cj + 1, lx = ci, ly = cj + (t - a) / (d - a);
      var p = (L === 1 || L === 3) ? major : lines, e1x, e1y, e2x, e2y, two = false, f1x, f1y, f2x, f2y;
      switch (cs) {
        case 1: case 14: e1x = lx; e1y = ly; e2x = bx; e2y = by; break;
        case 2: case 13: e1x = bx; e1y = by; e2x = rx; e2y = ry; break;
        case 3: case 12: e1x = lx; e1y = ly; e2x = rx; e2y = ry; break;
        case 4: case 11: e1x = tx; e1y = ty; e2x = rx; e2y = ry; break;
        case 6: case 9: e1x = tx; e1y = ty; e2x = bx; e2y = by; break;
        case 7: case 8: e1x = lx; e1y = ly; e2x = tx; e2y = ty; break;
        case 5: e1x = lx; e1y = ly; e2x = tx; e2y = ty; two = true; f1x = bx; f1y = by; f2x = rx; f2y = ry; break;
        default: e1x = tx; e1y = ty; e2x = rx; e2y = ry; two = true; f1x = lx; f1y = ly; f2x = bx; f2y = by; break;
      }
      p.moveTo(X(e1x * c), Y(e1y * c)); p.lineTo(X(e2x * c), Y(e2y * c));
      if (two) { p.moveTo(X(f1x * c), Y(f1y * c)); p.lineTo(X(f2x * c), Y(f2y * c)); }
    }
  }
  ctx.lineJoin = 'round'; ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(165,190,130,0.10)'; ctx.stroke(lines);
  ctx.strokeStyle = 'rgba(170,200,140,0.20)'; ctx.stroke(major);
}

/* ---- Open: real-size things (lone trees ~10 m, shrubs ~3 m, grass tufts) that vanish as you zoom out ---- */
function openObjects(s, aEnv) {
  var c, px, a, i, j, x, y, wx, wy, h, r;
  c = 0.09; px = c * s; a = sstep(30, 48, px) * (1 - sstep(3000, 6000, px)) * aEnv;                  /* lone trees */
  if (a > 0.01 && cellRange(c)) {
    var trees = new Path2D(), cores = new Path2D(), halfw = Math.max(0.01, 14 / s);
    for (i = RI0; i <= RI1; i++) for (j = RJ0; j <= RJ1; j++) {
      if (hash(i, j, 1, 1) > 0.3) continue;
      wx = (i + hash(i, j, 1, 2)) * c; wy = (j + hash(i, j, 1, 3)) * c;
      if (Math.abs(wx - streamX(wy, 0)) < halfw) continue;
      x = X(wx); y = Y(wy); r = c * s * (0.05 + 0.025 * hash(i, j, 1, 4));
      trees.moveTo(x + r, y); trees.arc(x, y, r, 0, 6.2832);
      if (r > 5) { cores.moveTo(x + 1.3, y); cores.arc(x, y, 1.3, 0, 6.2832); }
    }
    ctx.globalAlpha = a; ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(80,150,105,0.16)'; ctx.fill(trees); ctx.strokeStyle = 'rgba(130,205,160,0.32)'; ctx.stroke(trees);
    ctx.fillStyle = 'rgba(190,225,200,0.30)'; ctx.fill(cores);
  }
  c = 0.025; px = c * s; a = sstep(24, 40, px) * (1 - sstep(1500, 3000, px)) * aEnv;                  /* shrubs */
  if (a > 0.01 && cellRange(c)) {
    var sh = new Path2D();
    for (i = RI0; i <= RI1; i++) for (j = RJ0; j <= RJ1; j++) {
      if (hash(i, j, 2, 1) > 0.26) continue;
      wx = (i + hash(i, j, 2, 2)) * c; wy = (j + hash(i, j, 2, 3)) * c;
      if (Math.abs(wx - streamX(wy, 0)) < Math.max(0.006, 8 / s)) continue;
      x = X(wx); y = Y(wy); r = c * s * (0.05 + 0.07 * hash(i, j, 2, 4));
      sh.moveTo(x + r, y); sh.arc(x, y, r, 0, 6.2832);
    }
    ctx.globalAlpha = a; ctx.fillStyle = 'rgba(150,190,130,0.22)'; ctx.fill(sh);
  }
  c = 0.006; px = c * s; a = sstep(40, 70, px) * (1 - sstep(1200, 2400, px)) * aEnv;                  /* grass tufts */
  if (a > 0.01 && cellRange(c)) {
    var tf = new Path2D(), u = c * s * 0.09;
    for (i = RI0; i <= RI1; i++) for (j = RJ0; j <= RJ1; j++) {
      if (hash(i, j, 3, 1) > 0.3) continue;
      x = X((i + hash(i, j, 3, 2)) * c); y = Y((j + hash(i, j, 3, 3)) * c);
      tf.moveTo(x, y); tf.lineTo(x - u * 0.7, y - u * 1.6); tf.moveTo(x, y); tf.lineTo(x + u * 0.1, y - u * 2); tf.moveTo(x, y); tf.lineTo(x + u * 0.8, y - u * 1.5);
    }
    ctx.globalAlpha = a; ctx.strokeStyle = 'rgba(170,205,140,0.35)'; ctx.lineWidth = 1; ctx.stroke(tf);
  }
  ctx.globalAlpha = 1;
}

/* ---- Forest: individual trees (~6 m crowns, never touching) appear only when close; undergrowth even closer ---- */
function forestObjects(s, aEnv) {
  var c = 0.022, px = c * s, a = sstep(10, 16, px) * (1 - sstep(2500, 5000, px)) * aEnv, i, j;
  if (a > 0.01 && cellRange(c)) {
    gridBuild(gA, RI0, RI1, RJ0, RJ1, c, 4, 0.04, 5); gridBuild(gB, RI0, RI1, RJ0, RJ1, c, 4, 0.04, 31);
    var p0 = new Path2D(), p1 = new Path2D(), p2 = new Path2D(), cores = new Path2D(), rings = new Path2D(), halfw = Math.max(0.009, 12 / s);
    for (i = RI0; i <= RI1; i++) for (j = RJ0; j <= RJ1; j++) {
      var d = gridAt(gA, i + 0.5, j + 0.5);
      if (hash(i, j, 0, 6) > sstep(0.42, 0.62, d) * 0.92) continue;
      if (gridAt(gB, i + 0.5, j + 0.5) > 0.78) continue;                        /* lake */
      var h3 = hash(i, j, 0, 3), wx = (i + 0.5 + (hash(i, j, 0, 1) - 0.5) * 0.36) * c, wy = (j + 0.5 + (hash(i, j, 0, 2) - 0.5) * 0.36) * c;
      if (Math.abs(wx - streamX(wy, 1)) < halfw) continue;
      var r = c * s * (0.2 + 0.12 * h3), x = X(wx), y = Y(wy), p = h3 < 0.33 ? p0 : h3 < 0.66 ? p1 : p2;
      if (r < 2.6) { p.rect(x - r, y - r, 2 * r, 2 * r); continue; }
      p.moveTo(x + r, y); p.arc(x, y, r, 0, 6.2832);
      if (r > 6) { cores.moveTo(x + r * 0.2, y); cores.arc(x, y, r * 0.2, 0, 6.2832); }
      if (r > 22) { rings.moveTo(x + r * 0.62, y); rings.arc(x, y, r * 0.62, 0, 6.2832); }
    }
    ctx.globalAlpha = a; ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(54,130,96,0.22)'; ctx.fill(p0);
    ctx.fillStyle = 'rgba(70,150,108,0.18)'; ctx.fill(p1);
    ctx.fillStyle = 'rgba(46,112,92,0.26)'; ctx.fill(p2);
    ctx.strokeStyle = 'rgba(140,215,170,0.28)'; ctx.stroke(p0); ctx.stroke(p1); ctx.stroke(p2);
    ctx.fillStyle = 'rgba(190,235,205,0.22)'; ctx.fill(cores);
    ctx.strokeStyle = 'rgba(140,215,170,0.14)'; ctx.stroke(rings);
  }
  c = 0.08; px = c * s; a = sstep(7, 12, px) * (1 - sstep(34, 60, px)) * aEnv;                       /* canopy speckle: stand-ins for groups of trees seen from far away */
  if (a > 0.01 && cellRange(c)) {
    gridBuild(gA, RI0, RI1, RJ0, RJ1, c, 2, 0.08, 5); gridBuild(gB, RI0, RI1, RJ0, RJ1, c, 2, 0.08, 31);
    var sp = new Path2D(), halfs = Math.max(0.03, 10 / s);
    for (i = RI0; i <= RI1; i++) for (j = RJ0; j <= RJ1; j++) {
      if (hash(i, j, 7, 6) > sstep(0.42, 0.62, gridAt(gA, i + 0.5, j + 0.5)) * 0.8) continue;
      if (gridAt(gB, i + 0.5, j + 0.5) > 0.78) continue;
      var swx = (i + hash(i, j, 7, 1)) * c, swy = (j + hash(i, j, 7, 2)) * c;
      if (Math.abs(swx - streamX(swy, 1)) < halfs) continue;
      var sr = c * s * (0.09 + 0.07 * hash(i, j, 7, 3)), sx = X(swx), sy = Y(swy);
      if (sr < 2.4) sp.rect(sx - sr, sy - sr, 2 * sr, 2 * sr); else { sp.moveTo(sx + sr, sy); sp.arc(sx, sy, sr, 0, 6.2832); }
    }
    ctx.globalAlpha = a; ctx.fillStyle = 'rgba(80,160,115,0.34)'; ctx.fill(sp);
  }
  c = 0.008; px = c * s; a = sstep(14, 22, px) * (1 - sstep(700, 1400, px)) * aEnv;                   /* undergrowth */
  if (a > 0.01 && cellRange(c)) {
    gridBuild(gA, RI0, RI1, RJ0, RJ1, c, 4, 0.04, 5);
    var u = new Path2D();
    for (i = RI0; i <= RI1; i++) for (j = RJ0; j <= RJ1; j++) {
      if (hash(i, j, 4, 1) > sstep(0.4, 0.6, gridAt(gA, i + 0.5, j + 0.5)) * 0.4) continue;
      var xx = X((i + hash(i, j, 4, 2)) * c), yy = Y((j + hash(i, j, 4, 3)) * c), rr = c * s * (0.1 + 0.12 * hash(i, j, 4, 5));
      u.moveTo(xx + rr, yy); u.arc(xx, yy, rr, 0, 6.2832);
    }
    ctx.globalAlpha = a; ctx.fillStyle = 'rgba(100,170,115,0.25)'; ctx.fill(u);
  }
  ctx.globalAlpha = 1;
}

/* far-away stand-in for houses / buildings: small marks that thin out and vanish as the real ones take over */
function speckle(envIdx, s, aEnv) {
  var urban = envIdx === 3, c = 0.06, px = c * s, a = sstep(6, 10, px) * (1 - sstep(26, 48, px)) * aEnv, i, j;
  if (a < 0.01 || !cellRange(c)) return;
  gridBuild(gA, RI0, RI1, RJ0, RJ1, c, 2, 0.1, urban ? 400 : 300);
  var p = new Path2D(), thr = urban ? 0.48 : 0.52;
  for (i = RI0; i <= RI1; i++) for (j = RJ0; j <= RJ1; j++) {
    var d = gridAt(gA, i + 0.5, j + 0.5);
    if (d < thr || hash(i, j, 8, 1) > (urban ? 0.8 : 0.5)) continue;
    var r = c * s * (urban ? 0.16 + 0.12 * hash(i, j, 8, 2) : 0.1 + 0.08 * hash(i, j, 8, 2));
    p.rect(X((i + hash(i, j, 8, 3)) * c) - r, Y((j + hash(i, j, 8, 4)) * c) - r, 2 * r, 2 * r);
  }
  ctx.globalAlpha = a; ctx.fillStyle = urban ? 'rgba(160,190,235,0.42)' : 'rgba(175,190,215,0.36)'; ctx.fill(p); ctx.globalAlpha = 1;
}

/* ---- Suburban: ~12 m houses on curving streets, grouped in neighbourhoods that each face their own way ---- */
function suburbObjects(s, aEnv) {
  var c = 0.04, px = c * s, a = sstep(14, 22, px) * (1 - sstep(2200, 4400, px)) * aEnv;
  if (a < 0.01) return;
  var B = 8 * c, bi, bj, n, m, houses = new Path2D(), houses2 = new Path2D(), ridges = new Path2D(), road = new Path2D(), bulbs = new Path2D(), green = new Path2D(), greenFill = new Path2D();
  var bi0 = Math.floor(WX(0) / B) - 1, bi1 = Math.floor(WX(W) / B) + 1, bj0 = Math.floor(WY(0) / B) - 1, bj1 = Math.floor(WY(H) / B) + 1, cullPx = B * s * 0.75;
  if ((bi1 - bi0) * (bj1 - bj0) > 900) return;
  avSetup(0.5, 0.55, 0.05, 0.3, 61);
  for (bj = bj0; bj <= bj1; bj++) for (bi = bi0; bi <= bi1; bi++) {
    var cx = (bi + 0.5 * (bj & 1) + (hash(bi, bj, 0, 10) - 0.5) * 0.2) * B, cy = (bj + (hash(bi, bj, 0, 9) - 0.5) * 0.2) * B;
    var sx = X(cx), sy = Y(cy);
    if (sx < -cullPx || sx > W + cullPx || sy < -cullPx || sy > H + cullPx) continue;
    if (dens(cx, cy, 0.15, 300) < 0.5) continue;                                        /* outside the built-up area */
    var h0 = hash(bi, bj, 0, 11), th = (hash(bi, bj, 0, 12) - 0.5) * 0.7;
    setFrame(cx, cy, th, s);
    var Hc = B * 0.39 * (0.8 + 0.2 * hash(bi, bj, 0, 13));
    if (h0 < 0.14) {
      var pr = Hc * 0.75;
      for (n = 0; n < 14; n++) { var ang = hash(bi, bj, 0, 30 + n) * 6.2832, rr = Math.sqrt(hash(bi, bj, 0, 50 + n)) * pr; dotAt(green, Math.cos(ang) * rr, Math.sin(ang) * rr * 0.8, c * s * 0.1); }
      loc(0, 0); greenFill.moveTo(PX + pr * s, PY); greenFill.ellipse(PX, PY, pr * s, pr * s * 0.8, th, 0, 6.2832);
      continue;
    }
    var pitch = 2.1 * c, nS = Math.max(1, Math.floor(2 * Hc / pitch)), v0 = -(nS - 1) * pitch / 2;
    var bend = (hash(bi, bj, 0, 14) - 0.5) * 1.1 * c, ph = hash(bi, bj, 0, 15) * 6.2832, sgn = hash(bi, bj, 0, 16) < 0.5 ? 1 : -1, uc = -sgn * Hc, f = Math.PI * 0.9 / Hc;
    line(road, uc, v0 - 0.9 * c, uc, -v0 + 0.9 * c);
    for (n = 0; n < nS; n++) {
      var vs = v0 + n * pitch, len = 2 * Hc * (0.45 + 0.5 * hash(bi * 7 + n, bj, 0, 17)), ue = uc + sgn * len, ua = Math.min(uc, ue), ub = Math.max(uc, ue);
      for (m = 0; m <= 9; m++) { var uu = uc + sgn * len * m / 9; loc(uu, vs + bend * Math.sin(uu * f + ph)); if (m) road.lineTo(PX, PY); else road.moveTo(PX, PY); }
      dotAt(bulbs, ue, vs + bend * Math.sin(ue * f + ph), c * s * 0.36);
      for (var u = ua + 0.6 * c; u < ub - 0.5 * c; u += 0.5 * c) {
        if (Math.abs(u - ue) < 0.9 * c) continue;
        var slope = Math.atan(bend * f * Math.cos(u * f + ph)), vb = vs + bend * Math.sin(u * f + ph);
        for (var side = -1; side <= 1; side += 2) {
          var hh = hash(Math.floor(u / c * 8) + n * 131 + side * 7, bi * 13 + bj, 0, 18);
          if (hh < 0.1) continue;
          var hv = c * (0.15 + 0.07 * hash(Math.floor(u / c * 8), n + side * 5 + bi, 0, 19)), hu = c * (0.13 + 0.07 * hh), vc = vb + side * (0.44 * c + hv);
          loc(u, vc);
          if (avDist(QX, QY) < 0.016) continue;
          quad(hh < 0.55 ? houses : houses2, u, vc, hu, hv, slope);
          if (hv * s > 18) { loc(u - hu * 0.9, vc); ridges.moveTo(PX, PY); loc(u + hu * 0.9, vc); ridges.lineTo(PX, PY); }
        }
      }
    }
  }
  ctx.globalAlpha = a; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  drawAvenues(Math.max(1.3, 0.014 * s), 'rgba(210,220,235,0.11)');
  ctx.strokeStyle = 'rgba(200,215,230,0.2)'; ctx.lineWidth = Math.max(1, c * s * 0.12); ctx.stroke(road);
  ctx.strokeStyle = 'rgba(200,215,230,0.10)'; ctx.lineWidth = 1; ctx.fillStyle = 'rgba(200,215,230,0.06)'; ctx.fill(bulbs); ctx.stroke(bulbs);
  ctx.fillStyle = 'rgba(165,185,210,0.24)'; ctx.fill(houses);
  ctx.fillStyle = 'rgba(195,175,160,0.22)'; ctx.fill(houses2);
  ctx.strokeStyle = 'rgba(190,205,225,0.28)'; ctx.stroke(houses); ctx.stroke(houses2);
  ctx.strokeStyle = 'rgba(190,205,225,0.16)'; ctx.stroke(ridges);
  ctx.fillStyle = 'rgba(80,150,105,0.08)'; ctx.fill(greenFill);
  ctx.strokeStyle = 'rgba(120,200,150,0.22)'; ctx.stroke(greenFill); ctx.fillStyle = 'rgba(80,150,105,0.16)'; ctx.fill(green); ctx.stroke(green);
  ctx.globalAlpha = 1;
}

/* ---- Urban: ~80 m blocks of uneven size split into buildings, taller towards the middle of town ---- */
var eu = new Float32Array(16), ev = new Float32Array(16);
function edges(arr, Hc, c, bi, bj, k, salt) {
  var n = 0, p = -Hc; arr[n++] = p;
  while (n < 14) {
    var w = c * (1.1 + 1.9 * hash(bi * 5 + n, bj, k, salt + n));
    if (p + w > Hc - 0.7 * c) break;
    p += w; arr[n++] = p;
  }
  arr[n++] = Hc; return n;
}
function urbanObjects(s, aEnv) {
  var c = 0.03, px = c * s, al = sstep(12, 20, px) * (1 - sstep(2200, 4400, px)) * aEnv;
  if (al < 0.01) return;
  var B = 9 * c, bi, bj, a, b, b0 = new Path2D(), b1 = new Path2D(), b2 = new Path2D(), inner = new Path2D(), road = new Path2D(), parks = new Path2D(), parkDots = new Path2D();
  var bi0 = Math.floor(WX(0) / B) - 1, bi1 = Math.floor(WX(W) / B) + 1, bj0 = Math.floor(WY(0) / B) - 1, bj1 = Math.floor(WY(H) / B) + 1, cullPx = B * s * 0.75, k = 0;
  if ((bi1 - bi0) * (bj1 - bj0) > 900) return;
  avSetup(0.62, 0.4, 0.04, 0.25, 62);
  for (bj = bj0; bj <= bj1; bj++) for (bi = bi0; bi <= bi1; bi++) {
    var cx = (bi + 0.5 * (bj & 1) + (hash(bi, bj, k, 10) - 0.5) * 0.14) * B, cy = (bj + (hash(bi, bj, k, 9) - 0.5) * 0.14) * B;
    var sx = X(cx), sy = Y(cy);
    if (sx < -cullPx || sx > W + cullPx || sy < -cullPx || sy > H + cullPx) continue;
    var dd = dens(cx, cy, 0.15, 400); if (dd < 0.46) continue;
    var th = (hash(bi, bj, k, 12) - 0.5) * 0.42, Hc = B * 0.42;
    setFrame(cx, cy, th, s);
    var nu = edges(eu, Hc, c, bi, bj, k, 100), nv = edges(ev, Hc, c, bi, bj, k, 200);
    for (a = 0; a < nu; a++) line(road, eu[a], -Hc, eu[a], Hc);
    for (b = 0; b < nv; b++) line(road, -Hc, ev[b], Hc, ev[b]);
    for (a = 0; a < nu - 1; a++) for (b = 0; b < nv - 1; b++) {
      var g = 0.12 * c, u0 = eu[a] + g, u1 = eu[a + 1] - g, v0 = ev[b] + g, v1 = ev[b + 1] - g, hb = hash(bi * 16 + a, bj * 16 + b, k, 21);
      loc((u0 + u1) / 2, (v0 + v1) / 2);
      if (avDist(QX, QY) < 0.022) continue;
      var tall = clamp((dd - 0.46) * 2.2, 0, 1) * 0.8 + vnoise(QX / 0.1, QY / 0.1, 9) * 0.35 - 0.1;
      if (hb < 0.1) {
        quad(parks, (u0 + u1) / 2, (v0 + v1) / 2, (u1 - u0) / 2 * 0.94, (v1 - v0) / 2 * 0.94, 0);
        dotAt(parkDots, (u0 + u1) / 2 - (u1 - u0) * 0.2, (v0 + v1) / 2, c * s * 0.12); dotAt(parkDots, (u0 + u1) / 2 + (u1 - u0) * 0.15, (v0 + v1) / 2 + (v1 - v0) * 0.2, c * s * 0.1);
        continue;
      }
      var wU = u1 - u0, wV = v1 - v0, along = wU >= wV, len = along ? wU : wV, parts = len > 2.2 * c ? 3 : len > 1.3 * c ? 2 : 1;
      if (hash(bi * 16 + a, bj * 16 + b, k, 22) < 0.3) parts = Math.max(1, parts - 1);
      var cur = along ? u0 : v0;
      for (var q = 0; q < parts; q++) {
        var end = along ? u1 : v1, seg = q === parts - 1 ? end - cur : (end - cur) * Math.min(0.35 + 0.3 * hash(bi * 16 + a, bj * 16 + b, k, 40 + q), 0.6), cc = cur + seg / 2, gap = 0.035 * c;
        var ht = clamp(tall + (hash(bi * 16 + a, bj * 16 + b, k, 60 + q) - 0.5) * 0.5, 0, 1), P = ht < 0.33 ? b0 : ht < 0.66 ? b1 : b2, hu2, hv2, cu, cv;
        if (along) { hu2 = seg / 2 - gap; hv2 = wV / 2 - gap; cu = cc; cv = (v0 + v1) / 2; } else { hu2 = wU / 2 - gap; hv2 = seg / 2 - gap; cu = (u0 + u1) / 2; cv = cc; }
        quad(P, cu, cv, hu2, hv2, 0);
        if (ht > 0.6) quad(inner, cu, cv, hu2 * 0.55, hv2 * 0.55, 0);
        cur += seg;
      }
    }
  }
  ctx.globalAlpha = al; ctx.lineJoin = 'round';
  drawAvenues(Math.max(1.3, 0.016 * s), 'rgba(190,205,235,0.13)');
  ctx.strokeStyle = 'rgba(190,205,235,0.14)'; ctx.lineWidth = Math.max(1, c * s * 0.1); ctx.stroke(road);
  ctx.fillStyle = 'rgba(125,155,200,0.15)'; ctx.fill(b0);
  ctx.fillStyle = 'rgba(135,165,210,0.22)'; ctx.fill(b1);
  ctx.fillStyle = 'rgba(150,180,225,0.30)'; ctx.fill(b2);
  ctx.strokeStyle = 'rgba(170,195,235,0.30)'; ctx.lineWidth = 1; ctx.stroke(b0); ctx.stroke(b1); ctx.stroke(b2);
  ctx.strokeStyle = 'rgba(170,195,235,0.18)'; ctx.stroke(inner);
  ctx.fillStyle = 'rgba(80,150,105,0.07)'; ctx.fill(parks); ctx.strokeStyle = 'rgba(120,200,150,0.22)'; ctx.stroke(parks);
  ctx.fillStyle = 'rgba(80,150,105,0.18)'; ctx.fill(parkDots);
  ctx.globalAlpha = 1;
}

/* ---------- grid + scale bar ---------- */
function drawGrid() {
  var s = sc(), x0 = WX(0), x1 = WX(W), y0 = WY(0), y1 = WY(H);
  for (var e = -4; e <= 3; e++) {
    [1, 2, 5].forEach(function (m) {
      var step = m * Math.pow(10, e), px = step * s;
      var a = sstep(26, 80, px) * (1 - sstep(900, 1800, px)) * (0.035 + 0.05 * sstep(70, 420, px));
      if (a < 0.004) return;
      ctx.strokeStyle = 'rgba(200,220,240,' + a.toFixed(4) + ')'; ctx.lineWidth = 1; ctx.beginPath();
      for (var gx = Math.ceil(x0 / step) * step; gx <= x1; gx += step) { var x = Math.round(X(gx)) + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (var gy = Math.ceil(y0 / step) * step; gy <= y1; gy += step) { var y = Math.round(Y(gy)) + 0.5; ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
    });
  }
}
function niceLen(maxPx) {
  var s = sc(), best = 0.001;
  for (var e = -4; e <= 3; e++) [1, 2, 5].forEach(function (m) { var L = m * Math.pow(10, e); if (L * s <= maxPx && L > best) best = L; });
  return best;
}
function drawScale() {
  var L = niceLen(Math.min(190, area.w * 0.4)), px = L * sc(), x = area.cx - px / 2, y = 30;
  ctx.strokeStyle = 'rgba(232,238,244,.85)'; ctx.lineWidth = 2; ctx.beginPath();
  ctx.moveTo(x, y + 6); ctx.lineTo(x, y); ctx.lineTo(x + px, y); ctx.lineTo(x + px, y + 6); ctx.stroke();
  label(fmtLen(L), area.cx, y - 8, 'center', 'rgba(232,238,244,.95)', 12.5);
}
function label(t, x, y, align, col, size) {
  ctx.font = '700 ' + (size || 12) + 'px ' + FONT; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(5,8,12,.85)'; ctx.lineJoin = 'round'; ctx.strokeText(t, x, y);
  ctx.fillStyle = col || '#e8eef4'; ctx.fillText(t, x, y);
}

/* ---------- rings, link, radios ---------- */
function marginColor(m) { return m >= 10 ? [80, 220, 110] : m >= 0 ? [240, 170, 60] : [230, 70, 70]; }
function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

function drawRings(t) {
  var s = sc(), ox = X(0), oy = Y(0);
  var rm = ringR.max * s, rg = ringR.good * s;
  if (rm > 1.5 && rm < 1e5) {
    ctx.beginPath(); ctx.arc(ox, oy, rm, 0, 6.2832); ctx.fillStyle = 'rgba(240,170,60,0.05)'; ctx.fill();
    ctx.setLineDash([6, 6]); ctx.strokeStyle = 'rgba(240,170,60,0.6)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
  }
  if (rg > 1.5 && rg < 1e5) {
    ctx.beginPath(); ctx.arc(ox, oy, rg, 0, 6.2832); ctx.fillStyle = 'rgba(80,220,110,0.07)'; ctx.fill();
    ctx.strokeStyle = 'rgba(80,220,110,0.7)'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  /* ring labels, placed where the ring is on screen */
  [[rg, ringR.good, 'rgb(120,235,150)', ' solid', -62], [rm, ringR.max, 'rgb(250,190,90)', ' max', -28]].forEach(function (r) {
    if (r[0] < 40) return;
    var tries = [r[4], -90, -45, 0, 45, 90, 180, -135];
    for (var q = 0; q < tries.length; q++) {
      var ang = tries[q] * Math.PI / 180, lx = ox + Math.cos(ang) * r[0], ly = oy + Math.sin(ang) * r[0];
      if (lx > area.cx - area.w / 2 + 50 && lx < area.cx + area.w / 2 - 50 && ly > 64 && ly < area.cy + area.h / 2 - 24) {
        label(fmtLen(+r[1].toPrecision(2)) + r[3], lx, ly, 'center', r[2], 12); return;
      }
    }
  });
}
function drawLink(t) {
  var m = metrics(), col = marginColor(m.margin), a = [X(0), Y(0)], b = [X(rem.x), Y(rem.y)];
  ctx.lineWidth = 2; ctx.strokeStyle = rgba(col, 0.85); ctx.shadowColor = rgba(col, 0.6); ctx.shadowBlur = 8;
  if (m.margin < 0) ctx.setLineDash([7, 7]);
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  ctx.setLineDash([]); ctx.shadowBlur = 0;
  /* distance pill at the middle of the link */
  if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 110) return;
  var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, txt = fmtKm(m.d);
  ctx.font = '700 13px ' + FONT; var w = ctx.measureText(txt).width + 18;
  ctx.fillStyle = 'rgba(8,12,18,.88)'; ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = 1.5;
  roundRect(mx - w / 2, my - 12, w, 24, 12); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, mx, my + 0.5);
}
function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function drawPackets(dt) {
  var ax = X(0), ay = Y(0), bx = X(rem.x), by = Y(rem.y), i;
  for (i = packets.length - 1; i >= 0; i--) {
    var p = packets[i]; p.t += dt;
    var f = Math.min(p.t / p.dur, 1), end = p.ok ? 1 : p.stop, fe = Math.min(f, end);
    var px = ax + (bx - ax) * fe, py = ay + (by - ay) * fe;
    if (p.t < p.dur) {
      var g = ctx.createRadialGradient(px, py, 0, px, py, 14); g.addColorStop(0, 'rgba(160,215,255,.95)'); g.addColorStop(1, 'rgba(90,160,220,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, 14, 0, 6.2832); ctx.fill();
    }
    if (f >= end && !p.fin) {
      p.fin = true; hist.push(p.ok); if (hist.length > 14) hist.shift(); renderDots();
      pulses.push({ t: 0, x: p.ok ? bx : px, y: p.ok ? by : py, ok: p.ok, wx: p.ok ? rem.x : null });
    }
    if (p.t > p.dur + 0.1) packets.splice(i, 1);
  }
  for (i = pulses.length - 1; i >= 0; i--) {
    var u = pulses[i]; u.t += dt; var k = u.t / 0.9;
    if (k >= 1) { pulses.splice(i, 1); continue; }
    var ux = u.wx !== null ? X(rem.x) : u.x, uy = u.wx !== null ? Y(rem.y) : u.y;
    if (u.ok) { ctx.strokeStyle = 'rgba(80,220,110,' + (0.8 * (1 - k)).toFixed(3) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ux, uy, 8 + 26 * k, 0, 6.2832); ctx.stroke(); }
    else {
      ctx.strokeStyle = 'rgba(230,70,70,' + (1 - k).toFixed(3) + ')'; ctx.lineWidth = 2.5; var r = 6; ctx.beginPath();
      ctx.moveTo(ux - r, uy - r); ctx.lineTo(ux + r, uy + r); ctx.moveTo(ux + r, uy - r); ctx.lineTo(ux - r, uy + r); ctx.stroke();
    }
  }
}
function sendPacket() {
  if (packets.length > 2) return;
  var m = metrics(), ms = airTotal(S.sf, S.chars) / 1000;
  var ok = m.margin + gauss() * SIGMA >= 0;
  packets.push({ t: 0, dur: clamp(ms, 0.5, 2.2), ok: ok, stop: 0.3 + Math.random() * 0.55 });
}
function drawRadios(t) {
  var ax = X(0), ay = Y(0), bx = X(rem.x), by = Y(rem.y), pulse = RM ? 0 : (Math.sin(t * 2.2) * 0.5 + 0.5);
  /* yours */
  ctx.beginPath(); ctx.arc(ax, ay, 15 + pulse * 5, 0, 6.2832); ctx.fillStyle = 'rgba(90,160,220,' + (0.16 - pulse * 0.08).toFixed(3) + ')'; ctx.fill();
  ctx.beginPath(); ctx.arc(ax, ay, 8, 0, 6.2832); ctx.fillStyle = '#5aa0dc'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#e8eef4'; ctx.stroke();
  label('Your radio', ax, ay - 24, 'center', '#cfe6fb', 13);
  /* other: draggable */
  ctx.beginPath(); ctx.arc(bx, by, drag ? 17 : 14, 0, 6.2832); ctx.fillStyle = 'rgba(232,238,244,' + (drag ? 0.22 : 0.1) + ')'; ctx.fill();
  ctx.beginPath(); ctx.arc(bx, by, 8, 0, 6.2832); ctx.fillStyle = '#0a0f15'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#e8eef4'; ctx.stroke();
  label('Other radio', bx, by - 25, 'center', '#e8eef4', 13);
  if (dragHint) label('drag me', bx, by + 26, 'center', 'rgba(150,215,255,' + (0.55 + pulse * 0.4).toFixed(2) + ')', 12);
}

/* ---------- frame ---------- */
var frameMs = 0, last = 0, raf = 0, running = false, onScreen = true, tClock = 0;
function frame(ts) {
  raf = 0; if (!running) return;
  var tf = performance.now(), dt = last ? Math.min(0.1, (ts - last) / 1000) : 0.016; last = ts; tClock += dt;
  stepCam(dt);
  autoT -= dt; if (autoT <= 0) { autoT = 2.8; sendPacket(); }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  var bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0a1017'); bg.addColorStop(1, '#070b10'); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  drawGrid();
  for (var i = 0; i < ENVS.length; i++) if (envA[i] > 0.01) drawTerrain(i, envA[i]);
  drawRings(tClock);
  drawLink(tClock);
  drawPackets(dt);
  drawRadios(tClock);
  drawScale();
  frameMs += (performance.now() - tf - frameMs) * 0.05;
  raf = requestAnimationFrame(frame);
}
function start() { if (running || !onScreen || document.hidden) return; running = true; last = 0; raf = requestAnimationFrame(frame); }
function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });
if ('IntersectionObserver' in window) new IntersectionObserver(function (e) { onScreen = e[0].isIntersecting; if (onScreen) start(); else stop(); }, { threshold: 0.01 }).observe(root);

/* ---------- UI ---------- */
function setSeg(id, v) { var b = $(id).querySelectorAll('button'); for (var i = 0; i < b.length; i++) b[i].setAttribute('aria-pressed', i === v ? 'true' : 'false'); }
function renderDots() { var h = hist.map(function (ok) { return '<i class="' + (ok ? '' : 'x') + '"></i>'; }).join(''); $('lr-dots').innerHTML = h; }
function refresh() {
  var m = metrics(), g = rangeFor(10), mx = rangeFor(0), b = battery();
  var lab = m.margin >= 10 ? ['Solid', 'rgb(80,220,110)'] : m.margin >= 3 ? ['Weak', 'rgb(240,170,60)'] : m.margin >= 0 ? ['Barely', 'rgb(240,170,60)'] : ['No link', 'rgb(230,70,70)'];
  $('lr-mg').textContent = sgn(m.margin) + ' dB'; $('lr-mg').style.color = lab[1];
  var chip = $('lr-chip'); chip.textContent = lab[0]; chip.style.color = lab[1];
  $('lr-mgs').textContent = Math.round(m.rssi) + ' dBm arrives, ' + Math.round(m.need) + ' dBm is the limit';
  $('lr-rg').textContent = fmtLen(+g.toPrecision(2)) + ' / ' + fmtLen(+mx.toPrecision(2));
  $('lr-pr').textContent = (m.p >= 0.995 ? '>99%' : m.p < 0.005 ? '<1%' : Math.round(m.p * 100) + '%');
  $('lr-at').textContent = fmtAir(airTotal(S.sf, S.chars));
  var n = packetCount(S.chars); $('lr-pk').textContent = S.chars + ' characters, ' + n + (n > 1 ? ' packets' : ' packet');
  $('lr-bt').textContent = fmtHours(b.hours);
  $('lr-bs').textContent = S.perHr + ' msgs/hr, screen ' + SCREENS[S.screen].n.toLowerCase() + ', ' + Math.round(b.avg) + ' mA';
  $('lr-dv').textContent = fmtKm(m.d);
  $('lr-pwv').textContent = S.pwr + ' dBm'; $('lr-chv').textContent = S.chars + ' chars'; $('lr-phv').textContent = S.perHr;
  setSeg('lr-theme', S.day); cv.classList.toggle('day', !!S.day); setSeg('lr-sf', S.sf - 7); setSeg('lr-env', S.env); setSeg('lr-band', S.band); setSeg('lr-scr', S.screen);
  $('lr-pw').value = S.pwr; $('lr-ch').value = S.chars; $('lr-ph').value = S.perHr;
  if (document.activeElement !== $('lr-dist')) $('lr-dist').value = Math.round(Math.log(m.d / D_MIN) / Math.log(D_MAX / D_MIN) * 1000);
}
function leaveFit() { if (cam.mode === 'range') { cam.mode = 'follow'; $('lr-fit').setAttribute('aria-pressed', 'false'); $('lr-fit').textContent = 'Fit range'; } }
function wireSeg(id, fn) { $(id).addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; fn(+b.getAttribute('data-v')); refresh(); }); }
wireSeg('lr-theme', function (v) { S.day = v; try { localStorage.setItem('lr-day', v); } catch (x) {} });
wireSeg('lr-sf', function (v) { S.sf = 7 + v; });
wireSeg('lr-env', function (v) { S.env = v; });
wireSeg('lr-band', function (v) { S.band = v; });
wireSeg('lr-scr', function (v) { S.screen = v; });
$('lr-pw').addEventListener('input', function () { S.pwr = +this.value; refresh(); });
$('lr-ch').addEventListener('input', function () { S.chars = +this.value; refresh(); });
$('lr-ph').addEventListener('input', function () { S.perHr = +this.value; refresh(); });
$('lr-dist').addEventListener('input', function () { leaveFit(); dragHint = false; setDist(D_MIN * Math.pow(D_MAX / D_MIN, +this.value / 1000)); refresh(); });
$('lr-send').addEventListener('click', function () { autoT = 2.8; sendPacket(); });
$('lr-fit').addEventListener('click', function () {
  var on = cam.mode !== 'range'; cam.mode = on ? 'range' : 'follow';
  this.setAttribute('aria-pressed', on ? 'true' : 'false'); this.textContent = on ? 'Follow radios' : 'Fit range';
});

/* dragging the other radio */
function hitRemote(px, py) { return Math.hypot(px - X(rem.x), py - Y(rem.y)) < 30; }
function moveTo(px, py) {
  var wx = WX(px), wy = WY(py), d = Math.hypot(wx, wy) || 0.0001, dd = clamp(d, D_MIN, D_MAX);
  rem.x = wx / d * dd; rem.y = wy / d * dd; refresh();
}
function local(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
cv.addEventListener('pointerdown', function (e) {
  if (e.pointerType === 'touch') return;
  var p = local(e); if (!hitRemote(p[0], p[1])) return;
  drag = true; dragHint = false; lastPtr = p; leaveFit(); cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing'; e.preventDefault();
});
cv.addEventListener('pointermove', function (e) {
  if (e.pointerType === 'touch') return;
  var p = local(e);
  if (drag) { lastPtr = p; moveTo(p[0], p[1]); } else cv.style.cursor = hitRemote(p[0], p[1]) ? 'grab' : '';
});
function endDrag(e) { if (!drag) return; drag = false; cv.style.cursor = ''; try { cv.releasePointerCapture(e.pointerId); } catch (x) {} }
cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
/* touch: only take over the gesture when it starts on the radio, so the page still scrolls */
cv.addEventListener('touchstart', function (e) {
  var t = e.touches[0], r = cv.getBoundingClientRect();
  if (hitRemote(t.clientX - r.left, t.clientY - r.top)) { drag = true; dragHint = false; lastPtr = [t.clientX - r.left, t.clientY - r.top]; leaveFit(); e.preventDefault(); }
}, { passive: false });
cv.addEventListener('touchmove', function (e) {
  if (!drag) return; var t = e.touches[0], r = cv.getBoundingClientRect(); lastPtr = [t.clientX - r.left, t.clientY - r.top]; moveTo(lastPtr[0], lastPtr[1]); e.preventDefault();
}, { passive: false });
cv.addEventListener('touchend', function () { drag = false; }); cv.addEventListener('touchcancel', function () { drag = false; });

/* remembered map theme */
try { if (localStorage.getItem('lr-day') === '1') S.day = 1; } catch (x) {}

/* ---------- start ---------- */
layout();
if ('ResizeObserver' in window) new ResizeObserver(function () { layout(); }).observe(root.querySelector('.lr-map')); else window.addEventListener('resize', layout);
window.addEventListener('resize', layout);
var t0 = targetCam();
cam.cx = t0.cx; cam.cy = t0.cy; cam.ls = RM ? t0.ls : t0.ls - 1.1;      /* gentle zoom-in on load */
ringR.lg = Math.log(rangeFor(10)); ringR.lm = Math.log(rangeFor(0)); ringR.good = Math.exp(ringR.lg); ringR.max = Math.exp(ringR.lm);
refresh(); renderDots(); start();

/* hooks for testing */
window.__lr = {
  state: S, rem: rem, cam: cam, setDist: function (d) { leaveFit(); setDist(d); refresh(); }, refresh: refresh,
  metrics: metrics, range: rangeFor, battery: battery, airtime: airtime, sc: sc, area: function () { return area; },
  send: sendPacket, ringR: ringR, frameMs: function () { return frameMs; }
};
})();
