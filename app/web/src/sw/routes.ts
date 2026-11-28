// Decides how the service worker answers a request: precache, shell or pass (network, untouched).

export function routeOf(
	method: string,
	url: string,
	mode: string,
	origin: string,
	list: string[],
): string {
	const u = new URL(url);
	if (u.origin !== origin) return "pass";
	if (method !== "GET") return "pass";
	if (list.includes(u.pathname)) return "precache";
	// Only a path with no file extension is an app page; /version.txt or /og.png is a file.
	const last = u.pathname.slice(u.pathname.lastIndexOf("/") + 1);
	if (mode === "navigate" && !last.includes(".")) return "shell";
	return "pass";
}
