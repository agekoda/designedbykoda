// Resizes + compresses every photo under public/images/projects/ in place,
// so full-resolution camera photos don't end up shipped straight to the
// browser at 4000px+ wide when they only ever display at a few hundred
// pixels on the page.
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

// Hero images are shown bigger (up to full column width), gallery photos
// (1.jpg, 2.jpg, ...) are shown smaller in a grid — so gallery gets a
// tighter cap. Both numbers give ~2x headroom over their largest real
// on-page display size, which covers retina screens without shipping
// unnecessary pixels.
const MAX_WIDTH_HERO = 1600;
const MAX_WIDTH_GALLERY = 1000;
const JPEG_QUALITY = 78;

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
	const isHero = path.basename(filePath).toLowerCase().startsWith('hero');
	const maxWidth = isHero ? MAX_WIDTH_HERO : MAX_WIDTH_GALLERY;
	const isPng = /\.png$/i.test(filePath);

	const before = (await stat(filePath)).size;
	const image = sharp(filePath);
	const metadata = await image.metadata();

	if (metadata.width && metadata.width <= maxWidth && before < 400 * 1024) {
		// Already small enough in both dimensions and file size — skip.
		return { filePath, skipped: true, before, after: before };
	}

	let pipeline = image.resize({ width: maxWidth, withoutEnlargement: true });
	pipeline = isPng
		? pipeline.png({ quality: JPEG_QUALITY, compressionLevel: 9 })
		: pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true });

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