// Vite plugin: after the app is built, lists dist/ and builds the service worker (sw.js) with the list inside.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build, type Plugin } from "vite";
import { precacheList, versionOf } from "../src/sw/precache.ts";

function walk(dir: string, base = ""): string[] {
	const out: string[] = [];
	for (const e of readdirSync(join(dir, base), { withFileTypes: true })) {
		const rel = base ? `${base}/${e.name}` : e.name;
		if (e.isDirectory()) out.push(...walk(dir, rel));
		else out.push(rel);
	}
	return out;
}

export function swPlugin(): Plugin {
	let command = "build";
	let outDir = "dist";
	return {
		name: "atelier-sw",
		apply: "build",
		configResolved(c) {
			command = c.command;
			outDir = join(c.root, c.build.outDir);
		},
		async closeBundle() {
			if (command !== "build") return;
			const list = precacheList(walk(outDir));
			const version = versionOf(
				list.map((u): [string, Uint8Array] => [
					u,
					readFileSync(join(outDir, u === "/" ? "index.html" : u.slice(1))),
				]),
			);
			await build({
				configFile: false,
				logLevel: "warn",
				build: {
					outDir,
					emptyOutDir: false,
					copyPublicDir: false,
					minify: true,
					lib: {
						entry: fileURLToPath(new URL("../src/sw/sw.ts", import.meta.url)),
						formats: ["iife"],
						name: "atelierSw",
						fileName: () => "sw.js",
					},
				},
				define: {
					__PRECACHE__: JSON.stringify(list),
					__VERSION__: JSON.stringify(version),
				},
			});
		},
	};
}
