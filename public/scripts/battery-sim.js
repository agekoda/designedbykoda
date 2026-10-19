/* Battery Profiler simulator. Self-contained: builds its own markup + CSS inside #bp-sim.
   Firmware screens, buttons, menu and test sequence mirror the real firmware; the cell is a small physical model.
   Optional: data-board="/path/board.svg" swaps in real board art (needs ids: tft-screen, btn-start/stop/up/select/down,
   screw-terminal, usbc, psu-terminal). */
(function () {
'use strict';
var root = document.getElementById('bp-sim');
if (!root || root.getAttribute('data-ready')) return;
root.setAttribute('data-ready', '1');
var RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
var FONT = [
0,0,0,0,0,62,91,79,91,62,62,107,79,107,62,28,62,124,62,28,24,60,126,60,24,28,87,125,87,28,28,94,127,94,28,0,24,60,24,0,255,231,195,231,255,0,24,36,24,0,255,231,219,231,255,48,72,58,6,14,38,41,121,41,38,64,127,5,5,7,64,127,5,37,63,90,60,231,60,90,127,62,28,28,8,8,28,28,62,127,20,34,127,34,20,95,95,0,95,95,6,9,127,1,127,0,102,137,149,106,96,96,96,96,96,148,162,255,162,148,8,4,126,4,8,16,32,126,32,16,8,8,42,28,8,8,28,42,8,8,30,16,16,16,16,12,30,12,30,12,48,56,62,56,48,6,14,62,14,6,0,0,0,0,0,0,0,95,0,0,0,7,0,7,0,20,127,20,127,20,36,42,127,42,18,35,19,8,100,98,54,73,86,32,80,0,8,7,3,0,0,28,34,65,0,0,65,34,28,0,42,28,127,28,42,8,8,62,8,8,0,128,112,48,0,8,8,8,8,8,0,0,96,96,0,32,16,8,4,2,62,81,73,69,62,0,66,127,64,0,114,73,73,73,70,33,65,73,77,51,24,20,18,127,16,39,69,69,69,57,60,74,73,73,49,65,33,17,9,7,54,73,73,73,54,70,73,73,41,30,0,0,20,0,0,0,64,52,0,0,0,8,20,34,65,20,20,20,20,20,0,65,34,20,8,2,1,89,9,6,62,65,93,89,78,124,18,17,18,124,127,73,73,73,54,62,65,65,65,34,127,65,65,65,62,127,73,73,73,65,127,9,9,9,1,62,65,65,81,115,127,8,8,8,127,0,65,127,65,0,32,64,65,63,1,127,8,20,34,65,127,64,64,64,64,127,2,28,2,127,127,4,8,16,127,62,65,65,65,62,127,9,9,9,6,62,65,81,33,94,127,9,25,41,70,38,73,73,73,50,3,1,127,1,3,63,64,64,64,63,31,32,64,32,31,63,64,56,64,63,99,20,8,20,99,3,4,120,4,3,97,89,73,77,67,0,127,65,65,65,2,4,8,16,32,0,65,65,65,127,4,2,1,2,4,64,64,64,64,64,0,3,7,8,0,32,84,84,120,64,127,40,68,68,56,56,68,68,68,40,56,68,68,40,127,56,84,84,84,24,0,8,126,9,2,24,164,164,156,120,127,8,4,4,120,0,68,125,64,0,32,64,64,61,0,127,16,40,68,0,0,65,127,64,0,124,4,120,4,120,124,8,4,4,120,56,68,68,68,56,252,24,36,36,24,24,36,36,24,252,124,8,4,4,8,72,84,84,84,36,4,4,63,68,36,60,64,64,32,124,28,32,64,32,28,60,64,48,64,60,68,40,16,40,68,76,144,144,144,124,68,100,84,76,68,0,8,54,65,0,0,0,119,0,0,0,65,54,8,0,2,1,2,4,2,60,38,35,38,60,30,161,161,97,18,58,64,64,32,122,56,84,84,85,89,33,85,85,121,65,34,84,84,120,66,33,85,84,120,64,32,84,85,121,64,12,30,82,114,18,57,85,85,85,89,57,84,84,84,89,57,85,84,84,88,0,0,69,124,65,0,2,69,125,66,0,1,69,124,64,125,18,17,18,125,240,40,37,40,240,124,84,85,69,0,32,84,84,124,84,124,10,9,127,73,50,73,73,73,50,58,68,68,68,58,50,74,72,72,48,58,65,65,33,122,58,66,64,32,120,0,157,160,160,125,61,66,66,66,61,61,64,64,64,61,60,36,255,36,36,72,126,73,67,102,43,47,252,47,43,255,9,41,246,32,192,136,126,9,3,32,84,84,121,65,0,0,68,125,65,48,72,72,74,50,56,64,64,34,122,0,122,10,10,114,125,13,25,49,125,38,41,41,47,40,38,41,41,41,38,48,72,77,64,32,56,8,8,8,8,8,8,8,8,56,47,16,200,172,186,47,16,40,52,250,0,0,123,0,0,8,20,42,20,34,34,20,42,20,8,85,0,85,0,85,170,85,170,85,170,255,85,255,85,255,0,0,0,255,0,16,16,16,255,0,20,20,20,255,0,16,16,255,0,255,16,16,240,16,240,20,20,20,252,0,20,20,247,0,255,0,0,255,0,255,20,20,244,4,252,20,20,23,16,31,16,16,31,16,31,20,20,20,31,0,16,16,16,240,0,0,0,0,31,16,16,16,16,31,16,16,16,16,240,16,0,0,0,255,16,16,16,16,16,16,16,16,16,255,16,0,0,0,255,20,0,0,255,0,255,0,0,31,16,23,0,0,252,4,244,20,20,23,16,23,20,20,244,4,244,0,0,255,0,247,20,20,20,20,20,20,20,247,0,247,20,20,20,23,20,16,16,31,16,31,20,20,20,244,20,16,16,240,16,240,0,0,31,16,31,0,0,0,31,20,0,0,0,252,20,0,0,240,16,240,16,16,255,16,255,20,20,20,255,20,16,16,16,31,0,0,0,0,240,16,255,255,255,255,255,240,240,240,240,240,255,255,255,0,0,0,0,0,255,255,15,15,15,15,15,56,68,68,56,68,252,74,74,74,52,126,2,2,6,6,2,126,2,126,2,99,85,73,65,99,56,68,68,60,4,64,126,32,30,32,6,2,126,2,2,153,165,231,165,153,28,42,73,42,28,76,114,1,114,76,48,74,77,77,48,48,72,120,72,48,188,98,90,70,61,62,73,73,73,0,126,1,1,1,126,42,42,42,42,42,68,68,95,68,68,64,81,74,68,64,64,68,74,81,64,0,0,255,1,3,224,128,255,0,0,8,8,107,107,8,54,18,54,36,54,6,15,9,15,6,0,0,24,24,0,0,0,16,16,0,48,64,255,1,1,0,31,1,1,30,0,25,29,23,18,0,60,60,60,60,0,0,0,0,0];

/* ---------- display (320x240 ST7789, Adafruit GFX 5x7 font) ---------- */
var C = { BG: '#000', TEXT: '#fff', DIM: '#848484', ACC: '#00ffff', GOOD: '#00ff00', WARN: '#ffa600', BAD: '#ff0000', EDIT: '#ffff00', BAR: '#212021', ROW: '#424142' };
var tctx = null;
function rect(x, y, w, h, c) { tctx.fillStyle = c; tctx.fillRect(x, y, w, h); }
function text(x, y, s, size, c) {
  tctx.fillStyle = c;
  for (var k = 0; k < s.length; k++) {
    var ch = s.charCodeAt(k) & 255;
    for (var i = 0; i < 5; i++) {
      var b = FONT[ch * 5 + i];
      for (var j = 0; j < 8; j++) if ((b >> j) & 1) tctx.fillRect(x + (k * 6 + i) * size, y + j * size, size, size);
    }
  }
}
function header(t, c) { rect(0, 0, 320, 28, C.BAR); text(8, 6, t, 2, c); }
function line(y, l, v, c) { text(10, y, l, 2, C.DIM); text(170, y, v, 2, c); }
function footer(m) { rect(0, 218, 320, 22, C.BAR); text(8, 225, m, 1, C.DIM); }
function fV(v) { return v.toFixed(3) + ' V'; }
function fI(i) { return Math.abs(i * 1000).toFixed(0) + ' mA'; }
function fT(t) { return t.toFixed(1) + ' C'; }
function p2(n) { return (n < 10 ? '0' : '') + n; }

/* ---------- cells ---------- */
var PRESETS = [
  { id: 'genuine', name: 'Genuine 18650', tag: '2000 mAh', adv: 2000, q: 1960, r0: 0.045, soc: 0.55, eta: 0.985, shape: 'cyl', note: 'Branded cell, healthy' },
  { id: 'cheap', name: 'Cheap online pouch', tag: '3000 mAh', adv: 3000, q: 1480, r0: 0.22, soc: 0.5, eta: 0.96, shape: 'pouch', note: 'Too good to be true' },
  { id: 'worn', name: 'Worn laptop cell', tag: '2600 mAh', adv: 2600, q: 1650, r0: 0.12, soc: 0.35, eta: 0.97, shape: 'pouchL', note: 'Recycled, tired' },
  { id: 'fake', name: 'Counterfeit 14500', tag: '9900 mAh', adv: 9900, q: 560, r0: 0.35, soc: 0.45, eta: 0.94, shape: 'short', note: 'AA-sized cell with an absurd label' },
  { id: 'dead', name: 'Dead 18650', tag: '1.6 V', adv: 0, q: 100, r0: 0.5, soc: 0, eta: 0.9, dead: true, shape: 'cyl', note: 'Over-discharged' }
];
var OCV = [[-0.1, 2.0], [0, 3.0], [0.05, 3.3], [0.1, 3.45], [0.2, 3.6], [0.3, 3.7], [0.45, 3.8], [0.6, 3.9], [0.75, 4.0], [1, 4.2]];
function ocv(s) {
  if (s <= OCV[0][0]) return OCV[0][1];
  for (var i = 1; i < OCV.length; i++) if (s <= OCV[i][0]) {
    var a = OCV[i - 1], b = OCV[i];
    return a[1] + (b[1] - a[1]) * (s - a[0]) / (b[0] - a[0]);
  }
  return 4.2 + (s - 1) * 0.5;
}
function mkCell(p) { return { p: p, soc: p.soc, vp: 0, tb: 24 }; }
var cells = {};
function resetCells() { PRESETS.forEach(function (p) { cells[p.id] = mkCell(p); }); }
resetCells();
function rp(c) { return 0.6 * c.p.r0; }

/* ---------- world + firmware state ---------- */
var T = 0;                       // simulated seconds
var batt = null;                 // connected cell (or null)
var pw = { type: 'none', v: 5 }; // none | usb | psu
var speed = 1800;
var th = 24;                     // heatsink temperature
var csvRows = [];
var chart = [];
var lastSample = -1e9;
var results = null;
var sens = { v: 0, i: 0, tb: 24, present: false, rail: 0 };
var powered = false;
var bootT = 0;
var DEF = { chg: 500, dis: 500, cut: 3.0 };
var F;
function newF() { return { mode: 'HOME', cursor: 0, editing: false, set: { chg: DEF.chg, dis: DEF.dis, cut: DEF.cut }, phase: null, phaseT: 0, acc: 0, chargeIn: 0, dischOut: 0, cv: false, t0: 0, msg: '' }; }
F = newF();
var ORDER = ['D1', 'R1', 'CH', 'R2', 'D2', 'R3', 'ST'];
var TITLES = { D1: 'DISCHARGE 1/2', R1: 'RESTING', CH: 'CHARGING', R2: 'RESTING', D2: 'DISCHARGE 2/2', R3: 'RESTING', ST: 'STORAGE CHARGE' };

function railV() { return pw.type === 'usb' ? 5 : pw.type === 'psu' ? pw.v : 0; }
function srcCap(rail, vbat) { // amps the buck charger can push into the cell from this source
  var lim = pw.type === 'usb' ? 1.0 : 2.0;
  return Math.min(1.98, rail * lim * 0.9 / Math.max(vbat, 3));
}

function fault(msg) { F.mode = 'FAULT'; F.msg = msg; F.phase = null; F.cv = false; return true; }
function nextPhase() {
  var i = ORDER.indexOf(F.phase) + 1;
  if (i >= ORDER.length) return finish();
  startPhase(ORDER[i]);
}
function startPhase(p) {
  F.phase = p; F.phaseT = 0; F.cv = false;
  if (p === 'D1' || p === 'D2' || p === 'CH' || p === 'ST') F.acc = 0; // sim resets every active phase for a cleaner readout
}
var est = false;
function finish() {
  F.mode = 'DONE'; F.phase = null;
  if (est) return true;
  var eff = F.chargeIn < 1 ? 0 : F.dischOut / F.chargeIn * 100;
  var dur = T - F.t0;
  F.done = { cap: F.dischOut, chg: F.chargeIn, eff: eff, dur: dur, v: sens.v };
  var up = Math.round((T - bootT) * 1000 + 8000);
  if (!csvRows.length) csvRows.push('ms,chg_set_mA,dis_set_mA,cutoff_V,charge_in_mAh,discharge_mAh');
  csvRows.push(up + ',' + F.set.chg + ',' + F.set.dis + ',' + F.set.cut.toFixed(2) + ',' + F.chargeIn.toFixed(1) + ',' + F.dischOut.toFixed(1));
  results = { adv: batt && batt.p.adv, cap: F.dischOut, chg: F.chargeIn, eff: eff, dur: dur, name: batt ? batt.p.name : '' };
  samplePoint(true);
  return true;
}
function samplePoint(force) {
  if (est) return;
  var t = T - F.t0;
  if (!force && T - lastSample < 30) return;
  lastSample = T;
  chart.push({ t: t, v: sens.v, i: sens.i, p: F.phase || 'X' });
}
function tryStart() {
  if (!sens.present || sens.rail < 3.6) return fault('Connect input power');
  if (sens.v < 2.0) return fault('No battery detected');
  if (sens.v > 4.35) return fault('Battery voltage too high');
  if (sens.tb > 45) return fault('Battery too hot to start');
  F.mode = 'RUN'; F.t0 = T; F.chargeIn = 0; F.dischOut = 0; F.done = null; results = null;
  chart = []; lastSample = -1e9;
  startPhase('D1');
  samplePoint(true);
  return true;
}

/* ---------- physics step (dt in sim seconds) ---------- */
function step(dt) {
  T += dt;
  var rail = railV(), present = rail >= 3.6, c = batt, ph = F.phase, I = 0;
  var run = F.mode === 'RUN';
  if (run) {
    F.phaseT += dt;
    if (c && (ph === 'D1' || ph === 'D2')) I = F.set.dis / 1000;
    else if (c && (ph === 'CH' || ph === 'ST') && present) {
      var vb = Math.max(ocv(c.soc), 3);
      var iset = Math.min(F.set.chg / 1000, srcCap(rail, vb));
      var icv = (4.208 - ocv(c.soc)) / (c.p.r0 + rp(c) + 0.1);
      if (icv < iset) { F.cv = true; iset = Math.max(icv, 0); }
      I = -iset;
    }
  }
  var v = 0, tb = 24;
  if (c && c.p.dead) { v = 1.6; tb = c.tb; }
  else if (c) {
    var q = c.p.q / 1000;
    if (I > 0) c.soc -= I * dt / (q * 3600);
    else if (I < 0) c.soc += -I * c.p.eta * dt / (q * 3600);
    if (c.soc < -0.1) c.soc = -0.1;
    if (c.soc > 1.02) c.soc = 1.02;
    c.vp += (I * rp(c) - c.vp) * (1 - Math.exp(-dt / 25));
    v = ocv(c.soc) - I * c.p.r0 - c.vp - I * 0.1;
    if (F.cv && I < 0) v = Math.min(v, 4.208);
    var P = I * I * (c.p.r0 + rp(c));
    c.tb += (P - (c.tb - 24) / 18) * dt / 45;
    tb = c.tb;
  } else v = 0;
  // heatsink (electronic load dissipation)
  var Ph = (run && (ph === 'D1' || ph === 'D2') && I > 0) ? I * Math.max(v - 0.33 * I, 0) : 0;
  th += (24 + 9 * Ph - th) * (1 - Math.exp(-dt / 180));
  sens = { v: v, i: I, tb: c ? tb : 24, present: present, rail: rail };
  var mAh = Math.abs(I) * 1000 * dt / 3600;
  if (run) {
    F.acc += mAh;
    if (ph === 'CH') F.chargeIn += mAh;
    if (ph === 'D2') F.dischOut += mAh;
  }
  // power / boot handling
  var on = present; // the 3.3 V LDO is fed from the input rail only; the battery never powers the board
  if (on && !powered) { F = newF(); bootT = T; }
  if (!on && powered) { F = newF(); }
  powered = !!on;
  if (!run || !powered) return;
  var active = ph === 'D1' || ph === 'D2' || ph === 'CH' || ph === 'ST';
  if (active) {
    if (sens.tb > 50) return fault('Battery over-temp');
    if (v > 4.35) return fault('Battery over-voltage');
    if (!present) return fault('Input power lost');
    if (F.phaseT > 36000) return fault('Phase timeout');
    if ((ph === 'CH' || ph === 'ST') && !c) return fault('Charger fault');
  }
  if (ph === 'D1' || ph === 'D2') { if (v <= F.set.cut) nextPhase(); }
  else if (ph === 'R1' || ph === 'R2' || ph === 'R3') { if (F.phaseT >= 60) nextPhase(); }
  else if (ph === 'CH') { if (F.cv && Math.abs(I) * 1000 <= 60) nextPhase(); }
  else if (ph === 'ST') { if (v >= 3.8 || (F.cv && Math.abs(I) * 1000 <= 60)) nextPhase(); }
  if (F.mode === 'RUN') samplePoint(false);
}

/* remaining-time estimate: fast-forwards a copy of the model (display extra, not in the real firmware) */
var estCache = { key: '', at: 0, val: 0 };
function estimate() {
  var key = [F.phase, F.set.chg, F.set.dis, F.set.cut, batt && batt.p.id, pw.type, pw.v].join('|');
  if (key === estCache.key && T - estCache.at < 600) return estCache.val < 0 ? -1 : Math.max(0, estCache.val - (T - estCache.at));
  var sv = { T: T, F: JSON.parse(JSON.stringify(F)), th: th, sens: sens, powered: powered };
  var cs = batt ? { soc: batt.soc, vp: batt.vp, tb: batt.tb } : null;
  est = true; var t0 = T, n = 0;
  while (F.mode === 'RUN' && n < 4000) { step(20); n++; }
  var val = T - t0, ok = F.mode === 'DONE';
  est = false; T = sv.T; F = sv.F; th = sv.th; sens = sv.sens; powered = sv.powered;
  if (cs) { batt.soc = cs.soc; batt.vp = cs.vp; batt.tb = cs.tb; }
  estCache = { key: key, at: T, val: ok ? val : -1 };
  return ok ? val : -1;
}

/* ---------- firmware screens ---------- */
var targets = [];
function drawScreen() {
  for (var k = 0; k < targets.length; k++) { tctx = targets[k][0]; tctx.setTransform(targets[k][1], 0, 0, targets[k][1], 0, 0); renderScreen(); }
}
function renderScreen() {
  if (!powered) { rect(0, 0, 320, 240, '#000'); return; }
  rect(0, 0, 320, 240, C.BG);
  var s = sens, m = F.mode;
  if (m === 'HOME') {
    header('BATTERY PROFILER', C.ACC);
    line(45, 'Battery', fV(s.v), s.v > 2.0 ? C.GOOD : C.DIM);
    line(72, 'Temp', fT(s.tb), C.TEXT);
    line(99, 'Power', s.present ? 'OK' : 'NOT PRESENT', s.present ? C.GOOD : C.BAD);
    text(10, 160, 'SELECT = setup menu', 2, C.TEXT);
    text(10, 185, 'START  = begin test', 2, C.TEXT);
    footer('Battery Profiler v1  |  designedbykoda');
  } else if (m === 'MENU') {
    header('TEST SETUP', C.ACC);
    var names = ['Charge cur.', 'Disch. cur.', 'Cutoff V', '> START TEST'];
    var vals = [F.set.chg + ' mA', F.set.dis + ' mA', F.set.cut.toFixed(2) + ' V', ''];
    for (var i = 0; i < 4; i++) {
      var y = 48 + i * 34, sel = i === F.cursor;
      if (sel) rect(0, y - 5, 320, 28, F.editing ? C.ROW : C.BAR);
      text(10, y, names[i], 2, sel ? (F.editing ? C.EDIT : C.ACC) : C.DIM);
      text(200, y, vals[i], 2, (sel && F.editing) ? C.EDIT : C.TEXT);
    }
    footer(F.editing ? 'UP/DOWN adjust | SELECT confirm' : 'UP/DOWN move | SELECT edit | STOP back');
  } else if (m === 'RUN') {
    var ph = F.phase, rest = ph[0] === 'R';
    header(TITLES[ph], (ph === 'CH' || ph === 'ST') ? C.GOOD : C.WARN);
    line(42, 'Voltage', fV(s.v), C.TEXT);
    line(68, 'Current', fI(s.i), C.TEXT);
    line(94, 'Temp', fT(s.tb), s.tb > 45 ? C.WARN : C.TEXT);
    line(120, 'Accum.', F.acc.toFixed(1) + ' mAh', C.ACC);
    var e = Math.floor(T - F.t0);
    line(146, 'Elapsed', p2(Math.floor(e / 3600)) + ':' + p2(Math.floor(e / 60) % 60) + ':' + p2(e % 60), C.DIM);
    var rem = estimate();
    line(172, 'Remaining', rem < 0 ? '--:--:--' : '~' + p2(Math.floor(rem / 3600)) + ':' + p2(Math.floor(rem / 60) % 60) + ':' + p2(Math.floor(rem) % 60), C.DIM);
    if (rest) line(198, 'Rest left', Math.max(0, Math.ceil(60 - F.phaseT)) + ' s', C.TEXT);
    footer('STOP = abort test');
  } else if (m === 'DONE') {
    var d = F.done;
    header('TEST COMPLETE', C.GOOD);
    line(45, 'CAPACITY', d.cap.toFixed(1) + ' mAh', C.GOOD);
    line(75, 'Charge in', d.chg.toFixed(1) + ' mAh', C.TEXT);
    line(105, 'Efficiency', d.eff.toFixed(1) + ' %', C.TEXT);
    var mins = Math.floor(d.dur / 60);
    line(135, 'Duration', Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm', C.DIM);
    line(165, 'Battery now', fV(s.v), C.TEXT);
    footer('Saved to SPIFFS | SELECT = home');
  } else if (m === 'FAULT') {
    header('TEST ABORTED', C.BAD);
    text(10, 60, F.msg, 2, C.BAD);
    line(110, 'Battery', fV(s.v), C.TEXT);
    line(136, 'Temp', fT(s.tb), C.TEXT);
    text(10, 180, 'All outputs OFF.', 2, C.TEXT);
    footer('SELECT = home');
  }
}

/* ---------- buttons ---------- */
function clamp(x, a, b) { return Math.min(b, Math.max(a, x)); }
function press(b) {
  if (!powered) return;
  var m = F.mode;
  if (m === 'RUN') { if (b === 'stop') fault('Stopped by user'); }
  else if (m === 'HOME') {
    if (b === 'start') tryStart();
    else if (b === 'select') { F.mode = 'MENU'; F.cursor = 0; F.editing = false; }
  } else if (m === 'MENU') {
    if (F.editing) {
      var d = b === 'up' ? 1 : b === 'down' ? -1 : 0;
      if (d) {
        if (F.cursor === 0) F.set.chg = clamp(F.set.chg + d * 60, 60, 1980);
        else if (F.cursor === 1) F.set.dis = clamp(F.set.dis + d * 50, 50, 2000);
        else F.set.cut = clamp(Math.round((F.set.cut + d * 0.05) * 100) / 100, 2.8, 3.5);
      } else if (b === 'select') F.editing = false;
    } else if (b === 'start') tryStart();
    else if (b === 'stop') F.mode = 'HOME';
    else if (b === 'up') F.cursor = (F.cursor + 3) % 4;
    else if (b === 'down') F.cursor = (F.cursor + 1) % 4;
    else if (b === 'select') { if (F.cursor < 3) F.editing = true; else tryStart(); }
  } else if (m === 'DONE') { if (b === 'start' || b === 'select') F.mode = 'HOME'; }
  else if (m === 'FAULT') { if (b === 'select') F.mode = 'HOME'; }
  flashBtn(b);
  drawScreen();
  updateUI();
}

var BTN = [['start', 'START', 0], ['stop', 'STOP', 0], ['up', 'UP', 0], ['select', 'SELECT', 0], ['down', 'DOWN', 0]];
var BOARD = "<defs><radialGradient id=\"led-stat-glow\"><stop offset=\"0\" stop-color=\"#ffb020\" stop-opacity=\"0.9\"/><stop offset=\"0.45\" stop-color=\"#ffb020\" stop-opacity=\"0.35\"/><stop offset=\"1\" stop-color=\"#ffb020\" stop-opacity=\"0\"/></radialGradient><radialGradient id=\"led-pg-glow\"><stop offset=\"0\" stop-color=\"#3ddc84\" stop-opacity=\"0.9\"/><stop offset=\"0.45\" stop-color=\"#3ddc84\" stop-opacity=\"0.35\"/><stop offset=\"1\" stop-color=\"#3ddc84\" stop-opacity=\"0\"/></radialGradient><style>.led .glow{opacity:0;transition:opacity .12s}.led.on .glow{opacity:1}.led.on .lens{fill:var(--led)}.led.on rect:not(.lens){stroke:var(--led)}</style></defs><g fill=\"none\" stroke=\"#e8eef4\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"><g id=\"board\"><rect x=\"6\" y=\"6\" width=\"656.573\" height=\"902.0\" rx=\"0\" fill=\"none\"/></g><g id=\"esp32\"><rect x=\"247.695\" y=\"390.595\" width=\"180.0\" height=\"192.0\" rx=\"3.0\" fill=\"none\"/><rect x=\"257.695\" y=\"426.595\" width=\"160.0\" height=\"146.0\" rx=\"6.0\" fill=\"none\"/><path d=\"M247.695,399.5 A4.2,4.2 0 0 1 247.695,407.9\" stroke-opacity=\"0.35\"/><path d=\"M427.695,399.5 A4.2,4.2 0 0 0 427.695,407.9\" stroke-opacity=\"0.35\"/><path d=\"M247.695,412.2 A4.2,4.2 0 0 1 247.695,420.59999999999997\" stroke-opacity=\"0.35\"/><path d=\"M427.695,412.2 A4.2,4.2 0 0 0 427.695,420.59999999999997\" stroke-opacity=\"0.35\"/><path d=\"M247.695,424.90000000000003 A4.2,4.2 0 0 1 247.695,433.3\" stroke-opacity=\"0.35\"/><path d=\"M427.695,424.90000000000003 A4.2,4.2 0 0 0 427.695,433.3\" stroke-opacity=\"0.35\"/><path d=\"M247.695,437.6 A4.2,4.2 0 0 1 247.695,446.0\" stroke-opacity=\"0.35\"/><path d=\"M427.695,437.6 A4.2,4.2 0 0 0 427.695,446.0\" stroke-opacity=\"0.35\"/><path d=\"M247.695,450.3 A4.2,4.2 0 0 1 247.695,458.7\" stroke-opacity=\"0.35\"/><path d=\"M427.695,450.3 A4.2,4.2 0 0 0 427.695,458.7\" stroke-opacity=\"0.35\"/><path d=\"M247.695,463.0 A4.2,4.2 0 0 1 247.695,471.4\" stroke-opacity=\"0.35\"/><path d=\"M427.695,463.0 A4.2,4.2 0 0 0 427.695,471.4\" stroke-opacity=\"0.35\"/><path d=\"M247.695,475.7 A4.2,4.2 0 0 1 247.695,484.09999999999997\" stroke-opacity=\"0.35\"/><path d=\"M427.695,475.7 A4.2,4.2 0 0 0 427.695,484.09999999999997\" stroke-opacity=\"0.35\"/><path d=\"M247.695,488.40000000000003 A4.2,4.2 0 0 1 247.695,496.8\" stroke-opacity=\"0.35\"/><path d=\"M427.695,488.40000000000003 A4.2,4.2 0 0 0 427.695,496.8\" stroke-opacity=\"0.35\"/><path d=\"M247.695,501.1 A4.2,4.2 0 0 1 247.695,509.5\" stroke-opacity=\"0.35\"/><path d=\"M427.695,501.1 A4.2,4.2 0 0 0 427.695,509.5\" stroke-opacity=\"0.35\"/><path d=\"M247.695,513.8 A4.2,4.2 0 0 1 247.695,522.2\" stroke-opacity=\"0.35\"/><path d=\"M427.695,513.8 A4.2,4.2 0 0 0 427.695,522.2\" stroke-opacity=\"0.35\"/><path d=\"M247.695,526.5 A4.2,4.2 0 0 1 247.695,534.9000000000001\" stroke-opacity=\"0.35\"/><path d=\"M427.695,526.5 A4.2,4.2 0 0 0 427.695,534.9000000000001\" stroke-opacity=\"0.35\"/><path d=\"M247.695,539.1999999999999 A4.2,4.2 0 0 1 247.695,547.6\" stroke-opacity=\"0.35\"/><path d=\"M427.695,539.1999999999999 A4.2,4.2 0 0 0 427.695,547.6\" stroke-opacity=\"0.35\"/><path d=\"M247.695,551.9 A4.2,4.2 0 0 1 247.695,560.3000000000001\" stroke-opacity=\"0.35\"/><path d=\"M427.695,551.9 A4.2,4.2 0 0 0 427.695,560.3000000000001\" stroke-opacity=\"0.35\"/><path d=\"M247.695,564.5999999999999 A4.2,4.2 0 0 1 247.695,573.0\" stroke-opacity=\"0.35\"/><path d=\"M427.695,564.5999999999999 A4.2,4.2 0 0 0 427.695,573.0\" stroke-opacity=\"0.35\"/><path d=\"M263.56,582.595 A4.2,4.2 0 0 1 271.96,582.595\" stroke-opacity=\"0.35\"/><path d=\"M276.26,582.595 A4.2,4.2 0 0 1 284.65999999999997,582.595\" stroke-opacity=\"0.35\"/><path d=\"M288.96000000000004,582.595 A4.2,4.2 0 0 1 297.36,582.595\" stroke-opacity=\"0.35\"/><path d=\"M301.66,582.595 A4.2,4.2 0 0 1 310.06,582.595\" stroke-opacity=\"0.35\"/><path d=\"M314.36,582.595 A4.2,4.2 0 0 1 322.76,582.595\" stroke-opacity=\"0.35\"/><path d=\"M327.06,582.595 A4.2,4.2 0 0 1 335.46,582.595\" stroke-opacity=\"0.35\"/><path d=\"M339.76,582.595 A4.2,4.2 0 0 1 348.15999999999997,582.595\" stroke-opacity=\"0.35\"/><path d=\"M352.46000000000004,582.595 A4.2,4.2 0 0 1 360.86,582.595\" stroke-opacity=\"0.35\"/><path d=\"M365.16,582.595 A4.2,4.2 0 0 1 373.56,582.595\" stroke-opacity=\"0.35\"/><path d=\"M377.86,582.595 A4.2,4.2 0 0 1 386.26,582.595\" stroke-opacity=\"0.35\"/><path d=\"M390.56,582.595 A4.2,4.2 0 0 1 398.96,582.595\" stroke-opacity=\"0.35\"/><rect x=\"260.695\" y=\"395.095\" width=\"26.0\" height=\"26.0\" rx=\"2.0\" fill=\"none\"/><circle cx=\"273.695\" cy=\"408.095\" r=\"8.0\" fill=\"none\"/><circle cx=\"273.695\" cy=\"408.095\" r=\"2.5\" fill=\"none\" stroke-opacity=\"0.35\"/></g><g id=\"tft\"><rect x=\"22.15\" y=\"21.0\" width=\"515.0\" height=\"350.0\" rx=\"0.0\" fill=\"none\"/><rect id=\"tft-screen\" x=\"75.65\" y=\"43.0\" width=\"408.0\" height=\"306.0\" rx=\"0.0\" fill=\"none\" stroke=\"none\"/></g><g id=\"btn-start\"><rect x=\"555.6\" y=\"34.5\" width=\"9.0\" height=\"8.0\" rx=\"1.0\" fill=\"none\"/><rect x=\"555.6\" y=\"79.5\" width=\"9.0\" height=\"8.0\" rx=\"1.0\" fill=\"none\"/><rect x=\"624.6\" y=\"34.5\" width=\"9.0\" height=\"8.0\" rx=\"1.0\" fill=\"none\"/><rect x=\"624.6\" y=\"79.5\" width=\"9.0\" height=\"8.0\" rx=\"1.0\" fill=\"none\"/><rect x=\"564.6\" y=\"31.0\" width=\"60.0\" height=\"60.0\" rx=\"2.5\" fill=\"none\"/><circle cx=\"594.6\" cy=\"61.0\" r=\"17.5\" fill=\"none\"/></g><g id=\"btn-stop\"><rect x=\"555.6\" y=\"119.625\" width=\"9.0\" height=\"8.0\" rx=\"1.0\" fill=\"none\"/><rect x=\"555.6\" y=\"164.625\" width=\"9.0\" height=\"8.0\" rx=\"1.0\" fill=\"none\"/><rect x=\"624.6\" y=\"119.625\" width=\"9.0\" height=\"8.0\" rx=\"1.0\" fill=\"none\"/><rect x=\"624.6\" y=\"164.625\" width=\"9.0\" height=\"8.0\" rx=\"1.0\" fill=\"none\"/><rect x=\"564.6\" y=\"116.125\" width=\"60.0\" height=\"60.0\" rx=\"2.5\" fill=\"none\"/><circle cx=\"594.6\" cy=\"146.125\" r=\"17.5\" fill=\"none\"/></g><g id=\"btn-up\"><rect x=\"555.6\" y=\"204.75\" width=\"9.0\" height=\"8.0\" rx=\"1.0\" fill=\"none\"/><rect x=\"555.6\" y=\"249.75\" width=\"9.0\" height=\"8.0\" rx=\"1.0\" fill=\"none\"/><rect x=\"624.6\" y=\"204.75\" width=\"9.0\" height=\"8.0\" rx=\"1.0\" fill=\"none\"/><rect x=\"624.6\" y=\"249.75\" width=\"9.0\" height=\"8.0\" rx=\"1.0\" fill=\"none\"/><rect x=\"564.6\" y=\"201.25\" width=\"60.0\" height=\"60.0\" rx=\"2.5\" fill=\"none\"/><circle cx=\"594.6\" cy=\"231.25\" r=\"17.5\" fill=\"none\"/></g><g id=\"btn-select\"><rect x=\"555.6\" y=\"289.875\" width=\"9.0\" height=\"8.0\" rx=\"1.0\" fill=\"none\"/><rect x=\"555.6\" y=\"334.875\" width=\"9.0\" height=\"8.0\" rx=\"1.0\" fill=\"none\"/><rect x=\"624.6\" y=\"289.875\" width=\"9.0\" height=\"8.0\" rx=\"1.0\" fill=\"none\"/><rect x=\"624.6\" y=\"334.875\" width=\"9.0\" height=\"8.0\" rx=\"1.0\" fill=\"none\"/><rect x=\"564.6\" y=\"286.375\" width=\"60.0\" height=\"60.0\" rx=\"2.5\" fill=\"none\"/><circle cx=\"594.6\" cy=\"316.375\" r=\"17.5\" fill=\"none\"/></g><g id=\"btn-down\"><rect x=\"555.6\" y=\"375.0\" width=\"9.0\" height=\"8.0\" rx=\"1.0\" fill=\"none\"/><rect x=\"555.6\" y=\"420.0\" width=\"9.0\" height=\"8.0\" rx=\"1.0\" fill=\"none\"/><rect x=\"624.6\" y=\"375.0\" width=\"9.0\" height=\"8.0\" rx=\"1.0\" fill=\"none\"/><rect x=\"624.6\" y=\"420.0\" width=\"9.0\" height=\"8.0\" rx=\"1.0\" fill=\"none\"/><rect x=\"564.6\" y=\"371.5\" width=\"60.0\" height=\"60.0\" rx=\"2.5\" fill=\"none\"/><circle cx=\"594.6\" cy=\"401.5\" r=\"17.5\" fill=\"none\"/></g><g id=\"jst-battery\"><polygon points=\"86.2,830.4 86.2,814.4 79.2,814.4 79.2,890.4 138.2,890.4 138.2,814.4 131.2,814.4 131.2,830.4\" fill=\"none\"/><rect x=\"86.2\" y=\"863.9\" width=\"45.0\" height=\"26.5\" rx=\"0.0\" fill=\"none\" stroke-opacity=\"0.35\"/><rect x=\"94.2\" y=\"869.9\" width=\"9.0\" height=\"15.0\" rx=\"1.5\" fill=\"none\"/><rect x=\"114.2\" y=\"869.9\" width=\"9.0\" height=\"15.0\" rx=\"1.5\" fill=\"none\"/></g><g id=\"battery-pads\"><circle cx=\"208.1\" cy=\"852.4\" r=\"10.0\" fill=\"none\"/><circle cx=\"208.1\" cy=\"852.4\" r=\"5.0\" fill=\"none\" stroke-opacity=\"0.35\"/><circle cx=\"245.95\" cy=\"852.4\" r=\"10.0\" fill=\"none\"/><circle cx=\"245.95\" cy=\"852.4\" r=\"5.0\" fill=\"none\" stroke-opacity=\"0.35\"/></g><g id=\"screw-terminal\"><rect x=\"564.82\" y=\"761.05\" width=\"90.21\" height=\"102.4\" rx=\"0.0\" fill=\"none\"/><line x1=\"584.82\" y1=\"761.05\" x2=\"584.82\" y2=\"863.45\" stroke-opacity=\"0.35\"/><circle cx=\"607.83\" cy=\"787.25\" r=\"14.0\" fill=\"none\"/><line x1=\"598.83\" y1=\"778.25\" x2=\"616.83\" y2=\"796.25\" stroke-opacity=\"0.35\"/><rect x=\"633.82\" y=\"771.25\" width=\"15.0\" height=\"32.0\" rx=\"2.0\" fill=\"none\" stroke-opacity=\"0.35\"/><circle cx=\"607.83\" cy=\"837.25\" r=\"14.0\" fill=\"none\"/><line x1=\"598.83\" y1=\"828.25\" x2=\"616.83\" y2=\"846.25\" stroke-opacity=\"0.35\"/><rect x=\"633.82\" y=\"821.25\" width=\"15.0\" height=\"32.0\" rx=\"2.0\" fill=\"none\" stroke-opacity=\"0.35\"/></g><g id=\"battery-terminal\"><rect x=\"300.75\" y=\"810.25\" width=\"102.4\" height=\"90.2\" rx=\"0.0\" fill=\"none\"/><line x1=\"300.75\" y1=\"830.25\" x2=\"403.15\" y2=\"830.25\" stroke-opacity=\"0.35\"/><circle cx=\"326.95\" cy=\"853.25\" r=\"14.0\" fill=\"none\"/><line x1=\"317.95\" y1=\"844.25\" x2=\"335.95\" y2=\"862.25\" stroke-opacity=\"0.35\"/><rect x=\"310.95\" y=\"879.6\" width=\"32.0\" height=\"15.0\" rx=\"2.0\" fill=\"none\" stroke-opacity=\"0.35\"/><circle cx=\"376.95\" cy=\"853.25\" r=\"14.0\" fill=\"none\"/><line x1=\"367.95\" y1=\"844.25\" x2=\"385.95\" y2=\"862.25\" stroke-opacity=\"0.35\"/><rect x=\"360.95\" y=\"879.6\" width=\"32.0\" height=\"15.0\" rx=\"2.0\" fill=\"none\" stroke-opacity=\"0.35\"/></g><g id=\"ntc1\"><rect x=\"429.1\" y=\"858.75\" width=\"25.0\" height=\"20.0\" rx=\"9.0\" fill=\"none\"/><line x1=\"433.1\" y1=\"868.75\" x2=\"450.1\" y2=\"868.75\" stroke-opacity=\"0.35\"/></g><g id=\"ntc2\"><rect x=\"476.85\" y=\"858.75\" width=\"25.0\" height=\"20.0\" rx=\"9.0\" fill=\"none\"/><line x1=\"480.85\" y1=\"868.75\" x2=\"497.85\" y2=\"868.75\" stroke-opacity=\"0.35\"/></g><g id=\"fuse\"><rect x=\"220.452\" y=\"744.124\" width=\"51.0\" height=\"74.0\" rx=\"3.0\" fill=\"none\"/><line x1=\"220.452\" y1=\"756.124\" x2=\"271.452\" y2=\"756.124\" stroke-opacity=\"0.35\"/><line x1=\"220.452\" y1=\"806.124\" x2=\"271.452\" y2=\"806.124\" stroke-opacity=\"0.35\"/></g><g id=\"charger\"><rect x=\"333.451\" y=\"641.0\" width=\"40.0\" height=\"40.0\" rx=\"1.5\" fill=\"none\"/><rect x=\"340.451\" y=\"648.0\" width=\"26.0\" height=\"26.0\" rx=\"0.0\" fill=\"none\" stroke-opacity=\"0.35\"/></g><g id=\"mosfet\"><rect x=\"8.0\" y=\"626.9\" width=\"46.2\" height=\"102.2\" rx=\"0.0\" fill=\"none\"/><line x1=\"21.8\" y1=\"626.9\" x2=\"21.8\" y2=\"729.1\" stroke-opacity=\"0.35\"/></g><g id=\"usbc\"><line x1=\"582.1\" y1=\"694.444\" x2=\"589.1\" y2=\"694.444\" stroke-opacity=\"0.35\"/><line x1=\"582.1\" y1=\"686.444\" x2=\"589.1\" y2=\"686.444\" stroke-opacity=\"0.35\"/><line x1=\"582.1\" y1=\"679.444\" x2=\"589.1\" y2=\"679.444\" stroke-opacity=\"0.35\"/><line x1=\"582.1\" y1=\"674.444\" x2=\"589.1\" y2=\"674.444\" stroke-opacity=\"0.35\"/><line x1=\"582.1\" y1=\"669.444\" x2=\"589.1\" y2=\"669.444\" stroke-opacity=\"0.35\"/><line x1=\"582.1\" y1=\"664.444\" x2=\"589.1\" y2=\"664.444\" stroke-opacity=\"0.35\"/><line x1=\"582.1\" y1=\"659.444\" x2=\"589.1\" y2=\"659.444\" stroke-opacity=\"0.35\"/><line x1=\"582.1\" y1=\"654.444\" x2=\"589.1\" y2=\"654.444\" stroke-opacity=\"0.35\"/><line x1=\"582.1\" y1=\"649.444\" x2=\"589.1\" y2=\"649.444\" stroke-opacity=\"0.35\"/><line x1=\"582.1\" y1=\"644.444\" x2=\"589.1\" y2=\"644.444\" stroke-opacity=\"0.35\"/><line x1=\"582.1\" y1=\"637.444\" x2=\"589.1\" y2=\"637.444\" stroke-opacity=\"0.35\"/><line x1=\"582.1\" y1=\"629.444\" x2=\"589.1\" y2=\"629.444\" stroke-opacity=\"0.35\"/><rect x=\"589.1\" y=\"612.444\" width=\"11.0\" height=\"4.8\" rx=\"1.0\" fill=\"none\"/><rect x=\"589.1\" y=\"706.644\" width=\"11.0\" height=\"4.8\" rx=\"1.0\" fill=\"none\"/><rect x=\"630.85\" y=\"612.444\" width=\"11.0\" height=\"4.8\" rx=\"1.0\" fill=\"none\"/><rect x=\"630.85\" y=\"706.644\" width=\"11.0\" height=\"4.8\" rx=\"1.0\" fill=\"none\"/><rect x=\"589.1\" y=\"617.244\" width=\"73.0\" height=\"89.4\" rx=\"6.0\" fill=\"none\"/><line x1=\"655.6\" y1=\"617.244\" x2=\"655.6\" y2=\"706.644\"/><rect x=\"596.6\" y=\"626.944\" width=\"52.0\" height=\"70.0\" rx=\"5.0\" fill=\"none\" stroke-opacity=\"0.35\"/></g><g id=\"led-stat\" class=\"led\" style=\"--led:#ffb020\"><circle class=\"glow\" cx=\"412.6\" cy=\"655.944\" r=\"11.0\" fill=\"url(#led-stat-glow)\" stroke=\"none\"/><rect x=\"407.6\" y=\"653.444\" width=\"10.0\" height=\"5.0\" rx=\"0.8\" fill=\"none\"/><rect class=\"lens\" x=\"410.6\" y=\"653.444\" width=\"4.0\" height=\"5.0\" fill=\"none\" stroke=\"none\"/></g><g id=\"led-pg\" class=\"led\" style=\"--led:#3ddc84\"><circle class=\"glow\" cx=\"412.6\" cy=\"666.944\" r=\"11.0\" fill=\"url(#led-pg-glow)\" stroke=\"none\"/><rect x=\"407.6\" y=\"664.444\" width=\"10.0\" height=\"5.0\" rx=\"0.8\" fill=\"none\"/><rect class=\"lens\" x=\"410.6\" y=\"664.444\" width=\"4.0\" height=\"5.0\" fill=\"none\" stroke=\"none\"/></g><g id=\"labels\" fill=\"#e8eef4\" stroke=\"none\" font-family=\"Inter, 'Helvetica Neue', Arial, sans-serif\" font-weight=\"500\" letter-spacing=\"0.6\"><text x=\"594.6\" y=\"108.36\" font-size=\"13.5\" text-anchor=\"middle\">START</text><text x=\"594.6\" y=\"193.49\" font-size=\"13.5\" text-anchor=\"middle\">STOP</text><text x=\"594.6\" y=\"278.61\" font-size=\"13.5\" text-anchor=\"middle\">UP</text><text x=\"594.6\" y=\"363.74\" font-size=\"13.5\" text-anchor=\"middle\">SELECT</text><text x=\"594.6\" y=\"448.86\" font-size=\"13.5\" text-anchor=\"middle\">DOWN</text><text x=\"337.695\" y=\"486.72\" font-size=\"17.0\" text-anchor=\"middle\">ESP32-S3</text><text x=\"337.695\" y=\"508.2\" font-size=\"10.0\" text-anchor=\"middle\" fill-opacity=\"0.6\">WROOM-1U</text><text x=\"625.6\" y=\"603.86\" font-size=\"13.5\" text-anchor=\"middle\">USB-C</text><text x=\"609.9\" y=\"889.86\" font-size=\"13.5\" text-anchor=\"middle\">PSU IN</text><text x=\"549.6\" y=\"794.45\" font-size=\"20.0\" text-anchor=\"middle\">+</text><text x=\"549.6\" y=\"844.45\" font-size=\"20.0\" text-anchor=\"middle\">\u2212</text><text x=\"326.95\" y=\"803.7\" font-size=\"20.0\" text-anchor=\"middle\">+</text><text x=\"376.95\" y=\"803.7\" font-size=\"20.0\" text-anchor=\"middle\">\u2212</text><text x=\"351.95\" y=\"783.96\" font-size=\"11.0\" text-anchor=\"middle\">BATTERY</text><text x=\"187.1\" y=\"859.6\" font-size=\"20.0\" text-anchor=\"middle\">\u2212</text><text x=\"267.1\" y=\"859.6\" font-size=\"20.0\" text-anchor=\"middle\">+</text><text x=\"227.0\" y=\"883.86\" font-size=\"13.5\" text-anchor=\"middle\">BAT</text><text x=\"67.1\" y=\"857.26\" font-size=\"13.5\" text-anchor=\"middle\" transform=\"rotate(-90 67.1 852.4)\">JST-PH</text><text x=\"441.6\" y=\"898.46\" font-size=\"11.0\" text-anchor=\"middle\">NTC1</text><text x=\"489.35\" y=\"898.46\" font-size=\"11.0\" text-anchor=\"middle\">NTC2</text><text x=\"287.1\" y=\"785.96\" font-size=\"13.5\" text-anchor=\"middle\" transform=\"rotate(-90 287.1 781.1)\">FUSE</text><text x=\"353.45\" y=\"695.96\" font-size=\"11.0\" text-anchor=\"middle\">CHARGER</text><text x=\"423.1\" y=\"659.0\" font-size=\"8.5\" text-anchor=\"start\">STAT</text><text x=\"423.1\" y=\"670.0\" font-size=\"8.5\" text-anchor=\"start\">PG</text><text x=\"68.6\" y=\"681.96\" font-size=\"11.0\" text-anchor=\"middle\" transform=\"rotate(-90 68.6 678.0)\">LOAD</text><text x=\"17.6\" y=\"404.04\" font-size=\"14.0\" text-anchor=\"start\" fill-opacity=\"0.6\">BATTERY PROFILER v1</text></g></g><g id=\"heatsink\" fill=\"none\" stroke=\"#e8eef4\" stroke-width=\"2\" stroke-linejoin=\"round\"><rect id=\"heatsink-glow\" x=\"-78\" y=\"606\" width=\"86\" height=\"136\" fill=\"#ff7a1a\" fill-opacity=\"0\" stroke=\"none\"/><path d=\"M-78 606h86v136h-86z\"/><path d=\"M-78 626h86\" stroke-opacity=\".35\"/><path d=\"M-78 646h86\" stroke-opacity=\".35\"/><path d=\"M-78 666h86\" stroke-opacity=\".35\"/><path d=\"M-78 686h86\" stroke-opacity=\".35\"/><path d=\"M-78 706h86\" stroke-opacity=\".35\"/><path d=\"M-78 726h86\" stroke-opacity=\".35\"/><path d=\"M8 636v76\" stroke-opacity=\".35\"/></g>";


/* ---------- styles ---------- */
var css = '' +
'#bp-sim{--ba:#22d3ee;--bd:rgba(255,255,255,.12);--bp:rgba(255,255,255,.035);margin:28px 0;font-family:inherit;color:#e5edf5}' +
'#bp-sim *{box-sizing:border-box}' +
'html.has-custom-cursor #bp-sim *{cursor:none!important}' +
'html.has-custom-cursor #bp-sim.is-open *{cursor:auto!important}' +
'html.has-custom-cursor #bp-sim.is-open button,html.has-custom-cursor #bp-sim.is-open input,html.has-custom-cursor #bp-sim.is-open select{cursor:pointer!important}' +
'#bp-sim button{font:inherit;color:inherit}' +
'#bp-sim .bp{position:relative;outline:none;border:1px solid var(--bd);border-radius:18px;background:radial-gradient(120% 90% at 20% 0,rgba(34,211,238,.07),transparent 60%),#0b1016}' +
'#bp-sim .bp:focus-visible{box-shadow:0 0 0 2px var(--ba)}' +
'#bp-sim .bp-top,#bp-sim .bp-cta{display:none}' +
/* mini (on the page) */
'#bp-sim .bp.mini{display:flex;align-items:center;gap:32px;padding:24px 28px}' +
'#bp-sim .bp.mini .bp-main{display:block;flex:none;width:250px}' +
'#bp-sim .bp.mini .bp-side{display:none}' +
'#bp-sim .bp.mini .bp-stage{pointer-events:none}' +
'#bp-sim .bp.mini .bp-cta{display:block;flex:1;min-width:0}' +
'#bp-sim .bp-cta h3{margin:0 0 8px;font-size:22px;line-height:1.2;color:#fff}' +
'#bp-sim .bp-cta p{margin:0 0 18px;color:#9fb0c1;font-size:15px;line-height:1.55;max-width:46ch}' +
'#bp-sim .bp-open{display:inline-flex;align-items:center;gap:10px;border:0;border-radius:999px;background:var(--ba);color:#04121a;font-weight:600;font-size:15px;padding:12px 20px;transition:transform .15s,box-shadow .2s}' +
'#bp-sim .bp-open:hover{transform:translateY(-1px);box-shadow:0 8px 26px rgba(34,211,238,.35)}' +
'#bp-sim .bp-open:focus-visible{outline:2px solid #fff;outline-offset:2px}' +
'@media(max-width:640px){#bp-sim .bp.mini{flex-direction:column;gap:18px;padding:20px}#bp-sim .bp.mini .bp-main{width:min(230px,62vw)}#bp-sim .bp-cta{text-align:center}#bp-sim .bp-cta p{margin-left:auto;margin-right:auto}}' +
/* full */
'#bp-sim .bp.full{position:fixed;inset:0;z-index:2147483000;margin:0;border:0;border-radius:0;overflow:auto;background:#05080c;padding:14px 22px 22px;display:flex;flex-direction:column}' +
'#bp-sim .bp.full .bp-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 12px;font-size:14px;color:#9fb0c1}' +
'#bp-sim .bp-top b{color:#fff;font-size:15px;letter-spacing:.02em}' +
'#bp-sim .bp-top span{display:flex;gap:8px}' +
'#bp-sim .bp-ghost{white-space:nowrap;font-size:13px;color:#9fb0c1;background:none;border:1px solid var(--bd);border-radius:999px;padding:7px 14px;transition:.2s}' +
'#bp-sim .bp-ghost:hover{color:#fff;border-color:rgba(255,255,255,.4)}' +
'#bp-sim .bp-ghost:focus-visible{outline:2px solid var(--ba)}' +
'#bp-sim .bp.full .bp-main{display:grid;grid-template-columns:minmax(0,1fr) 430px;gap:28px;flex:1;min-height:0;align-items:center}' +
'#bp-sim .bp.full .bp-side{max-height:calc(100vh - 80px);overflow:auto;padding:2px 4px 2px 0}' +
'@media(max-width:960px){#bp-sim .bp.full .bp-main{grid-template-columns:1fr;align-items:start}#bp-sim .bp.full .bp-side{max-height:none;overflow:visible}}' +
'#bp-sim .bp-stage{position:relative;width:100%;aspect-ratio:680/740;margin:0 auto;user-select:none}' +
'#bp-sim .bp.full .bp-stage{width:min(100%,calc((100vh - 84px) * 680 / 740))}' +
'@media(max-width:960px){#bp-sim .bp.full .bp-stage{width:min(100%,640px)}}' +
'#bp-sim .bp-svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;color:#e8eef4}' +
'#bp-sim .bp-svg *{vector-effect:non-scaling-stroke}' +
'#bp-sim .bp-svg .ln{fill:none;stroke:currentColor;stroke-width:1.5;stroke-linejoin:round;stroke-linecap:round}' +
'#bp-sim .bp-svg .lbl{fill:#8da0b3;font-size:11px;font-family:ui-monospace,Menlo,monospace;letter-spacing:.04em}' +
'#bp-sim .bp-svg .flow{fill:none;stroke:var(--ba);stroke-width:2.5;stroke-linecap:round;stroke-dasharray:2 10;opacity:0;transition:opacity .3s}' +
'#bp-sim .bp-svg .flow.fw{opacity:1;animation:bpfw .7s linear infinite}' +
'#bp-sim .bp-svg .flow.bw{opacity:1;animation:bpbw .7s linear infinite}' +
'@keyframes bpfw{to{stroke-dashoffset:-12}}@keyframes bpbw{to{stroke-dashoffset:12}}' +
'#bp-sim .bp-svg .fade{transition:opacity .3s}' +
'#bp-sim .bp-svg #heat-waves{opacity:0;transition:opacity .6s}' +
'#bp-sim .bp-svg .hw{fill:none;stroke:#ff9a4a;stroke-width:2;stroke-linecap:round;opacity:0;animation:bphw 9s ease-in-out infinite}' +
'@keyframes bphw{0%{opacity:0;transform:translateY(8px)}9%{opacity:.95}29%,100%{opacity:0;transform:translateY(-30px)}}' +
'@media(prefers-reduced-motion:reduce){#bp-sim .bp-svg .hw{animation:none;opacity:.75}}' +
'#bp-sim .bp-svg [id^=btn-]{transition:transform .08s;transform-box:fill-box;transform-origin:center}' +
'#bp-sim .bp-svg [id^=btn-].pr{transform:scale(.88)}' +
'#bp-sim .bp-tft{position:absolute;background:#000;pointer-events:none;border-radius:2px;box-shadow:0 0 26px rgba(34,211,238,.16)}' +
'#bp-sim .bp-b{position:absolute;background:transparent;border:0;border-radius:8px;padding:0;margin:0}' +
'#bp-sim .bp-b:hover{background:rgba(34,211,238,.16)}' +
'#bp-sim .bp-b:focus-visible{outline:2px solid var(--ba)}' +
'#bp-sim .bp-hint{border:1px solid rgba(34,211,238,.35);background:rgba(34,211,238,.08);border-radius:14px;padding:14px 16px;margin-bottom:12px;font-size:15px;line-height:1.5;color:#e5edf5;min-height:3.6em}' +
'#bp-sim .bp-hint.bad{border-color:rgba(255,90,90,.5);background:rgba(255,90,90,.08)}' +
'#bp-sim .bp-hint.good{border-color:rgba(60,220,130,.5);background:rgba(60,220,130,.08)}' +
'#bp-sim .bp-card{border:1px solid var(--bd);background:var(--bp);border-radius:14px;padding:14px;margin-bottom:12px}' +
'#bp-sim .bp-card h4{display:flex;align-items:center;gap:10px;margin:0 0 12px;font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:#b7c4d1;font-weight:600}' +
'#bp-sim .bp-card h4 i{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;border:1px solid var(--bd);font:600 12px/1 inherit;font-style:normal;letter-spacing:0;color:#8da0b3;transition:.25s}' +
'#bp-sim .bp-card.ok h4 i{background:var(--ba);border-color:var(--ba);color:#04121a}' +
'#bp-sim .bp-chips{display:flex;flex-wrap:wrap;gap:8px}' +
'#bp-sim .bp-chip{font-size:13px;color:#e5edf5;background:transparent;border:1px solid var(--bd);border-radius:10px;padding:8px 11px;text-align:left;transition:.2s;line-height:1.25}' +
'#bp-sim .bp-chip small{display:block;color:#8da0b3;font-size:11px}' +
'#bp-sim .bp-chip:hover{border-color:rgba(34,211,238,.6)}' +
'#bp-sim .bp-chip.on{border-color:var(--ba);background:rgba(34,211,238,.13)}' +
'#bp-sim .bp-chip:focus-visible{outline:2px solid var(--ba)}' +
'#bp-sim .bp-note{margin:10px 0 0;font-size:12.5px;color:#8da0b3;line-height:1.5}' +
'#bp-sim .bp-row{display:flex;align-items:center;gap:10px;margin-top:12px;font-size:13px;color:#b7c4d1}' +
'#bp-sim .bp-row input[type=range]{flex:1;accent-color:#22d3ee}' +
'#bp-sim .bp-seg{display:inline-flex;border:1px solid var(--bd);border-radius:10px;overflow:hidden}' +
'#bp-sim .bp-seg button{background:none;border:0;padding:7px 11px;font-size:13px;color:#9fb0c1;border-right:1px solid var(--bd)}' +
'#bp-sim .bp-seg button:last-child{border-right:0}' +
'#bp-sim .bp-seg button.on{background:rgba(34,211,238,.16);color:#fff}' +
'#bp-sim .bp-seg button:focus-visible{outline:2px solid var(--ba);outline-offset:-2px}' +
'#bp-sim kbd{font:11px ui-monospace,Menlo,monospace;border:1px solid var(--bd);border-radius:5px;padding:1px 5px;color:#c9d6e2}' +
'#bp-sim .bp-chart{width:100%;height:auto;display:block;border:1px solid var(--bd);border-radius:12px;background:rgba(255,255,255,.02)}' +
'#bp-sim .bp-res{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}' +
'#bp-sim .bp-res div{border:1px solid var(--bd);border-radius:10px;padding:8px 10px}' +
'#bp-sim .bp-res b{display:block;font-size:17px;font-weight:600;color:#fff;font-variant-numeric:tabular-nums}' +
'#bp-sim .bp-res span{font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:#8da0b3}' +
'#bp-sim .bp-verdict{margin:12px 0 0;font-size:14px;color:#b7c4d1;min-height:1.4em;line-height:1.45}' +
'#bp-sim pre.bp-csv{margin:12px 0 0;padding:10px 12px;border:1px solid var(--bd);border-radius:10px;background:#05090d;font:11.5px/1.5 ui-monospace,Menlo,monospace;color:#8da0b3;overflow:auto;white-space:pre}';
var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);


/* ---------- markup ---------- */
var FSI = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/></svg>';
root.innerHTML = '' +
'<div class="bp mini" tabindex="0" role="group" aria-label="Battery Profiler simulator. Arrow keys are up and down, Enter is select, S is start, X is stop.">' +
'<div class="bp-top"><b>Battery Profiler simulator</b><span><button class="bp-ghost" id="bp-reset" type="button">Reset</button><button class="bp-ghost" id="bp-close" type="button">Close &#10005;</button></span></div>' +
'<div class="bp-main"><div class="bp-stage">' +
'<svg class="bp-svg" viewBox="0 0 680 740" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
' <g id="bp-wires"></g>' +
' <svg id="bp-board" x="80" y="10" width="380" height="520" viewBox="0 0 668.573 914" preserveAspectRatio="xMidYMid meet" overflow="visible">' + BOARD + '</svg>' +
' <g id="bp-labels"></g>' +
' <g id="bp-cell" class="ln fade"></g>' +
' <text id="bp-cell-name" class="lbl" x="305" y="704" text-anchor="middle"></text>' +
' <g id="bp-adapter" class="ln fade"><rect x="590" y="348" width="80" height="76" rx="10"/><path d="M590 372h-12M590 400h-12"/><text class="lbl" x="630" y="392" text-anchor="middle" style="stroke:none">5 V</text><text class="lbl" x="630" y="442" text-anchor="middle" style="stroke:none">USB-C</text></g>' +
' <g id="bp-psu" class="ln fade"><rect x="520" y="490" width="150" height="130" rx="10"/><rect x="534" y="502" width="122" height="46" rx="4"/><circle cx="520" cy="525" r="5"/><circle cx="520" cy="585" r="5"/><circle cx="545" cy="590" r="6"/><circle cx="610" cy="588" r="15"/><path d="M610 575v8"/><text id="bp-psu-v" x="542" y="534" style="font:600 20px ui-monospace,Menlo,monospace;fill:#22d3ee;stroke:none"></text><text id="bp-psu-i" x="650" y="534" text-anchor="end" style="font:12px ui-monospace,Menlo,monospace;fill:#8da0b3;stroke:none"></text><text class="lbl" x="595" y="642" text-anchor="middle" style="stroke:none">BENCH PSU</text></g>' +
'</svg>' +
'<canvas class="bp-tft" width="960" height="720"></canvas><div id="bp-btns"></div>' +
'</div>' +
'<div class="bp-side">' +
' <div class="bp-hint" id="bp-hint" aria-live="polite"></div>' +
' <div class="bp-card" id="bp-c2"><h4><i>1</i>Power</h4><div class="bp-chips" id="bp-power" role="radiogroup" aria-label="Power source"></div><div class="bp-row" id="bp-psu-row" hidden><label for="bp-v">Voltage</label><input id="bp-v" type="range" min="0" max="12" step="0.1" value="5"><b id="bp-vv" style="min-width:48px;text-align:right"></b></div></div>' +
' <div class="bp-card" id="bp-c1"><h4><i>2</i>Battery</h4><div class="bp-chips" id="bp-cells" role="radiogroup" aria-label="Battery"></div><p class="bp-note" id="bp-cell-note"></p></div>' +
' <div class="bp-card" id="bp-c3"><h4><i>3</i>Run the test</h4><p class="bp-note" style="margin:0 0 12px">Press the buttons on the board: <b>START</b> to begin, <b>SELECT</b> to change currents, <b>STOP</b> to abort. Keyboard: <kbd>S</kbd> <kbd>X</kbd> <kbd>&uarr;</kbd> <kbd>&darr;</kbd> <kbd>Enter</kbd>.</p><div class="bp-row" style="margin-top:0"><span>Speed</span><span class="bp-seg" id="bp-speed" role="group" aria-label="Simulation speed"></span></div></div>' +
' <div class="bp-card"><div class="bp-res" id="bp-res"></div><canvas class="bp-chart" id="bp-chart" width="640" height="300"></canvas><p class="bp-verdict" id="bp-verdict" aria-live="polite"></p><pre class="bp-csv" id="bp-csv" hidden></pre></div>' +
'</div></div>' +
'<div class="bp-cta"><h3>Try the Battery Profiler yourself</h3><p>Plug in a cell and a power source, press the real buttons, and watch a full test run on the board&rsquo;s own screen. Some of the cells are not what they claim to be.</p><button class="bp-open" id="bp-open" type="button">' + FSI + 'Open simulator</button></div>' +
'</div>';

var q = function (s) { return root.querySelector(s); };
var svg = q('.bp-svg'), canvas = q('.bp-tft'), widget = q('.bp'), stage = q('.bp-stage');
targets = [[canvas.getContext('2d'), 3]];
var gid = function (id) { return svg.querySelector('#' + id); };

/* ---------- controls ---------- */
var cellsEl = q('#bp-cells'), powerEl = q('#bp-power'), speedEl = q('#bp-speed');
function chip(parent, id, html, fn) {
  var b = document.createElement('button'); b.type = 'button'; b.className = 'bp-chip'; b.setAttribute('data-id', id); b.setAttribute('role', 'radio'); b.innerHTML = html; b.onclick = fn; parent.appendChild(b);
}
chip(cellsEl, 'none', 'No battery', function () { connectCell(null); });
PRESETS.forEach(function (p) { chip(cellsEl, p.id, p.name + '<small>' + p.tag + '</small>', function () { connectCell(p.id); }); });
[['none', 'Unplugged'], ['usb', 'USB-C 5 V<small>about 1 A</small>'], ['psu', 'Bench PSU<small>2 A max</small>']].forEach(function (x) { chip(powerEl, x[0], x[1], function () { setPower(x[0]); }); });
[[1, '1x'], [60, '60x'], [600, '600x'], [1800, '1800x'], [7200, '7200x']].forEach(function (x) {
  var b = document.createElement('button'); b.type = 'button'; b.textContent = x[1]; b.setAttribute('data-s', x[0]);
  b.onclick = function () { speed = x[0]; updateUI(); }; speedEl.appendChild(b);
});
function connectCell(id) { batt = id ? cells[id] : null; step(0); drawScreen(); updateUI(); }
var pwSel = 'none', pwTimer = 0;
function setPower(t) {
  clearTimeout(pwTimer); pwSel = t;
  var delay = t === 'usb' && pw.type !== 'usb' && !RM ? 450 : 0;
  var apply = function () { pw.type = t; step(0); drawScreen(); updateUI(); };
  updateUI();
  if (delay) pwTimer = setTimeout(apply, delay); else apply();
}
q('#bp-v').oninput = function () { pw.v = parseFloat(this.value); step(0); drawScreen(); updateUI(); };
q('#bp-reset').onclick = function () {
  resetCells(); batt = null; pw = { type: 'none', v: 5 }; q('#bp-v').value = 5; th = 24; csvRows = []; chart = []; results = null;
  pwSel = 'none'; clearTimeout(pwTimer);
  F = newF(); powered = false; step(0); drawScreen(); updateUI();
};

/* ---------- fullscreen ---------- */
var isFull = false, fb = false, fbPh = null, fbH = 0;
function setFull(on) {
  isFull = on; widget.classList.toggle('full', on); widget.classList.toggle('mini', !on); root.classList.toggle('is-open', on);
  if (on) widget.focus({ preventScroll: true });
  updateUI(); drawChart();
}
function toFallback() {
  if (fb || !isFull) return; fb = true;
  fbPh = document.createElement('div'); fbPh.style.height = fbH + 'px';
  root.parentNode.insertBefore(fbPh, root); document.body.appendChild(root); document.documentElement.style.overflow = 'hidden';
}
function openFull() {
  fbH = root.offsetHeight;
  var rq = widget.requestFullscreen || widget.webkitRequestFullscreen;
  setFull(true);
  if (rq) { try { var r = rq.call(widget); if (r && r.catch) r.catch(toFallback); } catch (e) { toFallback(); } } else toFallback();
  run();
}
function endFull() {
  if (!isFull) return; setFull(false);
  if (fb) { fb = false; fbPh.parentNode.insertBefore(root, fbPh); fbPh.parentNode.removeChild(fbPh); document.documentElement.style.overflow = ''; }
}
function closeFull() {
  var fe = document.fullscreenElement || document.webkitFullscreenElement;
  if (fe === widget) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } else endFull();
}
['fullscreenchange', 'webkitfullscreenchange'].forEach(function (ev) {
  document.addEventListener(ev, function () { if (isFull && !fb && !(document.fullscreenElement || document.webkitFullscreenElement)) endFull(); });
});
document.addEventListener('keydown', function (e) { if (isFull && fb && e.key === 'Escape') closeFull(); });
q('#bp-open').onclick = openFull;
q('#bp-close').onclick = closeFull;

/* ---------- layout (reads anchors from the SVG so real art can be swapped in) ---------- */
var wires = {}, ov = {};
var wg = gid('bp-wires');
function mkWire(name) {
  var a = document.createElementNS('http://www.w3.org/2000/svg', 'path'); a.setAttribute('class', 'ln fade');
  var f = document.createElementNS('http://www.w3.org/2000/svg', 'path'); f.setAttribute('class', 'flow');
  wg.appendChild(a); wg.appendChild(f); wires[name] = { a: a, f: f };
}
['neg', 'pos', 'usb', 'pr', 'pb'].forEach(mkWire);
function setWire(n, d) { wires[n].a.setAttribute('d', d); wires[n].f.setAttribute('d', d); }
var usbPlug = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
usbPlug.setAttribute('class', 'ln fade'); usbPlug.setAttribute('width', 34); usbPlug.setAttribute('rx', 6);
wg.appendChild(usbPlug);
var geo = {};
function rpath(p, r) {
  var q2 = [p[0]];
  for (var k = 1; k < p.length; k++) if (p[k][0] !== p[k - 1][0] || p[k][1] !== p[k - 1][1]) q2.push(p[k]);
  p = q2; var d = 'M' + p[0][0] + ' ' + p[0][1];
  for (var i = 1; i < p.length - 1; i++) {
    var a = p[i - 1], c = p[i], n = p[i + 1];
    var l1 = Math.hypot(c[0] - a[0], c[1] - a[1]), l2 = Math.hypot(n[0] - c[0], n[1] - c[1]), rr = Math.min(r, l1 / 2, l2 / 2);
    var u1 = [(c[0] - a[0]) / l1, (c[1] - a[1]) / l1], u2 = [(n[0] - c[0]) / l2, (n[1] - c[1]) / l2];
    d += ' L' + (c[0] - u1[0] * rr) + ' ' + (c[1] - u1[1] * rr) + ' Q' + c[0] + ' ' + c[1] + ' ' + (c[0] + u2[0] * rr) + ' ' + (c[1] + u2[1] * rr);
  }
  var l = p[p.length - 1]; return d + ' L' + l[0] + ' ' + l[1];
}
/* cell artwork + the points where the board wires attach */
var cellShape = '';
function drawCell(shape) {
  if (shape === cellShape) return; cellShape = shape;
  var g = gid('bp-cell'), s = '', cg;
  var lab = 'class="lbl" text-anchor="middle" style="stroke:none;font-size:14px"';
  if (shape === 'pouch' || shape === 'pouchL') {
    var L = shape === 'pouchL', w = L ? 224 : 160, h = L ? 74 : 94, px0 = 305 - w / 2, y0 = 622, inset = L ? 34 : 22;
    var t1 = px0 + inset, t2 = px0 + w - inset - 12;
    s = '<rect x="' + px0 + '" y="' + y0 + '" width="' + w + '" height="' + h + '" rx="6"/><path d="M' + px0 + ' ' + (y0 + 16) + 'H' + (px0 + w) + '" style="opacity:.45"/><rect x="' + t1 + '" y="608" width="12" height="14" rx="2"/><rect x="' + t2 + '" y="608" width="12" height="14" rx="2"/>' +
      '<rect id="bp-soc" x="' + (px0 + 6) + '" y="' + (y0 + 22) + '" width="0" height="' + (h - 28) + '" rx="4" style="fill:#22d3ee;fill-opacity:.22;stroke:none"/>' +
      '<text ' + lab + ' x="' + (t1 + 6) + '" y="' + (y0 + 36) + '">+</text><text ' + lab + ' x="' + (t2 + 6) + '" y="' + (y0 + 36) + '">-</text>' +
      '<text id="bp-cell-tag" class="lbl" x="305" y="' + (y0 + h - 14) + '" text-anchor="middle" style="font-size:16px;fill:#e5edf5;stroke:none"></text>';
    cg = { pos: [t1 + 6, 608, 'v'], neg: [t2 + 6, 608, 'v'], soc: w - 12, name: y0 + h + 22 };
  } else {
    var len = shape === 'short' ? 140 : 230, bx = 305 - len / 2;
    s = '<rect x="' + bx + '" y="606" width="' + len + '" height="56" rx="9"/><rect x="' + (bx - 12) + '" y="623" width="12" height="22" rx="3"/>' +
      '<rect id="bp-soc" x="' + (bx + 6) + '" y="612" width="0" height="44" rx="5" style="fill:#22d3ee;fill-opacity:.22;stroke:none"/>' +
      '<text id="bp-cell-tag" class="lbl" x="305" y="640" text-anchor="middle" style="font-size:16px;fill:#e5edf5;stroke:none"></text>' +
      '<text ' + lab + ' x="' + (bx - 6) + '" y="684">+</text><text ' + lab + ' x="' + (bx + len + 6) + '" y="684">-</text>';
    cg = { pos: [bx - 12, 634, 'h'], neg: [bx + len, 634, 'h'], soc: len - 12, name: 706, bx: bx, len: len };
  }
  g.innerHTML = s; geo.cg = cg;
  var nm = gid('bp-cell-name'); nm.setAttribute('y', cg.name);
  routeWires();
}
function routeWires() {
  var cg = geo.cg; if (!cg || geo.nx === undefined) return;
  var nx = geo.nx, px = geo.px, by = geo.by, R = 26, P0 = cg.pos, N0 = cg.neg;
  if (P0[2] === 'v') {
    var ym = by + (P0[1] - by) / 2;
    setWire('pos', rpath([[nx, by], [nx, ym], [P0[0], ym], [P0[0], P0[1]]], R));
    setWire('neg', rpath([[px, by], [px, ym], [N0[0], ym], [N0[0], N0[1]]], R));
  } else {
    var y1 = by + (P0[1] - by) * 0.45;
    setWire('pos', rpath([[nx, by], [nx, y1], [P0[0] - 46, y1], [P0[0] - 46, P0[1]], [P0[0], P0[1]]], R));
    setWire('neg', rpath([[px, by], [px, y1], [N0[0] + 46, y1], [N0[0] + 46, N0[1]], [N0[0], N0[1]]], R));
  }
}
/* heat waves above the heatsink: each wave re-rolls its position, size and timing every cycle */
(function () {
  var hs = gid('heatsink'); if (!hs) return;
  var g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g.setAttribute('id', 'heat-waves'); hs.appendChild(g);
  var rnd = function (a, b2) { return a + Math.random() * (b2 - a); };
  function reroll(p) {
    var x = rnd(-74, -4), amp = rnd(5, 10), seg = rnd(20, 30), n = Math.random() < 0.5 ? 2 : 3;
    var d = 'M' + x.toFixed(1) + ' ' + rnd(592, 604).toFixed(1) + ' q' + amp.toFixed(1) + ' ' + (-seg / 2).toFixed(1) + ' 0 ' + (-seg).toFixed(1);
    for (var i = 1; i < n; i++) d += ' t0 ' + (-seg).toFixed(1);
    p.setAttribute('d', d);
  }
  for (var i = 0; i < 3; i++) {
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('class', 'hw');
    reroll(p); p.style.animationDelay = (-rnd(0, 9)).toFixed(2) + 's';
    p.addEventListener('animationiteration', function (e) { reroll(e.target); });
    g.appendChild(p);
  }
})();
drawCell('cyl');
function layout() {
  var sr = svg.getBoundingClientRect(); if (!sr.width) return;
  function A(id) {
    var e = gid(id); if (!e) return null; var r = e.getBoundingClientRect();
    return { x: (r.left - sr.left) / sr.width * 680, y: (r.top - sr.top) / sr.height * 740, w: r.width / sr.width * 680, h: r.height / sr.height * 740 };
  }
  var s = A('tft-screen');
  var tf = A('tft');
  if (tf) { s = { h: tf.h * 0.96 }; s.w = s.h * 4 / 3; if (s.w > tf.w * 0.95) { s.w = tf.w * 0.95; s.h = s.w * 3 / 4; } s.x = tf.x + (tf.w - s.w) / 2; s.y = tf.y + (tf.h - s.h) / 2; }
  if (s) { canvas.style.left = s.x / 6.8 + '%'; canvas.style.top = s.y / 7.4 + '%'; canvas.style.width = s.w / 6.8 + '%'; canvas.style.height = s.h / 7.4 + '%'; }
  var lb = gid('bp-labels'); lb.innerHTML = ''; var own = !!gid('labels');
  BTN.forEach(function (b) {
    var r = A('btn-' + b[0]); if (!r) return;
    var el = ov[b[0]];
    if (!el) {
      el = ov[b[0]] = document.createElement('button'); el.type = 'button'; el.className = 'bp-b'; el.setAttribute('aria-label', b[1] + ' button'); el.title = b[1];
      bindBtn(el, b[0]); q('#bp-btns').appendChild(el);
    }
    var pad = 6;
    el.style.left = (r.x - pad) / 6.8 + '%'; el.style.top = (r.y - pad) / 7.4 + '%'; el.style.width = (r.w + pad * 2) / 6.8 + '%'; el.style.height = (r.h + pad * 2) / 7.4 + '%';
    var t = document.createElementNS('http://www.w3.org/2000/svg', 'text'); t.setAttribute('class', 'lbl'); t.setAttribute('x', r.x + r.w + 12); t.setAttribute('y', r.y + r.h / 2 + 4); t.textContent = b[1]; if (!own) lb.appendChild(t);
  });
  var T0 = A('battery-terminal') || A('battery-pads'), U = A('usbc'), P = A('screw-terminal');
  geo = { T: T0, U: U, P: P, cg: geo.cg };
  if (T0) {
    var nx = T0.x + T0.w * 0.25, px = T0.x + T0.w * 0.75, by = T0.y + T0.h;
    geo.nx = nx; geo.px = px; geo.by = by; routeWires();
  }
  if (P) {
    var sx = P.x + P.w, y1 = P.y + P.h * 0.3, y2 = P.y + P.h * 0.7;
    setWire('pr', 'M' + sx + ' ' + y1 + ' H' + (sx + 14) + ' C495 ' + y1 + ',495 525,520 525');
    setWire('pb', 'M' + sx + ' ' + y2 + ' H' + (sx + 14) + ' C495 ' + y2 + ',495 585,520 585');
  }
  placeUSB();
}
var usbOff = 44, usbTarget = 44, usbAnim = 0, usbInit = false;
function placeUSB() {
  var U = geo.U; if (!U) return;
  var ux = U.x + U.w + usbOff, uy = U.y + U.h / 2, ph = U.h * 0.9;
  usbPlug.setAttribute('height', ph); usbPlug.setAttribute('x', ux); usbPlug.setAttribute('y', uy - ph / 2);
  setWire('usb', 'M' + (ux + 34) + ' ' + uy + ' C' + (ux + 90) + ' ' + uy + ',520 386,590 386');
}
function setUsbTarget(on) {
  var tgt = on ? 0 : 44;
  if (!usbInit) { usbInit = true; usbTarget = usbOff = tgt; placeUSB(); return; }
  if (tgt === usbTarget) return;
  usbTarget = tgt;
  cancelAnimationFrame(usbAnim);
  if (RM) { usbOff = tgt; placeUSB(); return; }
  var from = usbOff, t0 = performance.now(), dur = 600;
  (function f(now) {
    var k = Math.min(1, ((now || performance.now()) - t0) / dur);
    k = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    usbOff = from + (tgt - from) * k; placeUSB();
    usbAnim = k < 1 ? requestAnimationFrame(f) : 0;
  })();
}
if (window.ResizeObserver) new ResizeObserver(layout).observe(stage); else window.addEventListener('resize', layout);

/* optional real board art */
var boardUrl = root.getAttribute('data-board');
if (boardUrl && window.fetch) fetch(boardUrl).then(function (r) { return r.ok ? r.text() : Promise.reject(); }).then(function (t) {
  var d = new DOMParser().parseFromString(t, 'image/svg+xml'), s = d.documentElement;
  if (!s.querySelector('#tft-screen')) return;
  var vb = s.getAttribute('viewBox'); var nb = gid('bp-board');
  if (vb) nb.setAttribute('viewBox', vb);
  nb.innerHTML = '<g class="ln">' + s.innerHTML + '</g>';
  ov = {}; q('#bp-btns').innerHTML = '';
  layout(); updateUI();
}).catch(function () { });

/* ---------- button binding ---------- */
var rep = { t: null, i: null };
function stopRep() { clearTimeout(rep.t); clearInterval(rep.i); rep.t = rep.i = null; }
function bindBtn(el, name) {
  el.addEventListener('pointerdown', function (e) {
    e.preventDefault(); widget.focus({ preventScroll: true });
    press(name);
    if ((name === 'up' || name === 'down') && F.editing) {
      stopRep();
      rep.t = setTimeout(function () { rep.i = setInterval(function () { if (F.editing) press(name); else stopRep(); }, 110); }, 450);
    }
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { el.addEventListener(ev, stopRep); });
  el.addEventListener('click', function (e) { if (e.detail === 0) press(name); });
}
function flashBtn(b) {
  var g = gid('btn-' + b); if (!g) return; g.classList.add('pr');
  setTimeout(function () { g.classList.remove('pr'); }, 110);
}
var KEYS = { ArrowUp: 'up', ArrowDown: 'down', Enter: 'select', s: 'start', S: 'start', x: 'stop', X: 'stop' };
var lastKey = 0;
widget.addEventListener('keydown', function (e) {
  if (e.target !== widget || !isFull) return;
  var b = KEYS[e.key]; if (!b) return;
  e.preventDefault();
  var now = performance.now();
  if (e.repeat && !(F.editing && now - lastKey >= 110)) return;
  lastKey = now; press(b);
});

/* ---------- UI refresh ---------- */
function setOp(el, o) { if (el) el.style.opacity = o; }
function fmtDur(s) { var m = Math.floor(s / 60); return Math.floor(m / 60) + 'h ' + p2(m % 60) + 'm'; }
function hintText() {
  if (!powered) return ['Step 1: connect a power source (USB-C or the bench PSU). The board stays off without one, because the battery never powers it.', ''];
  if (!batt) return ['Board is on. Step 2: pick a battery to plug in.', ''];
  var m = F.mode;
  if (m === 'HOME') return ['Ready. Press START on the board to begin the test, or SELECT to change the currents first.', ''];
  if (m === 'MENU') return [F.editing ? 'Editing. UP / DOWN change the value, SELECT confirms.' : 'Setup menu. UP / DOWN move, SELECT edits a value, START begins the test.', ''];
  if (m === 'RUN') return [TITLES[F.phase] + ' in progress. Simulated time so far: ' + fmtDur(T - F.t0) + '. Press STOP to abort.', ''];
  if (m === 'DONE') return ['Test complete. Compare the measured capacity with the label below, then press SELECT to go home.', 'good'];
  return ['Test stopped: ' + F.msg + '. Press SELECT on the board to go back.', 'bad'];
}
function updateUI() {
  var bid = batt ? batt.p.id : 'none';
  Array.prototype.forEach.call(cellsEl.children, function (b) { var on = b.getAttribute('data-id') === bid; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  Array.prototype.forEach.call(powerEl.children, function (b) { var on = pwSel === b.getAttribute('data-id'); b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  Array.prototype.forEach.call(speedEl.children, function (b) { b.classList.toggle('on', +b.getAttribute('data-s') === speed); });
  q('#bp-c1').classList.toggle('ok', !!batt); q('#bp-c2').classList.toggle('ok', sens.present); q('#bp-c3').classList.toggle('ok', F.mode === 'RUN' || F.mode === 'DONE');
  q('#bp-psu-row').hidden = pw.type !== 'psu';
  q('#bp-vv').textContent = pw.v.toFixed(1) + ' V';
  q('#bp-cell-note').textContent = batt ? (batt.p.dead ? batt.p.note + '. The profiler should refuse to start.' : batt.p.note + '. Its true capacity is hidden until the test finishes.') : '';
  if (isFull) { var h = hintText(), he = q('#bp-hint'); he.textContent = h[0]; he.className = 'bp-hint ' + h[1]; }
  var cn = !!batt;
  // cell + wires
  var cn = !!batt;
  setOp(gid('bp-cell'), cn ? 1 : 0.35);
  drawCell(cn ? batt.p.shape : 'cyl');
  var tg = gid('bp-cell-tag'); if (tg) tg.textContent = cn ? batt.p.tag : '';
  q('#bp-cell-name').textContent = cn ? batt.p.name : 'no battery connected';
  var soc = cn ? clamp(batt.p.dead ? 0 : batt.soc, 0, 1) : 0;
  gid('bp-soc').setAttribute('width', ((geo.cg ? geo.cg.soc : 198) * soc).toFixed(1));
  ['neg', 'pos'].forEach(function (n) { setOp(wires[n].a, cn ? 1 : 0); });
  var usb = pw.type === 'usb', psu = pw.type === 'psu', usbSel = pwSel === 'usb';
  setOp(gid('bp-adapter'), usbSel ? 1 : 0.35); setOp(gid('bp-psu'), psu ? 1 : 0.35);
  setOp(usbPlug, usbSel ? 1 : 0.5); setOp(wires.usb.a, usbSel ? 1 : 0.5);
  setOp(wires.pr.a, psu ? 1 : 0); setOp(wires.pb.a, psu ? 1 : 0);
  setUsbTarget(usbSel);
  // flow animation
  var I = F.mode === 'RUN' ? sens.i : 0, chg = I < -0.005, dis = I > 0.005;
  function fl(n, cls) { var f = wires[n].f; f.setAttribute('class', 'flow' + (cls && !RM ? ' ' + cls : '')); if (RM && cls) f.style.opacity = 0.9; else f.style.opacity = ''; }
  fl('neg', cn && chg ? 'fw' : cn && dis ? 'bw' : ''); fl('pos', cn && chg ? 'fw' : cn && dis ? 'bw' : '');
  fl('usb', usb && chg ? 'bw' : ''); fl('pr', psu && chg ? 'bw' : ''); fl('pb', psu && chg ? 'bw' : '');
  // PSU readout
  q('#bp-psu-v').textContent = psu ? pw.v.toFixed(1) + ' V' : '-- V';
  var iin = chg && sens.present ? Math.abs(I) * Math.max(sens.v, 3) / 0.9 / Math.max(sens.rail, 1) : 0;
  q('#bp-psu-i').textContent = psu ? iin.toFixed(2) + ' A' : '';
  // LEDs + heatsink
  var pg = gid('led-pg'), sl = gid('led-stat');
  if (pg) { if (pg.classList.contains('led')) pg.classList.toggle('on', sens.present); else pg.style.fill = sens.present ? '#00ff66' : 'none'; }
  if (sl) { if (sl.classList.contains('led')) sl.classList.toggle('on', chg); else sl.style.fill = chg ? '#ffb020' : 'none'; }
  var hw = gid('heat-waves'); if (hw) hw.style.opacity = th > 33 ? (0.3 + 0.7 * clamp((th - 33) / 25, 0, 1)).toFixed(2) : 0;
  var hg = gid('heatsink-glow'); if (hg) hg.style.fillOpacity = clamp((th - 30) / 40, 0, 0.85).toFixed(2);
  updateResults();
}
var resKey = '';
function updateResults() {
  if (!isFull) return;
  var r = results, box = q('#bp-res'), ver = q('#bp-verdict'), csv = q('#bp-csv');
  var live = F.mode === 'RUN';
  var cells_ = [
    ['Advertised', batt && batt.p.adv ? batt.p.adv + ' mAh' : '--'],
    ['Measured', r ? r.cap.toFixed(0) + ' mAh' : '--'],
    ['Of claim', r && r.adv ? (r.cap / r.adv * 100).toFixed(0) + ' %' : '--'],
    ['Charge in', r ? r.chg.toFixed(0) + ' mAh' : '--'],
    ['Efficiency', r ? r.eff.toFixed(1) + ' %' : '--'],
    ['Test time', r ? fmtDur(r.dur) : (live ? fmtDur(T - F.t0) : '--')]
  ];
  var key = JSON.stringify(cells_) + F.mode + csvRows.length;
  if (key !== resKey) { resKey = key; box.innerHTML = cells_.map(function (c) { return '<div><span>' + c[0] + '</span><b>' + c[1] + '</b></div>'; }).join(''); }
  if (r && r.adv) {
    var pc = r.cap / r.adv * 100;
    ver.textContent = pc >= 90 ? 'This one actually delivers what it says on the label.' : pc >= 60 ? 'Honest-ish, but down on the label by ' + (100 - pc).toFixed(0) + '%.' : 'The label claims ' + r.adv + ' mAh. The profiler measured ' + r.cap.toFixed(0) + ' mAh, only ' + pc.toFixed(0) + '% of it.';
  } else ver.textContent = F.mode === 'FAULT' ? 'Test aborted: ' + F.msg + '.' : '';
  if (csvRows.length) { csv.hidden = false; csv.textContent = '/results.csv\n' + csvRows.join('\n'); } else csv.hidden = true;
}

/* ---------- chart ---------- */
var cctx = q('#bp-chart').getContext('2d');
function drawChart() {
  var W = 640, H = 300, pl = 44, pr = 40, pt = 14, pb = 26, w = W - pl - pr, h = H - pt - pb;
  cctx.clearRect(0, 0, W, H);
  var xmax = Math.max(600, chart.length ? chart[chart.length - 1].t : 0);
  var X = function (t) { return pl + t / xmax * w; };
  var Vy = function (v) { return pt + (1 - (clamp(v, 2.6, 4.4) - 2.6) / 1.8) * h; };
  var imax = Math.max(F.set.chg, F.set.dis, 500) * 1.15 / 1000;
  var Iy = function (i) { return pt + (1 - clamp(Math.abs(i) / imax, 0, 1)) * h; };
  cctx.font = '11px ui-monospace,Menlo,monospace'; cctx.lineWidth = 1;
  // phase bands
  for (var k = 0; k < chart.length - 1; k++) {
    var p = chart[k].p, c = p[0] === 'D' ? 'rgba(255,166,0,.09)' : p[0] === 'R' ? 'rgba(255,255,255,.04)' : 'rgba(0,255,100,.08)';
    cctx.fillStyle = c; cctx.fillRect(X(chart[k].t), pt, Math.max(1, X(chart[k + 1].t) - X(chart[k].t) + 0.5), h);
  }
  cctx.strokeStyle = 'rgba(255,255,255,.08)'; cctx.fillStyle = '#8da0b3';
  for (var v = 2.8; v <= 4.4; v += 0.4) { cctx.beginPath(); cctx.moveTo(pl, Vy(v)); cctx.lineTo(W - pr, Vy(v)); cctx.stroke(); cctx.textAlign = 'right'; cctx.fillText(v.toFixed(1) + 'V', pl - 6, Vy(v) + 4); }
  cctx.textAlign = 'left';
  for (var a = 0; a <= 4; a++) { var ia = imax * a / 4; cctx.fillText(ia.toFixed(1) + 'A', W - pr + 6, Iy(ia) + 4); }
  cctx.textAlign = 'center';
  var step_ = xmax > 18000 ? 7200 : xmax > 7200 ? 3600 : 600;
  for (var t = 0; t <= xmax; t += step_) cctx.fillText(step_ >= 3600 ? (t / 3600) + 'h' : (t / 60) + 'm', X(t), H - 8);
  if (chart.length < 2) { cctx.fillStyle = '#8da0b3'; cctx.fillText('Voltage and current plot here during a test', W / 2, H / 2); return; }
  function path(fn, col, dash) {
    cctx.beginPath(); cctx.strokeStyle = col; cctx.lineWidth = 2; cctx.setLineDash(dash || []);
    chart.forEach(function (s, i) { var x = X(s.t), y = fn(s); if (i) cctx.lineTo(x, y); else cctx.moveTo(x, y); });
    cctx.stroke(); cctx.setLineDash([]);
  }
  path(function (s) { return Vy(s.v); }, '#22d3ee');
  path(function (s) { return Iy(s.i); }, '#ffa600', [5, 4]);
  cctx.textAlign = 'left'; cctx.fillStyle = '#22d3ee'; cctx.fillText('V', pl + 6, pt + 12); cctx.fillStyle = '#ffa600'; cctx.fillText('I', pl + 22, pt + 12);
}

/* ---------- main loop ---------- */
var last = 0, drawAt = 0, visible = true, raf = 0;
function frame(now) {
  raf = requestAnimationFrame(frame);
  if (!last) last = now;
  var wall = Math.min(0.1, (now - last) / 1000); last = now;
  var n = Math.min(900, Math.floor(wall * speed + (frame.carry || 0)));
  frame.carry = (wall * speed + (frame.carry || 0)) - n;
  for (var i = 0; i < n; i++) step(1);
  var interval = Math.max(120, (F.mode === 'HOME' ? 500 : 1000) / speed * 1000 / 1000);
  if (now - drawAt >= interval) {
    drawAt = now; drawScreen(); updateUI(); if (isFull) drawChart();
  }
}
function run() { if (!raf && (visible || isFull) && !document.hidden) { last = 0; raf = requestAnimationFrame(frame); } }
function halt() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
if (window.IntersectionObserver) new IntersectionObserver(function (e) { visible = e[0].isIntersecting; (visible || isFull) ? run() : halt(); }, { rootMargin: '120px' }).observe(root);
document.addEventListener('visibilitychange', function () { document.hidden ? halt() : run(); });

speed = 600;
setTimeout(function () { layout(); step(0); drawScreen(); updateUI(); drawChart(); run(); }, 0);
root.__bp = { est: estimate, open: openFull, close: closeFull, press: press, connect: connectCell, power: setPower, setV: function (v) { pw.v = v; step(0); }, speed: function (s) { speed = s; }, F: function () { return F; }, sens: function () { return sens; }, results: function () { return results; }, csv: function () { return csvRows; }, T: function () { return T; }, th: function () { return th; } };
})();
