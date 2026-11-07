// Vite setup for the web app: React and Tailwind v4. The wasm is built into wasm/ first.
// `vite preview` sends the same headers as Cloudflare (the /* rule of public/_headers), so the
// built app can be checked against its Content-Security-Policy before a deploy.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** The headers of the `/*` block of public/_headers. */
function siteHeaders(): Record<string, string> {
	const headers: Record<string, string> = {};
	let inAll = false;
	for (const line of readFileSync("public/_headers", "utf8").split("\n")) {
		if (line.startsWith("#") || line.trim() === "") continue;
		if (!line.startsWith(" ") && !line.startsWith("\t")) {
			inAll = line.trim() === "/*";
			continue;
		}
		if (!inAll) continue;
		const at = line.indexOf(":");
		headers[line.slice(0, at).trim()] = line.slice(at + 1).trim();
	}
	return headers;
}

export default defineConfig({
	plugins: [react(), tailwindcss()],
	resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
	worker: { format: "es" },
	preview: { headers: siteHeaders() },
});
