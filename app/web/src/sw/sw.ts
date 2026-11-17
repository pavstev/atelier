// The service worker: precaches the whole build, answers offline, takes shared photos, updates on a prompt.
import { routeOf, shareOutcome } from "./routes.ts";

declare const __PRECACHE__: string[];
declare const __VERSION__: string;
declare const self: ServiceWorkerGlobalScope;

const PREFIX = "atelier-shell-";
const SHELL = `${PREFIX}${__VERSION__}`;
const SHARE = "atelier-share";

self.addEventListener("install", (e) => {
	// A failed add fails the install, so the old worker stays.
	e.waitUntil(caches.open(SHELL).then((c) => c.addAll(__PRECACHE__)));
});

self.addEventListener("activate", (e) => {
	e.waitUntil(
		(async () => {
			for (const k of await caches.keys())
				if (k.startsWith(PREFIX) && k !== SHELL) await caches.delete(k);
			await self.clients.claim();
		})(),
	);
});

self.addEventListener("message", (e) => {
	if (e.data && e.data.type === "SKIP_WAITING") void self.skipWaiting();
});

async function share(req: Request): Promise<Response> {
	let ok = true;
	try {
		const c = await caches.open(SHARE);
		// Clear earlier shares first, so an unread one is not added again.
		const keys = (await c.keys()).map((k) => k.url);
		for (const k of shareOutcome(keys, true).del) await c.delete(k);
		const files = (await req.formData()).getAll("photos");
		let i = 0;
		for (const f of files) {
			if (typeof f === "string") continue;
			await c.put(
				`/shared/${i++}`,
				new Response(f, {
					headers: { "Content-Type": f.type || "application/octet-stream" },
				}),
			);
		}
	} catch {
		ok = false;
	}
	return Response.redirect(shareOutcome([], ok).to, 303);
}

self.addEventListener("fetch", (e) => {
	const r = e.request;
	const route = routeOf(
		r.method,
		r.url,
		r.mode,
		self.location.origin,
		__PRECACHE__,
	);
	if (route === "pass") return;
	if (route === "share") {
		e.respondWith(share(r));
		return;
	}
	const key = route === "shell" ? "/" : new URL(r.url).pathname;
	e.respondWith(
		caches.open(SHELL).then(async (c) => (await c.match(key)) ?? fetch(r)),
	);
});
