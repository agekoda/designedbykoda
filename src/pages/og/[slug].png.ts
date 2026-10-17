// Generates a 1200x630 social preview image for every project at build time
// (shown when a project link is pasted into Discord, X, iMessage, etc.).
// Nothing to upload: it uses the project's hero photo, title and tagline.
// Written to static PNG files during `astro build`.
export const prerender = true;

import fs from 'node:fs';
import path from 'node:path';
import satori from 'satori';
import sharp from 'sharp';
import { getCollection } from 'astro:content';

const W = 1200;
const H = 630;
const ROOT = process.cwd();

export async function getStaticPaths() {
	const projects = await getCollection('projects');
	return projects.map((p) => ({ params: { slug: p.id }, props: { project: p } }));
}

// Plain element helper so no JSX build step is needed.
const h = (type: string, style: Record<string, unknown>, children?: unknown) => ({
	type,
	props: { style: { display: 'flex', ...style }, children },
});

async function loadHero(heroImage?: string): Promise<string | null> {
	if (!heroImage) return null;
	const file = path.join(ROOT, 'public', heroImage.replace(/^\//, ''));
	if (!fs.existsSync(file)) return null;
	const buf = await sharp(file).resize(W, H, { fit: 'cover' }).jpeg({ quality: 82 }).toBuffer();
	return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

export async function GET({ props }: { props: { project: any } }) {
	const { title, tagline, category, status } = props.project.data;
	const hero = await loadHero(props.project.data.heroImage);

	const bold = fs.readFileSync(path.join(ROOT, 'public/fonts/atkinson-bold.woff'));
	const regular = fs.readFileSync(path.join(ROOT, 'public/fonts/atkinson-regular.woff'));

	const titleSize = title.length > 26 ? 66 : title.length > 16 ? 80 : 92;

	const tree = h(
		'div',
		{ width: W, height: H, position: 'relative', background: '#0a0a0a', color: '#f5f5f5' },
		[
			// Hero photo, filling the card.
			hero
				? {
						type: 'img',
						props: {
							src: hero,
							width: W,
							height: H,
							style: { position: 'absolute', top: 0, left: 0, width: W, height: H },
						},
					}
				: h('div', {
						position: 'absolute',
						top: 0,
						left: 0,
						width: W,
						height: H,
						background:
							'radial-gradient(circle at 85% 20%, rgba(90,160,220,0.35) 0%, rgba(10,10,10,0) 55%), linear-gradient(135deg, #14202e 0%, #0a0a0a 75%)',
					}),
			// Dark gradient so the text stays readable on any photo.
			h('div', {
				position: 'absolute',
				top: 0,
				left: 0,
				width: W,
				height: H,
				background:
					'linear-gradient(90deg, rgba(10,10,10,0.96) 0%, rgba(10,10,10,0.88) 42%, rgba(10,10,10,0.35) 100%)',
			}),
			// Text column.
			h(
				'div',
				{
					position: 'absolute',
					top: 0,
					left: 0,
					width: 760,
					height: H,
					flexDirection: 'column',
					padding: '64px 64px 56px 72px',
				},
				[
					h('div', { alignItems: 'center', gap: 14 }, [
						h(
							'div',
							{
								padding: '8px 20px',
								border: '2px solid #5aa0dc',
								borderRadius: 999,
								color: '#5aa0dc',
								fontSize: 24,
								fontWeight: 700,
								textTransform: 'uppercase',
								letterSpacing: 2,
							},
							category,
						),
						status === 'Upcoming'
							? h(
									'div',
									{
										padding: '8px 20px',
										border: '2px solid #707070',
										borderRadius: 999,
										color: '#a3a3a3',
										fontSize: 24,
										fontWeight: 700,
										textTransform: 'uppercase',
										letterSpacing: 2,
									},
									'Upcoming',
								)
							: h('div', {}, ''),
					]),
					h('div', { flexDirection: 'column', gap: 22, marginTop: 70 }, [
						h(
							'div',
							{ fontSize: titleSize, fontWeight: 700, lineHeight: 1.04, letterSpacing: -1.5 },
							title,
						),
						h(
							'div',
							{ fontSize: 34, lineHeight: 1.3, color: '#c8c8c8', fontWeight: 400 },
							tagline.length > 90 ? tagline.slice(0, 87).trimEnd() + '...' : tagline,
						),
					]),
				],
			),
			// Footer, pinned to the bottom-left.
			h(
				'div',
				{
					position: 'absolute',
					left: 72,
					bottom: 52,
					alignItems: 'center',
					gap: 12,
					fontSize: 28,
					fontWeight: 700,
					color: '#f5f5f5',
				},
				[
					h('div', { width: 14, height: 14, borderRadius: 7, background: '#5aa0dc' }, ''),
					h('div', {}, 'designedbykoda.com'),
				],
			),
		],
	);

	const svg = await satori(tree as any, {
		width: W,
		height: H,
		fonts: [
			{ name: 'Atkinson', data: regular, weight: 400, style: 'normal' },
			{ name: 'Atkinson', data: bold, weight: 700, style: 'normal' },
		],
	});

	const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
	return new Response(new Uint8Array(png), {
		headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' },
	});
}
