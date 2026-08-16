// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";

import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
	site: "https://designedbykoda.com",
	// Short links for socials/bios — e.g. designedbykoda.com/power-puck
	// instead of the full designedbykoda.com/projects/smart-energy-meter-puck.
	// Left side is the short URL, right side is the real project page.
	// Add as many as you want here; each one just needs a rebuild + deploy
	// to go live.
	redirects: {
		"/powerpuck": "/projects/smart-energy-meter-puck",
	},
	integrations: [mdx(), sitemap()],
	adapter: cloudflare({
		platformProxy: {
			enabled: true,
		},
	}),
});
