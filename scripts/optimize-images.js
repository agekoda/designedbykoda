// Resizes + compresses every photo under public/images/projects/ in place,
// so full-resolution camera photos and renders don't end up shipped straight
// to the browser at 4000px+ wide.
//
// This version favours sharpness over file size: high JPEG quality, full
// colour detail (no chroma subsampling, which is what makes small text and
// UI renders look smudgy), and a generous size cap so the images stay crisp
// on retina screens. PNGs are kept lossless.
//
// Run it any time after adding new photos:
//   node scripts/optimize-images.js
//
// Safe to run repeatedly — already-optimized images are skipped (it checks
// the actual pixel width, not just re-compresses everything every time).

import { readdir, stat, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const IMAGES_DIR = path.join(process.cwd(), 'public', 'images', 'projects');

// Longest side allowed, in pixels. Anything smaller is left alone, nothing is
// ever scaled up. Both leave plenty of headroom for 2x screens.
const MAX_SIDE_HERO = 2400;
const MAX_SIDE_GALLERY = 2400;
const JPEG_QUALITY = 92;
// Files already within the size cap and under this are not re-encoded at all,
// so running the script again never costs any more quality.
const SKIP_UNDER_BYTES = 2.5 * 1024 * 1024;

async function findImages(dir) {
	const entries = await readdir(dir, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await findImages(full)));
		} else if (/\.(jpe?g|png)$/i.test(entry.name)) {
			files.push(full);
		}
	}
	return files;
}

function formatKiB(bytes) {
	return `${(bytes / 1024).toFixed(1)} KiB`;
}

async function optimize(filePath) {
	const isHero = path.basename(filePath).toLowerCase().includes('hero');
	const maxSide = isHero ? MAX_SIDE_HERO : MAX_SIDE_GALLERY;
	const isPng = /\.png$/i.test(filePath);

	const before = (await stat(filePath)).size;
	const image = sharp(filePath);
	const metadata = await image.metadata();

	const longest = Math.max(metadata.width || 0, metadata.height || 0);
	if (longest <= maxSide && before < SKIP_UNDER_BYTES) {
		// Already small enough in both dimensions and file size — skip.
		return { filePath, skipped: true, before, after: before };
	}

	// rotate() applies the camera's orientation tag, so phone photos stay the
	// right way up after the metadata is dropped.
	let pipeline = image
		.rotate()
		.resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true });
	pipeline = isPng
		? pipeline.png({ compressionLevel: 9 })
		: pipeline.jpeg({ quality: JPEG_QUALITY, chromaSubsampling: '4:4:4', mozjpeg: true });

	const buffer = await pipeline.toBuffer();

	// Only overwrite if we actually made it smaller.
	// Write to a temp file and rename it over the original, rather than
	// writing directly back to the same path — on Windows, writing to a
	// file that sharp just read from can hit a file-lock error otherwise.
	if (buffer.length < before) {
		const tmpPath = `${filePath}.tmp`;
		await writeFile(tmpPath, buffer);
		await rename(tmpPath, filePath);
	}

	const after = (await stat(filePath)).size;
	return { filePath, skipped: false, before, after };
}

async function main() {
	let files;
	try {
		files = await findImages(IMAGES_DIR);
	} catch (err) {
		console.error(`Couldn't read ${IMAGES_DIR} — run this from the project root.`);
		process.exit(1);
	}

	if (files.length === 0) {
		console.log('No images found under public/images/projects/.');
		return;
	}

	let totalBefore = 0;
	let totalAfter = 0;
	let optimizedCount = 0;

	for (const file of files) {
		const result = await optimize(file);
		totalBefore += result.before;
		totalAfter += result.after;
		const rel = path.relative(process.cwd(), result.filePath);

		if (result.skipped) {
			console.log(`  skip   ${rel}  (already ${formatKiB(result.before)})`);
		} else {
			optimizedCount++;
			console.log(`  ${formatKiB(result.before).padStart(10)} -> ${formatKiB(result.after).padEnd(10)} ${rel}`);
		}
	}

	console.log('');
	console.log(`Optimized ${optimizedCount} of ${files.length} images.`);
	console.log(`Total: ${formatKiB(totalBefore)} -> ${formatKiB(totalAfter)} (saved ${formatKiB(totalBefore - totalAfter)})`);
}

main();