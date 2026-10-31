/// <reference lib="dom" />
/**
 * eink-render.ts
 *
 * Turns a raw 400x300 1-bit pixel buffer (what your ESP32 draws on the
 * GDEY042T81) into a picture of what the real screen shows.
 *
 *   px[y * 400 + x]  1 = paper (white),  0 = ink (black)
 *
 * One ES module, Canvas 2D API only (no dependencies). Works with a browser
 * <canvas>/OffscreenCanvas and with @napi-rs/canvas in Node.
 *
 * Modes
 *   "screen"  the panel only. Output is exactly 400*scale x 300*scale.
 *             Every source pixel becomes a scale x scale block (nearest
 *             neighbour, no smoothing). Paper #dfdbd0, ink #141414.
 *   "device"  the panel inside the device mockup (peach backdrop, charcoal
 *             bezel, soft shadow, glass tint). Paper reads ~#c3c0bb and ink
 *             ~#3c3835 like the real photo.
 *
 * Everything is deterministic: the same input and options always give the
 * same bytes. The paper grain and ink-edge softening come from an integer hash
 * of the pixel position, never from Math.random().
 */

export const W = 400;
export const H = 300;

export type EinkMode = "screen" | "device";

export interface EinkOptions {
  /** Swap paper and ink (dark mode). Default false. */
  dark?: boolean;
  /**
   * Integer pixel size of one panel pixel. screen: output is 400*scale x
   * 300*scale (2 = 800x600). device: the panel window is exactly
   * 400*scale x 300*scale, and the whole mockup is sized to suit.
   * Default 2.
   */
  scale?: number;
  /** "screen" (default) or "device". */
  mode?: EinkMode;
  /**
   * device only: output width in px (height = width * 0.75). Overrides the
   * size implied by `scale`. The panel is then resampled nearest-neighbour by
   * a fractional factor, so source pixels are 2 or 3 px wide rather than all
   * identical. Use `scale` when you need exact integer blocks.
   */
  width?: number;
  /**
   * 0..1, strength of paper grain and ink-edge softening. Default 1.
   * 0 gives perfectly flat colours (byte-identical to a plain nearest-neighbour
   * upscale of the two panel colours).
   */
  texture?: number;
}

/** Any array-like of 120000 numbers: Uint8Array, Uint8ClampedArray, number[]. */
export type Pixels = ArrayLike<number>;

/** The bits of HTMLCanvasElement / OffscreenCanvas / @napi-rs/canvas we use. */
export interface CanvasLike {
  width: number;
  height: number;
  getContext(contextId: "2d"): CanvasRenderingContext2D | null;
}

type RGB = readonly [number, number, number];

// ---------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------

/** "screen" mode: matches the PNGs rendered earlier. */
export const SCREEN_PAPER: RGB = [0xdf, 0xdb, 0xd0]; // #dfdbd0
export const SCREEN_INK: RGB = [0x14, 0x14, 0x14]; // #141414

/** "device" mode: how the panel reads in the real photo. */
export const DEVICE_PAPER: RGB = [0xc3, 0xc0, 0xbb]; // #c3c0bb
export const DEVICE_INK: RGB = [0x3c, 0x38, 0x35]; // #3c3835

// ---------------------------------------------------------------------------
// Deterministic noise
// ---------------------------------------------------------------------------

/** Integer hash of (x, y, seed) -> [0, 1). Same inputs, same output, always. */
function hash2(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise in [-1, 1] with a lattice spacing of `cell` pixels. */
function lumpNoise(x: number, y: number, cell: number, seed: number): number {
  const gx = x / cell;
  const gy = y / cell;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  const top = a + (b - a) * sx;
  const bottom = c + (d - c) * sx;
  return (top + (bottom - top) * sy) * 2 - 1;
}

// ---------------------------------------------------------------------------
// Panel rasteriser (pure: no canvas, returns RGBA bytes)
// ---------------------------------------------------------------------------

export interface RasterOptions {
  paper: RGB;
  ink: RGB;
  /** 0..1 */
  texture: number;
}

/**
 * Rasterise the 400x300 buffer to outW x outH RGBA pixels.
 *
 * Source pixel for an output pixel is floor((o + 0.5) * 400 / outW). With an
 * integer scale that is exactly floor(o / scale): perfect square blocks.
 */
export function rasterize(px: Pixels, outW: number, outH: number, o: RasterOptions): Uint8ClampedArray {
  checkPixels(px);
  const out = new Uint8ClampedArray(outW * outH * 4);

  const sxOf = new Int32Array(outW);
  const syOf = new Int32Array(outH);
  for (let x = 0; x < outW; x++) sxOf[x] = Math.min(W - 1, Math.floor(((x + 0.5) * W) / outW));
  for (let y = 0; y < outH; y++) syOf[y] = Math.min(H - 1, Math.floor(((y + 0.5) * H) / outH));

  // first/last output column (row) of each source pixel's block
  const firstX = new Uint8Array(outW);
  const lastX = new Uint8Array(outW);
  const firstY = new Uint8Array(outH);
  const lastY = new Uint8Array(outH);
  for (let x = 0; x < outW; x++) {
    firstX[x] = x === 0 || sxOf[x - 1] !== sxOf[x] ? 1 : 0;
    lastX[x] = x === outW - 1 || sxOf[x + 1] !== sxOf[x] ? 1 : 0;
  }
  for (let y = 0; y < outH; y++) {
    firstY[y] = y === 0 || syOf[y - 1] !== syOf[y] ? 1 : 0;
    lastY[y] = y === outH - 1 || syOf[y + 1] !== syOf[y] ? 1 : 0;
  }

  const t = o.texture;
  const cell = 9; // grain lump size in output pixels
  const [pr, pg, pb] = o.paper;
  const [ir, ig, ib] = o.ink;

  let p = 0;
  for (let oy = 0; oy < outH; oy++) {
    const sy = syOf[oy];
    for (let ox = 0; ox < outW; ox++) {
      const sx = sxOf[ox];
      const i = sy * W + sx;
      const isPaper = px[i] > 0;

      let r = isPaper ? pr : ir;
      let g = isPaper ? pg : ig;
      let b = isPaper ? pb : ib;

      if (t > 0) {
        // Ink edges: the outermost output pixel of a block that borders the
        // opposite colour. Ink softens a little toward paper (particles don't
        // reach the very edge); paper gets a faint halo toward ink.
        let sides = 0;
        if (firstX[ox] && sx > 0 && px[i - 1] > 0 !== isPaper) sides++;
        if (lastX[ox] && sx < W - 1 && px[i + 1] > 0 !== isPaper) sides++;
        if (firstY[oy] && sy > 0 && px[i - W] > 0 !== isPaper) sides++;
        if (lastY[oy] && sy < H - 1 && px[i + W] > 0 !== isPaper) sides++;
        if (sides > 0) {
          const m = (isPaper ? 0.022 : 0.05) * sides * t;
          if (isPaper) {
            r += (ir - r) * m;
            g += (ig - g) * m;
            b += (ib - b) * m;
          } else {
            r += (pr - r) * m;
            g += (pg - g) * m;
            b += (pb - b) * m;
          }
        }

        // Paper grain: fine speckle plus very soft lumps. Zero mean, so the
        // average colour stays on the palette value. Ink is quieter.
        const amp = isPaper ? 1 : 0.5;
        const fine = (hash2(ox, oy, 1) * 2 - 1) * 1.6;
        const lump = lumpNoise(ox, oy, cell, 2) * 1.4;
        const d = (fine + lump) * amp * t;
        r += d;
        g += d;
        b += d;
      }

      out[p++] = Math.round(r);
      out[p++] = Math.round(g);
      out[p++] = Math.round(b);
      out[p++] = 255;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Draw the panel into `canvas`. Resizes the canvas to the output size.
 *
 *   renderEink(canvas, px, { dark: false, scale: 2, mode: "screen" });
 */
export function renderEink(canvas: CanvasLike, px: Pixels, opts: EinkOptions = {}): void {
  checkPixels(px);
  const mode: EinkMode = opts.mode ?? "screen";
  if (mode !== "screen" && mode !== "device") throw new RangeError(`mode must be "screen" or "device"`);
  const dark = !!opts.dark;
  const texture = clamp(opts.texture ?? 1, 0, 1);

  if (mode === "screen") {
    const k = integerScale(opts.scale ?? 2);
    const outW = W * k;
    const outH = H * k;
    canvas.width = outW;
    canvas.height = outH;
    const ctx = need2d(canvas);
    const pal = palette(SCREEN_PAPER, SCREEN_INK, dark);
    putRGBA(ctx, rasterize(px, outW, outH, { ...pal, texture }), outW, outH, 0, 0);
    return;
  }

  drawDevice(canvas, px, opts, dark, texture);
}

// ---------------------------------------------------------------------------
// Device mockup
// ---------------------------------------------------------------------------

// Geometry of the reference 2000x1500 view.
const REF_W = 2000;
const REF_H = 1500;
const DEV = { x: 462, y: 232, w: 1535 - 462, h: 1270 - 232 };
const WIN = { x0: 513, y0: 350, x1: 1485, y1: 1082 };

function drawDevice(canvas: CanvasLike, px: Pixels, opts: EinkOptions, dark: boolean, texture: number): void {
  // Pick the scale factor f (reference px -> output px).
  let f: number;
  let k: number | null = null; // integer panel-pixel size when exact blocks are wanted
  if (opts.width !== undefined) {
    if (!(opts.width >= 16)) throw new RangeError("width must be a number >= 16");
    f = opts.width / REF_W;
  } else {
    k = integerScale(opts.scale ?? 2);
    f = (W * k) / (WIN.x1 - WIN.x0); // window becomes exactly 400k wide
  }
  const outW = Math.round(REF_W * f);
  const outH = Math.round(REF_H * f);
  canvas.width = outW;
  canvas.height = outH;
  const ctx = need2d(canvas);
  const R = (v: number): number => Math.round(v * f);

  const dx = R(DEV.x);
  const dy = R(DEV.y);
  const dw = R(DEV.x + DEV.w) - dx;
  const dh = R(DEV.y + DEV.h) - dy;
  const devR = 46 * f;

  // --- 1. peach backdrop + soft shadows (pixel maths, identical everywhere) -
  putRGBA(ctx, backdrop(outW, outH, f, dx, dy, dw, dh, devR), outW, outH, 0, 0);

  // --- 2. bezel body -------------------------------------------------------
  const bezel = ctx.createLinearGradient(0, dy, 0, dy + dh);
  bezel.addColorStop(0, "#2c2b2e");
  bezel.addColorStop(1, "#201f22");
  ctx.fillStyle = bezel;
  roundRectPath(ctx, dx, dy, dw, dh, devR);
  ctx.fill();

  // --- 3. the panel, with glass and lighting baked in ----------------------
  const wx = R(WIN.x0);
  const wy = R(WIN.y0);
  let ww: number;
  let wh: number;
  let rw: number; // raster size
  let rh: number;
  let top: number; // raster's row offset inside the window
  if (k !== null) {
    ww = W * k;
    wh = Math.max(H * k, R(WIN.y1) - wy);
    rw = W * k;
    rh = H * k;
    top = Math.floor((wh - rh) / 2);
  } else {
    ww = R(WIN.x1) - wx;
    wh = R(WIN.y1) - wy;
    rw = ww;
    rh = wh;
    top = 0;
  }
  const pal = palette(DEVICE_PAPER, DEVICE_INK, dark);
  const win = new Uint8ClampedArray(ww * wh * 4);
  for (let i = 0; i < ww * wh; i++) {
    win[i * 4] = pal.paper[0];
    win[i * 4 + 1] = pal.paper[1];
    win[i * 4 + 2] = pal.paper[2];
    win[i * 4 + 3] = 255;
  }
  const raster = rasterize(px, rw, rh, { ...pal, texture });
  for (let y = 0; y < rh; y++) {
    win.set(raster.subarray(y * rw * 4, (y + 1) * rw * 4), ((top + y) * ww) * 4);
  }
  const winR = 9 * f;
  applyGlass(win, ww, wh, f, winR);
  putRGBA(ctx, win, ww, wh, wx, wy);

  // putImageData ignores clipping, so redraw the bezel over the square window
  // corners to give the window its rounded corners back.
  ctx.save();
  ctx.beginPath();
  ctx.rect(wx - 2, wy - 2, ww + 4, wh + 4);
  ctx.clip();
  ctx.fillStyle = bezel;
  ctx.beginPath();
  addRoundRect(ctx, dx, dy, dw, dh, devR);
  addRoundRect(ctx, wx, wy, ww, wh, winR);
  ctx.fill("evenodd");
  ctx.restore();

  // --- 4. thin highlight on the bezel edge ---------------------------------
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = Math.max(1, 1.5 * f);
  roundRectPath(ctx, dx + 0.75 * f, dy + 0.75 * f, dw - 1.5 * f, dh - 1.5 * f, devR);
  ctx.stroke();
  ctx.restore();
}

// --- pixel-maths helpers for the mockup ------------------------------------
// Canvas shadowBlur, and stacks of very faint translucent layers, both render
// differently in Chromium and in Skia builds, so everything soft is computed
// here instead. Same input, same bytes, in any engine.

/** Signed distance from (px,py) to a rounded rectangle (negative inside). */
function sdfRoundRect(px: number, py: number, cx: number, cy: number, hw: number, hh: number, r: number): number {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  const ox = qx > 0 ? qx : 0;
  const oy = qy > 0 ? qy : 0;
  return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - r;
}

/** Complementary error function (Abramowitz & Stegun 7.1.26, error < 1.5e-7). */
function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * z);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const e = poly * Math.exp(-z * z);
  return x >= 0 ? e : 2 - e;
}

/** Coverage of a Gaussian-blurred edge at signed distance d (CSS blur = 2 sigma). */
function edgeCover(d: number, sigma: number): number {
  return 0.5 * erfc(d / (sigma * Math.SQRT2));
}

const BACKDROP_STOPS: ReadonlyArray<readonly [number, RGB]> = [
  [0, [0x93, 0x5f, 0x49]], // top middle
  [0.5, [0xa4, 0x6e, 0x56]], // middle left
  [0.78, [0xd4, 0xa6, 0x8e]],
  [1, [0xf3, 0xd8, 0xc5]], // pale peach at the bottom
];

let backdropCache: { key: string; data: Uint8ClampedArray } | null = null;

function backdrop(outW: number, outH: number, f: number, dx: number, dy: number, dw: number, dh: number, devR: number): Uint8ClampedArray {
  const key = `${outW}x${outH}@${f.toFixed(6)}`;
  if (backdropCache && backdropCache.key === key) return backdropCache.data;

  const data = new Uint8ClampedArray(outW * outH * 4);
  const cx = dx + dw / 2;
  const cy = dy + dh / 2;
  const hw = dw / 2;
  const hh = dh / 2;
  // two shadows (CSS-style: blur radius B means sigma = B / 2)
  const shadows = [
    { off: 46 * f, sigma: 40 * f, alpha: 0.34, rgb: [60, 25, 12] as RGB },
    { off: 7 * f, sigma: 8 * f, alpha: 0.3, rgb: [50, 20, 10] as RGB },
  ];
  const reach = 3.2;
  const cornerR = 0.35 * outW;

  let p = 0;
  for (let y = 0; y < outH; y++) {
    const v = (y + 0.5) / outH;
    // vertical gradient
    let i = 0;
    while (i < BACKDROP_STOPS.length - 2 && v > BACKDROP_STOPS[i + 1][0]) i++;
    const [v0, c0] = BACKDROP_STOPS[i];
    const [v1, c1] = BACKDROP_STOPS[i + 1];
    const u = clamp((v - v0) / (v1 - v0), 0, 1);
    const baseR = c0[0] + (c1[0] - c0[0]) * u;
    const baseG = c0[1] + (c1[1] - c0[1]) * u;
    const baseB = c0[2] + (c1[2] - c0[2]) * u;

    for (let x = 0; x < outW; x++) {
      let r = baseR;
      let g = baseG;
      let b = baseB;

      // darker top-left corner (#8c5842 there, #935f49 at the top middle)
      const dist = Math.sqrt((x + 0.5) * (x + 0.5) + (y + 0.5) * (y + 0.5));
      if (dist < cornerR) {
        const a = 0.08 * (1 - dist / cornerR);
        r += (60 - r) * a;
        g += (8 - g) * a;
        b += (0 - b) * a;
      }

      for (const s of shadows) {
        const py = y + 0.5 - s.off;
        const pxx = x + 0.5;
        if (Math.abs(pxx - cx) > hw + reach * s.sigma || Math.abs(py - cy) > hh + reach * s.sigma) continue;
        const a = s.alpha * edgeCover(sdfRoundRect(pxx, py, cx, cy, hw, hh, devR), s.sigma);
        r += (s.rgb[0] - r) * a;
        g += (s.rgb[1] - g) * a;
        b += (s.rgb[2] - b) * a;
      }

      data[p++] = Math.round(r);
      data[p++] = Math.round(g);
      data[p++] = Math.round(b);
      data[p++] = 255;
    }
  }
  backdropCache = { key, data };
  return data;
}

/**
 * Glass and lighting over the panel (in place, window-sized RGBA buffer):
 * a slight cool-white tint toward the top-left, a slight darkening toward the
 * bottom-right (neutral in the middle, so paper/ink read as the photo's
 * #c3c0bb / #3c3835 there), and the shadow of the bezel falling on the glass.
 */
function applyGlass(win: Uint8ClampedArray, ww: number, wh: number, f: number, winR: number): void {
  const diag = ww * ww + wh * wh;
  const sigma = 7 * f;
  const cx = ww / 2;
  const cy = wh / 2 + 3 * f; // shadow falls a little heavier along the top
  let p = 0;
  for (let y = 0; y < wh; y++) {
    for (let x = 0; x < ww; x++) {
      let r = win[p];
      let g = win[p + 1];
      let b = win[p + 2];

      // tint along the diagonal
      const t = ((x + 0.5) * ww + (y + 0.5) * wh) / diag;
      if (t < 0.5) {
        const a = 0.075 * (1 - t / 0.5);
        r += (255 - r) * a;
        g += (255 - g) * a;
        b += (255 - b) * a;
      } else {
        const a = 0.05 * ((t - 0.5) / 0.5);
        r -= r * a;
        g -= g * a;
        b -= b * a;
      }

      // shadow of the surrounding bezel on the glass
      const d = sdfRoundRect(x + 0.5, y + 0.5, cx, cy, ww / 2, wh / 2, winR);
      if (d > -4 * sigma) {
        const a = 0.55 * edgeCover(-d, sigma);
        r -= r * a;
        g -= g * a;
        b -= b * a;
      }

      win[p] = Math.round(r);
      win[p + 1] = Math.round(g);
      win[p + 2] = Math.round(b);
      p += 4;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function checkPixels(px: Pixels): void {
  if (!px || px.length !== W * H) {
    throw new RangeError(`expected ${W * H} pixels (${W}x${H}), got ${px ? px.length : "none"}`);
  }
}

function integerScale(s: number): number {
  if (!Number.isInteger(s) || s < 1 || s > 16) throw new RangeError("scale must be an integer from 1 to 16");
  return s;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function palette(paper: RGB, ink: RGB, dark: boolean): { paper: RGB; ink: RGB } {
  return dark ? { paper: ink, ink: paper } : { paper, ink };
}

function need2d(canvas: CanvasLike): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("could not get a 2d context");
  return ctx;
}

function putRGBA(ctx: CanvasRenderingContext2D, rgba: Uint8ClampedArray, w: number, h: number, x: number, y: number): void {
  const img = ctx.createImageData(w, h);
  img.data.set(rgba);
  ctx.putImageData(img, x, y);
}

function addRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  if (w <= 0 || h <= 0) return; // a shrunk shadow layer can vanish
  // arcTo throws on a negative radius in browsers (Node's canvas just allows it)
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  addRoundRect(ctx, x, y, w, h, r);
}
