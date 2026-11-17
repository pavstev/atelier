// Registers the service worker (production only) and tells the page what happens: an update waits,
// the browser offers an install, the app was installed. The page listens through a tiny store, so
// usePwa can read it. One reload on controllerchange, after the user accepted an update.

import type { PwaEvent, PwaState } from "./state.ts";
import { pwaReducer, START } from "./state.ts";

type Listener = () => void;

let state: PwaState = START;
let started = false;
let reloading = false;
let waiting: ServiceWorker | null = null;
type InstallEvent = Event & {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
let deferred: InstallEvent | null = null;
const listeners = new Set<Listener>();

/** Reload on controllerchange only for an update (the page had a controller), and only once. */
export function shouldReload(
	hadController: boolean,
	alreadyReloaded: boolean,
): boolean {
	return hadController && !alreadyReloaded;
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

/** Asks the waiting worker to take over. The page reloads on controllerchange. */
export function applyUpdate(): void {
	waiting?.postMessage({ type: "SKIP_WAITING" });
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

function watch(reg: ServiceWorkerRegistration): void {
	const check = (w: ServiceWorker | null) => {
		if (w && w.state === "installed" && navigator.serviceWorker.controller) {
			waiting = w;
			send({ type: "waiting" });
		}
	};
	if (reg.waiting) {
		waiting = reg.waiting;
		send({ type: "waiting" });
	}
	reg.addEventListener("updatefound", () => {
		const w = reg.installing;
		if (!w) return;
		w.addEventListener("statechange", () => check(w));
	});
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
		reloading = true;
		location.reload();
	});
	navigator.serviceWorker
		.register("/sw.js", { scope: "/" })
		.then(watch)
		.catch(() => {});
}
