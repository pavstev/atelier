// The headless browser tests of the web app: Chromium only, 4 workers, every test on its own.
// One worker took 396 s, four took 116 s on the 10-core Mac (2026-11-01).
// The photos come from PHOTOS_DIR (see e2e/studio.ts). `mise run web:e2e` builds the wasm first.
import { Resolver } from "node:dns/promises";
import { defineConfig, devices } from "@playwright/test";

// URL: a site that is already running (the live site, for the smoke test). PREVIEW=1: the built
// app on `vite preview` with the Cloudflare headers. Otherwise the Vite dev server.
const preview = process.env.PREVIEW === "1";
const url =
	process.env.URL ??
	(preview ? "http://localhost:4173/" : "http://localhost:5173/");

// A live host is looked up at 1.1.1.1, not by this Mac: right after the first deploy the Mac may
// still hold a "no such host" answer for the new name.
const liveArgs: string[] = [];
if (process.env.URL) {
	const host = new URL(process.env.URL).hostname;
	const resolver = new Resolver();
	resolver.setServers(["1.1.1.1"]);
	const [ip] = await resolver.resolve4(host).catch(() => []);
	if (ip) liveArgs.push(`--host-resolver-rules=MAP ${host} ${ip}`);
}

export default defineConfig({
	testDir: "e2e",
	workers: 4,
	fullyParallel: true,
	timeout: 180_000,
	reporter: [["list"]],
	use: {
		baseURL: url,
		headless: true,
		launchOptions: { args: liveArgs },
	},
	projects: [
		{
			name: "chromium",
			use: {
				...devices["Desktop Chrome"],
				viewport: { width: 1440, height: 900 },
			},
		},
	],
	webServer: process.env.URL
		? undefined
		: {
				command: preview
					? "pnpm exec vite preview --port 4173 --strictPort"
					: "pnpm exec vite --port 5173 --strictPort",
				url,
				reuseExistingServer: true,
				timeout: 120_000,
			},
});
