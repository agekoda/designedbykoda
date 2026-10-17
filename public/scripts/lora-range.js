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
var S = { sf: 10, pwr: 22, env: 0, band: 0, chars: 17, perHr: 12, screen: 2 };
var rem = { x: 1.2, y: -0.12 };         /* other radio, km from yours (y is down) */
var cam = { cx: 0.6, cy: -0.06, ls: Math.log(300), mode: 'follow' };
var ringR = { good: 1, max: 1, lg: 0, lm: 0 };        /* displayed (animated) radii in km */
var envA = [1, 0, 0, 0];
var drag = false, dragHint = true;
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
function layerAlpha(px) { return sstep(22, 40, px) * (1 - sstep(150, 260, px)); }

function drawTerrain(envIdx, aEnv) {
  var s = sc(), x0 = WX(0), x1 = WX(W), y0 = WY(0), y1 = WY(H);
  for (var k = 0; k < LV; k++) {
    var c = C0 * Math.pow(3, k), px = c * s, a = layerAlpha(px) * aEnv;
    if (a < 0.012) continue;
    var i0 = Math.floor(x0 / c) - 1, i1 = Math.ceil(x1 / c) + 1, j0 = Math.floor(y0 / c) - 1, j1 = Math.ceil(y1 / c) + 1;
    ctx.globalAlpha = a;
    if (envIdx === 0) terrainOpen(i0, i1, j0, j1, c, k, s);
    else if (envIdx === 1) terrainForest(i0, i1, j0, j1, c, k, s);
    else if (envIdx === 2) terrainSuburb(i0, i1, j0, j1, c, k, s);
    else terrainUrban(i0, i1, j0, j1, c, k, s);
  }
  ctx.globalAlpha = 1;
}
function terrainOpen(i0, i1, j0, j1, c, k, s) {
  var i, j, h, b0 = new Path2D(), b1 = new Path2D(), dots = new Path2D(), rings = new Path2D();
  for (i = i0; i <= i1; i++) for (j = j0; j <= j1; j++) {
    h = hash(i, j, k, 1);
    if (h < 0.34) { var f = (hash(i, j, k, 2) < 0.5 ? b0 : b1); f.rect(X(i * c + c * 0.04), Y(j * c + c * 0.04), c * 0.92 * s, c * 0.92 * s); }
    var d = hash(i, j, k, 3);
    if (d < 0.2) { var x = X((i + hash(i, j, k, 4)) * c), y = Y((j + hash(i, j, k, 5)) * c), r = c * s * 0.07; dots.moveTo(x + r, y); dots.arc(x, y, r, 0, 6.2832); }
    else if (d > 0.965) { var x2 = X((i + 0.5) * c), y2 = Y((j + 0.5) * c), r2 = c * s * 0.28; rings.moveTo(x2 + r2, y2); rings.arc(x2, y2, r2, 0, 6.2832); }
  }
  ctx.fillStyle = 'rgba(130,185,150,0.05)'; ctx.fill(b0);
  ctx.fillStyle = 'rgba(150,170,110,0.05)'; ctx.fill(b1);
  ctx.strokeStyle = 'rgba(160,200,170,0.10)'; ctx.lineWidth = 1; ctx.stroke(b0); ctx.stroke(b1);
  ctx.fillStyle = 'rgba(210,230,210,0.22)'; ctx.fill(dots);
  ctx.strokeStyle = 'rgba(160,210,170,0.22)'; ctx.stroke(rings);
}
function terrainForest(i0, i1, j0, j1, c, k, s) {
  var i, j, p0 = new Path2D(), p1 = new Path2D(), p2 = new Path2D();
  for (i = i0; i <= i1; i++) for (j = j0; j <= j1; j++) {
    if (vnoise(i / 7, j / 7, k) > 0.8) continue;        /* clearings */
    var h1 = hash(i, j, k, 1), x = X((i + 0.5 + (h1 - 0.5) * 0.7) * c), y = Y((j + 0.5 + (hash(i, j, k, 2) - 0.5) * 0.7) * c);
    var h3 = hash(i, j, k, 3), r = c * s * (0.34 + 0.16 * h3);
    var p = h3 < 0.33 ? p0 : h3 < 0.66 ? p1 : p2;
    p.moveTo(x + r, y); p.arc(x, y, r, 0, 6.2832);
  }
  ctx.fillStyle = 'rgba(54,130,96,0.16)'; ctx.fill(p0);
  ctx.fillStyle = 'rgba(70,150,108,0.13)'; ctx.fill(p1);
  ctx.fillStyle = 'rgba(46,112,92,0.18)'; ctx.fill(p2);
  ctx.strokeStyle = 'rgba(140,215,170,0.30)'; ctx.lineWidth = 1; ctx.stroke(p0); ctx.stroke(p1); ctx.stroke(p2);
}
function terrainSuburb(i0, i1, j0, j1, c, k, s) {
  var i, j, fills = new Path2D(), parks = new Path2D(), road = new Path2D();
  for (i = i0; i <= i1; i++) if (i % 3 === 0) { road.moveTo(X(i * c), Y(j0 * c)); road.lineTo(X(i * c), Y((j1 + 1) * c)); }
  for (j = j0; j <= j1; j++) if (j % 3 === 0) { road.moveTo(X(i0 * c), Y(j * c)); road.lineTo(X((i1 + 1) * c), Y(j * c)); }
  for (i = i0; i <= i1; i++) for (j = j0; j <= j1; j++) {
    var hh = hash(i, j, k, 1);
    if (hh < 0.12) { var x = X((i + 0.5) * c), y = Y((j + 0.5) * c), r = c * s * 0.3; parks.moveTo(x + r, y); parks.arc(x, y, r, 0, 6.2832); continue; }
    var w = c * (0.36 + 0.2 * hash(i, j, k, 2)), hgt = c * (0.3 + 0.2 * hash(i, j, k, 3));
    fills.rect(X((i + 0.5) * c - w / 2 + (hash(i, j, k, 4) - 0.5) * c * 0.1), Y((j + 0.5) * c - hgt / 2), w * s, hgt * s);
  }
  ctx.strokeStyle = 'rgba(200,215,230,0.07)'; ctx.lineWidth = Math.max(1, c * s * 0.1); ctx.stroke(road);
  ctx.fillStyle = 'rgba(150,170,195,0.10)'; ctx.fill(fills);
  ctx.strokeStyle = 'rgba(190,205,225,0.28)'; ctx.lineWidth = 1; ctx.stroke(fills);
  ctx.strokeStyle = 'rgba(120,200,150,0.22)'; ctx.stroke(parks);
}
function terrainUrban(i0, i1, j0, j1, c, k, s) {
  var i, j, b0 = new Path2D(), b1 = new Path2D(), b2 = new Path2D(), inner = new Path2D();
  for (i = i0; i <= i1; i++) for (j = j0; j <= j1; j++) {
    var h = hash(i, j, k, 1);
    if (h < 0.08) continue;                                      /* plazas */
    var q = hash(i, j, k, 2), p = q < 0.33 ? b0 : q < 0.66 ? b1 : b2;
    var sz = c * 0.86 * s, x = X(i * c + c * 0.07), y = Y(j * c + c * 0.07);
    p.rect(x, y, sz, sz);
    if (q > 0.5) inner.rect(x + sz * 0.22, y + sz * 0.22, sz * 0.56, sz * 0.56);
  }
  ctx.fillStyle = 'rgba(110,140,185,0.07)'; ctx.fill(b0);
  ctx.fillStyle = 'rgba(120,150,195,0.12)'; ctx.fill(b1);
  ctx.fillStyle = 'rgba(135,165,210,0.18)'; ctx.fill(b2);
  ctx.strokeStyle = 'rgba(170,195,235,0.30)'; ctx.lineWidth = 1; ctx.stroke(b0); ctx.stroke(b1); ctx.stroke(b2);
  ctx.strokeStyle = 'rgba(170,195,235,0.16)'; ctx.stroke(inner);
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
  setSeg('lr-sf', S.sf - 7); setSeg('lr-env', S.env); setSeg('lr-band', S.band); setSeg('lr-scr', S.screen);
  $('lr-pw').value = S.pwr; $('lr-ch').value = S.chars; $('lr-ph').value = S.perHr;
  if (document.activeElement !== $('lr-dist')) $('lr-dist').value = Math.round(Math.log(m.d / D_MIN) / Math.log(D_MAX / D_MIN) * 1000);
}
function leaveFit() { if (cam.mode === 'range') { cam.mode = 'follow'; $('lr-fit').setAttribute('aria-pressed', 'false'); $('lr-fit').textContent = 'Fit range'; } }
function wireSeg(id, fn) { $(id).addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; fn(+b.getAttribute('data-v')); refresh(); }); }
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
  drag = true; dragHint = false; leaveFit(); cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing'; e.preventDefault();
});
cv.addEventListener('pointermove', function (e) {
  if (e.pointerType === 'touch') return;
  var p = local(e);
  if (drag) moveTo(p[0], p[1]); else cv.style.cursor = hitRemote(p[0], p[1]) ? 'grab' : '';
});
function endDrag(e) { if (!drag) return; drag = false; cv.style.cursor = ''; try { cv.releasePointerCapture(e.pointerId); } catch (x) {} }
cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
/* touch: only take over the gesture when it starts on the radio, so the page still scrolls */
cv.addEventListener('touchstart', function (e) {
  var t = e.touches[0], r = cv.getBoundingClientRect();
  if (hitRemote(t.clientX - r.left, t.clientY - r.top)) { drag = true; dragHint = false; leaveFit(); e.preventDefault(); }
}, { passive: false });
cv.addEventListener('touchmove', function (e) {
  if (!drag) return; var t = e.touches[0], r = cv.getBoundingClientRect(); moveTo(t.clientX - r.left, t.clientY - r.top); e.preventDefault();
}, { passive: false });
cv.addEventListener('touchend', function () { drag = false; }); cv.addEventListener('touchcancel', function () { drag = false; });

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
