/**
 * render-eink-node.ts: write PNGs from raw 400x300 1-bit pixel files.
 *
 *   node render-eink-node.ts <input> <output.png> [options]
 *
 * <input> can be
 *   .json   an array of 120000 values (or { "px": [...] }), 1 = paper, 0 = ink
 *   .bin    120000 raw bytes, same layout
 *   .png    any 400x300 picture: the colour at the top-left pixel is treated as
 *           paper, the other colour as ink (handy for checking against renders)
 *
 * options
 *   --mode screen|device   default screen
 *   --dark                 swap paper and ink
 *   --scale N              integer panel-pixel size, default 2
 *   --width N              device only: output width in px (overrides --scale)
 *   --texture 0..1         grain / edge strength, default 1 (0 = flat colours)
 *
 * Needs Node 22.18+ (runs .ts directly) or `npx tsx render-eink-node.ts ...`,
 * plus `npm i @napi-rs/canvas`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { renderEink, W, H } from "../src/lib/eink/render.ts";
import type { CanvasLike, EinkOptions } from "../src/lib/eink/render.ts";

async function loadPixels(file: string): Promise<Uint8Array> {
  const lower = file.toLowerCase();

  if (lower.endsWith(".json")) {
    const data = JSON.parse(readFileSync(file, "utf8"));
    const arr: number[] = Array.isArray(data) ? data : data.px ?? data.pixels;
    if (!Array.isArray(arr)) throw new Error(`${file}: expected an array or { "px": [...] }`);
    return Uint8Array.from(arr);
  }

  if (lower.endsWith(".bin")) {
    const buf = readFileSync(file);
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  if (lower.endsWith(".png")) {
    const img = await loadImage(file);
    if (img.width !== W || img.height !== H) throw new Error(`${file}: expected ${W}x${H}, got ${img.width}x${img.height}`);
    const c = createCanvas(W, H);
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, W, H).data;
    const lum = (i: number): number => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const paperIsLight = lum(0) >= 128; // top-left pixel is paper
    const out = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) out[i] = lum(i * 4) >= 128 === paperIsLight ? 1 : 0;
    return out;
  }

  throw new Error(`${file}: use a .json, .bin or .png input`);
}

function parseArgs(argv: string[]): { input: string; output: string; opts: EinkOptions } {
  const pos: string[] = [];
  const opts: EinkOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dark") opts.dark = true;
    else if (a === "--mode") opts.mode = argv[++i] as EinkOptions["mode"];
    else if (a === "--scale") opts.scale = Number(argv[++i]);
    else if (a === "--width") opts.width = Number(argv[++i]);
    else if (a === "--texture") opts.texture = Number(argv[++i]);
    else if (a.startsWith("--")) throw new Error(`unknown option ${a}`);
    else pos.push(a);
  }
  if (pos.length !== 2) throw new Error("usage: node render-eink-node.ts <input.json|bin|png> <output.png> [--mode screen|device] [--dark] [--scale N] [--width N] [--texture 0..1]");
  return { input: pos[0], output: pos[1], opts };
}

async function main(): Promise<void> {
  const { input, output, opts } = parseArgs(process.argv.slice(2));
  const px = await loadPixels(input);
  const canvas = createCanvas(1, 1);
  renderEink(canvas as unknown as CanvasLike, px, opts);
  writeFileSync(output, canvas.toBuffer("image/png"));
  console.log(`${output}  ${canvas.width}x${canvas.height}  mode=${opts.mode ?? "screen"}${opts.dark ? " dark" : ""}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
