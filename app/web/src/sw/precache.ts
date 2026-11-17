// Pure helpers of the service worker build: which built files to precache, and the cache version.
import { createHash } from "node:crypto";

/** The URLs to precache, from the built file names (relative to dist/): sorted, no duplicates. */
export function precacheList(files: string[]): string[] {
	const urls = new Set<string>();
	for (const f of files) {
		const base = f.slice(f.lastIndexOf("/") + 1);
		if (
			/^og.*\.png$/.test(base) ||
			base === "_headers" ||
			f === "sw.js" ||
			f.endsWith(".map")
		)
			continue;
		urls.add(f === "index.html" ? "/" : `/${f}`);
	}
	return [...urls].sort();
}

/** First 12 hex of SHA-256 over the sorted names and each file's bytes. */
export function versionOf(entries: Array<[string, Uint8Array]>): string {
	const h = createHash("sha256");
	for (const [name, bytes] of [...entries].sort((a, b) =>
		a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
	)) {
		h.update(name);
		h.update("\0");
		h.update(bytes);
	}
	return h.digest("hex").slice(0, 12);
}
