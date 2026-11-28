// The service worker: precaches the whole build, answers offline, and takes over by itself when a new build is cached.
import { routeOf } from "./routes.ts";

declare const __PRECACHE__: string[];
declare const __VERSION__: string;
declare const self: ServiceWorkerGlobalScope;

const PREFIX = "atelier-shell-";
const SHELL = `${PREFIX}${__VERSION__}`;

self.addEventListener("install", (e) => {
	// A failed add fails the install, so the old worker stays. Only a full cache skips the wait,
	// and the page reloads once when the new worker takes over.
	e.waitUntil(
		caches
			.open(SHELL)
			.then((c) => c.addAll(__PRECACHE__))
			.then(() => self.skipWaiting()),
	);
});

self.addEventListener("activate", (e) => {
	e.waitUntil(
		(async () => {
			// claim first: the old page may still need old chunks for a moment, so the old
			// cache goes only after the takeover
			await self.clients.claim();
			for (const k of await caches.keys())
				if (k.startsWith(PREFIX) && k !== SHELL) await caches.delete(k);
		})(),
	);
});

self.addEventListener("message", (e) => {
	if (e.data && e.data.type === "SKIP_WAITING") void self.skipWaiting();
});

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
	const key = route === "shell" ? "/" : new URL(r.url).pathname;
	e.respondWith(
		caches.open(SHELL).then(async (c) => (await c.match(key)) ?? fetch(r)),
	);
});
