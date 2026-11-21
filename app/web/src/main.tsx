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

registerSw();
guardChunkErrors();

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");
createRoot(root).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
