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
		gallery: z.array(z.string()).default([]),
		// Aspect ratio (CSS aspect-ratio value) for the gallery images on this
		// project's page. Defaults to landscape; set to "3 / 4" for portrait
		// photos instead.
		galleryRatio: z.string().default("4 / 3"),
	}),
});

export const collections = { blog, projects };
