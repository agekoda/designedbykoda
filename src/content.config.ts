import { glob } from "astro/loaders";
import { defineCollection } from "astro:content";
import { z } from "astro/zod";

const blog = defineCollection({
	// Load Markdown and MDX files in the `src/content/blog/` directory.
	loader: glob({ base: "./src/content/blog", pattern: "**/*.{md,mdx}" }),
	// Type-check frontmatter using a schema
	schema: z.object({
		title: z.string(),
		description: z.string(),
		// Transform string to Date object
		pubDate: z.coerce.date(),
		updatedDate: z.coerce.date().optional(),
		heroImage: z.string().optional(),
	}),
});

const projects = defineCollection({
	// Load Markdown and MDX files in the `src/content/projects/` directory.
	loader: glob({ base: "./src/content/projects", pattern: "**/*.{md,mdx}" }),
	schema: z.object({
		title: z.string(),
		tagline: z.string(),
		description: z.string(),
		category: z.enum(["RF & Wireless", "Smart Home", "Portable & Wearable"]),
		status: z.enum(["Complete", "Upcoming"]).default("Complete"),
		// Lower numbers show first.
		order: z.number().default(99),
		// These paths don't need to exist yet — the site falls back to a
		// placeholder automatically until a matching file is added.
		heroImage: z.string().optional(),
		// Optional .glb path for an interactive 3D model, shown instead of the
		// flat hero photo when present. Same placeholder convention as photos:
		// the path doesn't need to exist yet. Sits on the left of the hero.
		model: z.string().optional(),
		// Initial camera angle for the 3D model, as "azimuth polar radius"
		// (model-viewer's camera-orbit format). Defaults to a slightly
		// top-down angle in ProjectModel.astro if not set here.
		cameraOrbit: z.string().optional(),
		// Auto-rotate speed, e.g. "8deg/s" or "-8deg/s" for the other
		// direction. Defaults to ProjectModel.astro's own default if unset.
		rotationSpeed: z.string().optional(),
		// Small caption shown below the left model, left-aligned.
		modelCaption: z.string().optional(),
		// Optional second 3D model, shown on the right of the hero instead
		// of the left. Fully independent of the first — its own camera
		// angle and rotation speed, both optional with the same defaults.
		model2: z.string().optional(),
		cameraOrbit2: z.string().optional(),
		rotationSpeed2: z.string().optional(),
		// Small caption shown below the right model, right-aligned.
		model2Caption: z.string().optional(),
		gallery: z.array(z.string()).default([]),
		// Aspect ratio (CSS aspect-ratio value) for the gallery images on this
		// project's page. Defaults to landscape; set to "3 / 4" for portrait
		// photos instead.
		galleryRatio: z.string().default("4 / 3"),
		// Set to true to show an email waitlist signup form near the top of
		// this project's page. Optional custom label text for it.
		waitlist: z.boolean().default(false),
		waitlistLabel: z.string().optional(),
	}),
});

export const collections = { blog, projects };