// Tests for the web app manifest and the head of index.html: the install, file handler
// and launch fields, and the colors against the stage color in atelier-theme.css.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../../", import.meta.url);
const read = (f: string) => readFileSync(new URL(f, root), "utf8");
const manifest = JSON.parse(read("public/manifest.webmanifest"));

/** oklch to #rrggbb (sRGB, clipped), the same maths as scripts/brand.mjs. */
function hex(l: number, c: number, h: number): string {
	const a = c * Math.cos((h * Math.PI) / 180);
	const b = c * Math.sin((h * Math.PI) / 180);
	const l3 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m3 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s3 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
	const lin = [
		4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
		-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
		-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
	];
	return `#${lin
		.map((v) => {
			const x = Math.min(1, Math.max(0, v));
			const g = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
			return Math.round(g * 255)
				.toString(16)
				.padStart(2, "0");
		})
		.join("")}`;
}

test("test_manifest_fields", () => {
	assert.equal(manifest.name, "Atelier");
	assert.equal(manifest.short_name, "Atelier");
	assert.equal(manifest.id, "/");
	assert.equal(manifest.start_url, "/");
	assert.equal(manifest.scope, "/");
	assert.equal(manifest.display, "standalone");
});

test("test_display_override", () => {
	const d = manifest.display_override;
	assert.ok(Array.isArray(d));
	assert.equal(d[0], "window-controls-overlay");
	assert.equal(d.at(-1), "standalone");
});

test("colors are the stage color", () => {
	const m = [
		...read("src/styles/atelier-theme.css").matchAll(
			/--background:\s*oklch\(([^)]+)\)/g,
		),
	].at(-1);
	assert.ok(m);
	const [l, c, h] = m[1].split(/\s+/).map(Number);
	const stage = hex(l, c, h);
	assert.equal(manifest.background_color, stage);
	assert.equal(manifest.theme_color, stage);
	assert.match(
		read("index.html"),
		new RegExp(`name="theme-color" content="${stage}"`),
	);
});

test("icons", () => {
	const by = (src: string) =>
		manifest.icons.find((i: { src: string }) => i.src === src);
	assert.equal(by("/icon-192.png").sizes, "192x192");
	assert.equal(by("/icon-512.png").sizes, "512x512");
	assert.equal(by("/icon-maskable-512.png").purpose, "maskable");
	assert.equal(by("/icon-monochrome-512.png").purpose, "monochrome");
});

test("test_file_handlers", () => {
	const h = manifest.file_handlers[0];
	assert.equal(h.action, "/");
	assert.deepEqual(Object.keys(h.accept).sort(), [
		"image/jpeg",
		"image/png",
		"image/webp",
	]);
});

test("test_no_share_target", () => {
	assert.equal(manifest.share_target, undefined);
});

test("test_launch_handler", () => {
	assert.equal(manifest.launch_handler.client_mode, "focus-existing");
});

test("head and headers", () => {
	const html = read("index.html");
	assert.match(html, /rel="manifest" href="\/manifest.webmanifest"/);
	assert.match(html, /rel="apple-touch-icon" href="\/apple-touch-icon.png"/);
	assert.match(
		html,
		/apple-mobile-web-app-status-bar-style" content="black-translucent"/,
	);
	assert.match(html, /viewport-fit=cover/);
	const h = read("public/_headers");
	for (const p of ["/sw.js", "/index.html"]) {
		assert.match(h, new RegExp(`^${p}\\n  Cache-Control: no-cache`, "m"));
	}
	assert.match(
		h,
		/^\/manifest.webmanifest\n(?:.*\n)*? {2}Cache-Control: no-cache/m,
	);
	assert.match(h, /Content-Type: application\/manifest\+json/);
});
