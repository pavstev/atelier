// The reload guard for a lazy chunk that fails to load (an old tab after a deploy, or offline). A
// plain function with its storage and the clock passed in, so a test needs no browser. The time of
// the last reload is kept in sessionStorage: one failure reloads the page, and a chunk that stays
// broken cannot reload it again for a minute, so a bad deploy never loops. Offline there is no
// reload (the browser would show its own error page instead of the app): the boundary shows its
// message. If the storage throws (private mode), nothing reloads.

/** The sessionStorage key of the time of the last reload. */
export const RELOAD_FLAG = "atelier-chunk-reload";

/** The least time, in ms, between two reloads for a failed chunk. */
export const RELOAD_GAP_MS = 60_000;

type Store = Pick<Storage, "getItem" | "setItem">;

/** Reloads unless this page was reloaded for a failed chunk less than `RELOAD_GAP_MS` ago. Returns true when it reloaded. */
export function reloadOnce(
	store: Store,
	reload: () => void,
	now = Date.now(),
): boolean {
	try {
		const last = Number(store.getItem(RELOAD_FLAG));
		if (last > 0 && now - last < RELOAD_GAP_MS) return false;
		store.setItem(RELOAD_FLAG, String(now));
	} catch {
		return false;
	}
	reload();
	return true;
}

/** The page's sessionStorage, or null when the browser refuses it. */
function session(): Store | null {
	try {
		return window.sessionStorage;
	} catch {
		return null;
	}
}

/** Wires the guard to `vite:preloadError`: reload (at most once a minute), but not while offline. */
export function guardChunkErrors() {
	window.addEventListener("vite:preloadError", (e) => {
		// the failed import is not thrown to the page: the boundary shows its message instead
		e.preventDefault();
		if (navigator.onLine === false) return;
		const store = session();
		if (store) reloadOnce(store, () => window.location.reload());
	});
}
