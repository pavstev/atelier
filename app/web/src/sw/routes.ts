// Decides how the service worker answers a request: precache, shell, share or pass (network, untouched).

/** The cache that holds the photos of a share until the page takes them (`pwa/intake.ts`). */
export const SHARE_CACHE = "atelier-share";

export function routeOf(
	method: string,
	url: string,
	mode: string,
	origin: string,
	list: string[],
): string {
	const u = new URL(url);
	if (u.origin !== origin) return "pass";
	if (method === "POST") return u.pathname === "/share" ? "share" : "pass";
	if (method !== "GET") return "pass";
	if (list.includes(u.pathname)) return "precache";
	// Only a path with no file extension is an app page; /version.txt or /og.png is a file.
	const last = u.pathname.slice(u.pathname.lastIndexOf("/") + 1);
	if (mode === "navigate" && !last.includes(".")) return "shell";
	return "pass";
}

/** What a share does: the cache keys to delete first, and where to redirect (an error goes to "/"). */
export function shareOutcome(
	oldKeys: string[],
	ok: boolean,
): { del: string[]; to: string } {
	return { del: [...oldKeys], to: ok ? "/?shared=1" : "/" };
}
