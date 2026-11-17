// Registers the service worker (production only) and tells the page what happens: the browser
// offers an install, the app was installed. The page listens through a tiny store, so usePwa can
// read it. A new version applies by itself: the page looks for one on open, on return to the tab
// and every 30 minutes, and reloads once on controllerchange.

import { isBusy, onIdle } from "./busy.ts";
import type { PwaEvent, PwaState } from "./state.ts";
import { pwaReducer, START } from "./state.ts";

type Listener = () => void;

let state: PwaState = START;
let started = false;
let reloading = false;
type InstallEvent = Event & {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
let deferred: InstallEvent | null = null;
const listeners = new Set<Listener>();

/**
 * Reload on controllerchange only for an update (the page had a controller), only once, and not
 * while a photo is being saved (`busy`): then the reload waits for the save (see `registerSw`).
 */
export function shouldReload(
	hadController: boolean,
	alreadyReloaded: boolean,
	busy = false,
): boolean {
	return hadController && !alreadyReloaded && !busy;
}

export function send(e: PwaEvent): void {
	state = pwaReducer(state, e);
	for (const l of listeners) l();
}

export function subscribe(l: Listener): () => void {
	listeners.add(l);
	return () => {
		listeners.delete(l);
	};
}

export function getState(): PwaState {
	return state;
}

/** How often an open tab looks for a new version. */
export const CHECK_MS = 30 * 60 * 1000;

/**
 * Looks for a new version now, when the tab becomes visible, and on a timer. The new worker skips
 * the wait by itself, and the page reloads on controllerchange. A failed check (offline) is ignored.
 */
export function watchForUpdates(
	reg: { update: () => Promise<unknown> },
	doc: {
		visibilityState: string;
		addEventListener: (type: "visibilitychange", f: () => void) => void;
	},
	every: (f: () => void, ms: number) => unknown = setInterval,
): void {
	const check = () => {
		reg.update().catch(() => {});
	};
	check();
	every(check, CHECK_MS);
	doc.addEventListener("visibilitychange", () => {
		if (doc.visibilityState === "visible") check();
	});
}

/** Shows the browser's install prompt, when it offered one. */
export function promptInstall(): void {
	const d = deferred;
	if (!d) return;
	deferred = null;
	void d.prompt();
	d.userChoice
		.then((c) =>
			send({
				type: c.outcome === "accepted" ? "installed" : "installDismissed",
			}),
		)
		.catch(() => send({ type: "installDismissed" }));
}

export function registerSw(): void {
	if (started) return;
	started = true;
	const ua = navigator.userAgent;
	const ios =
		/iPad|iPhone|iPod/.test(ua) ||
		(navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
	const standalone =
		window.matchMedia("(display-mode: standalone)").matches ||
		(navigator as Navigator & { standalone?: boolean }).standalone === true;
	send({ type: "env", ios, standalone });

	window.addEventListener("beforeinstallprompt", (ev) => {
		ev.preventDefault();
		deferred = ev as InstallEvent;
		send({ type: "canInstall" });
	});
	window.addEventListener("appinstalled", () => send({ type: "installed" }));

	if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
	let hadController = navigator.serviceWorker.controller !== null;
	navigator.serviceWorker.addEventListener("controllerchange", () => {
		if (!shouldReload(hadController, reloading)) {
			// the first claim: later changes are updates
			hadController = true;
			return;
		}
		const reload = () => {
			if (reloading) return;
			reloading = true;
			location.reload();
		};
		// a save is running: reload when the last one ends
		if (shouldReload(hadController, reloading, isBusy())) reload();
		else if (!reloading) onIdle(reload);
	});
	navigator.serviceWorker
		.register("/sw.js", { scope: "/" })
		.then((reg) => watchForUpdates(reg, document))
		.catch(() => {});
}
