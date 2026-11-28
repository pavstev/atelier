// Entry point: mounts the app. Hero UI v3 needs no Provider. It also deletes the face model caches
// that older versions left in the browser (over 300 MB); the app has no models any more, and it
// reloads the page once when a lazy chunk fails to load (`pwa/reloadOnce.ts`).
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { registerSw } from "./pwa/register";
import { guardChunkErrors } from "./pwa/reloadOnce";
import "@/styles/index.css";

/** The Cache Storage name prefix the face models used before 2026-11-07. */
const OLD_MODEL_CACHE = "atelier-models-v";

if ("caches" in window) {
	void caches
		.keys()
		.then((names) =>
			Promise.all(
				names
					.filter((n) => n.startsWith(OLD_MODEL_CACHE))
					.map((n) => caches.delete(n)),
			),
		)
		.catch(() => {});
}

// In the Mac app (Tauri) the title bar is gone and the page draws up to the top edge (index.css).
if ("__TAURI_INTERNALS__" in window) {
	const root = document.documentElement;
	root.dataset.shell = "mac";
	// Full screen hides the window buttons, so the logo moves to the left (index.css). The window is
	// a notch shorter than the screen, hence the 40 px. That size guess is only the fallback: the real
	// state comes from Tauri (`app.withGlobalTauri`, permission `core:window:allow-is-fullscreen`).
	const guessFull = () =>
		innerWidth === screen.width && innerHeight >= screen.height - 40;
	const setFull = (on: boolean) => root.toggleAttribute("data-full", on);
	const syncFull = () => {
		const tauri = (
			window as unknown as {
				__TAURI__?: {
					window?: {
						getCurrentWindow?: () => { isFullscreen?: () => Promise<boolean> };
					};
				};
			}
		).__TAURI__;
		let asked: Promise<boolean> | undefined;
		try {
			asked = tauri?.window?.getCurrentWindow?.().isFullscreen?.();
		} catch {
			asked = undefined;
		}
		if (!asked) return setFull(guessFull());
		asked.then(
			(full) => setFull(typeof full === "boolean" ? full : guessFull()),
			() => setFull(guessFull()),
		);
	};
	addEventListener("resize", syncFull);
	syncFull();
}

registerSw();
guardChunkErrors();

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");
createRoot(root).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
