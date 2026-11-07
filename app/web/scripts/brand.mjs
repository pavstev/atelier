// Makes the whole brand kit from two path files, brand/mark.path (the script А) and brand/word.path
// ("telier"), and the colors in src/styles/atelier-theme.css. Writes brand/logo.svg (the big tile),
// brand/logo-small.svg (the favicon tile, a bigger and heavier letter), and into public/: favicon.svg,
// favicon.ico, the small PNG favicons, logo.svg, og.png (1200 x 630) and og-square.png (1200 x 1200).
// The in-app logo (src/ui/Logo.tsx) reads the same two path files, so the tile and the lockup are one
// mark. There is no web app manifest. Run: mise run web:brand. Notes: docs/design/brand.md.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { favicons } from "favicons";
import satori from "satori";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const brand = (f) => join(root, "brand", f);
const out = (f) => join(root, "public", f);
const font = (pkg, f) =>
	readFileSync(join(root, "node_modules/@fontsource", pkg, "files", f));

const TAGLINE = "Study a photo like a painter.";

// oklch to #rrggbb (sRGB, clipped). resvg and satori do not read oklch.
function hex(l, c, h) {
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

// The letter gradient is the dark theme's --logo-from and --logo-to: the last match in the CSS, since
// the dark block comes after the light one.
const css = readFileSync(join(root, "src/styles/atelier-theme.css"), "utf8");
function token(name) {
	const all = [
		...css.matchAll(new RegExp(`${name}:\\s*oklch\\(([^)]+)\\)`, "g")),
	];
	const m = all.at(-1);
	if (!m) throw new Error(`brand: ${name} not found in atelier-theme.css`);
	const [l, c, h] = m[1].split(/\s+/).map(Number);
	return hex(l, c, h);
}
const FROM = token("--logo-from");
const TO = token("--logo-to");
const INK = token("--snow");
const DIM = hex(0.78, 0.0128, 260);
// The graphite of the tile and the share card.
const TILE_TOP = hex(0.33, 0.014, 260);
const TILE_BOTTOM = hex(0.21, 0.01, 260);
const TILE_EDGE = hex(0.42, 0.012, 260);
const BG_TOP = hex(0.3, 0.012, 260);
const BG_BOTTOM = hex(0.18, 0.008, 260);

const MARK = readFileSync(brand("mark.path"), "utf8").trim();
const WORD = readFileSync(brand("word.path"), "utf8").trim();
// The glyph box, measured in headless Chromium (getBBox): x, y, width, height.
const [GX, GY, GW, GH] = [35.11826, 58.66939, 13.29268, 7.45066];
// The lockup box: the mark and "telier" at 20 px beside a 21 px mark.
const LOCKUP = [35, 58.6, 28.52, 7.65];

const gradient = (id, x1, y1, x2, y2, a, b) =>
	`<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;

// The tile: a graphite rounded square with the gradient letter in the middle.
function tile(scale, stroke) {
	const tx = (256 - (GX + GW / 2) * scale).toFixed(2);
	const ty = (256 - (GY + GH / 2) * scale).toFixed(2);
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Atelier">
  <title>Atelier</title>
  <defs>${gradient("a", 0, 0, 0.4, 1, TILE_TOP, TILE_BOTTOM)}${gradient("letter", 0.25, 0.067, 0.75, 0.933, FROM, TO)}</defs>
  <rect x="1" y="1" width="510" height="510" rx="116" fill="url(#a)" stroke="${TILE_EDGE}" stroke-width="2"/>
  <path transform="translate(${tx} ${ty}) scale(${scale})" fill="url(#letter)" stroke="url(#letter)" stroke-width="${stroke}" stroke-linejoin="round" d="${MARK}"/>
</svg>
`;
}

// The lockup for the share cards: the gradient letter and "telier" in the dim ink.
const lockup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LOCKUP.join(" ")}" role="img" aria-label="Atelier">
  <defs>${gradient("letter", 0.25, 0.067, 0.75, 0.933, FROM, TO)}</defs>
  <path fill="url(#letter)" stroke="url(#letter)" stroke-width="0.12" stroke-linejoin="round" d="${MARK}"/>
  <path fill="${INK}" opacity="0.7" d="${WORD}"/>
</svg>`;

writeFileSync(brand("logo.svg"), tile(25, 0.12));
writeFileSync(brand("logo-small.svg"), tile(30.694, 0.24));

mkdirSync(join(root, "public"), { recursive: true });

// Icons: favicon.ico and the small PNG sizes. The app is not installable (no manifest, no Android
// or Apple home screen icons).
const small = brand("logo-small.svg");
const icons = await favicons(small, {
	path: "/",
	appName: "Atelier",
	background: TILE_BOTTOM,
	icons: {
		android: false,
		appleIcon: false,
		appleStartup: false,
		favicons: ["favicon.ico", "favicon-16x16.png", "favicon-32x32.png"],
		windows: false,
		yandex: false,
	},
});
for (const f of [...icons.images, ...icons.files]) {
	writeFileSync(out(f.name), f.contents);
}
writeFileSync(out("favicon.svg"), readFileSync(small));
writeFileSync(out("logo.svg"), readFileSync(brand("logo.svg")));

// Share images: the lockup and the tagline on a graphite card. No domain in the picture.
const lockupUri = `data:image/svg+xml;base64,${Buffer.from(lockup).toString("base64")}`;
const fonts = [
	{
		name: "Inter",
		data: font("inter", "inter-latin-400-normal.woff"),
		weight: 400,
		style: "normal",
	},
];
const el = (type, style, children, props = {}) => ({
	type,
	props: { style, children, ...props },
});

function card(width, height) {
	const w = Math.round(width * 0.62);
	const h = Math.round((w * LOCKUP[3]) / LOCKUP[2]);
	return el(
		"div",
		{
			width,
			height,
			display: "flex",
			flexDirection: "column",
			alignItems: "center",
			justifyContent: "center",
			gap: Math.round(h * 0.45),
			backgroundImage: `linear-gradient(135deg, ${BG_TOP}, ${BG_BOTTOM})`,
		},
		[
			el("img", { width: w, height: h }, undefined, {
				src: lockupUri,
				width: w,
				height: h,
			}),
			el(
				"div",
				{
					fontFamily: "Inter",
					fontWeight: 400,
					fontSize: Math.round(width * 0.034),
					color: DIM,
				},
				TAGLINE,
			),
		],
	);
}

for (const [name, w, h] of [
	["og.png", 1200, 630],
	["og-square.png", 1200, 1200],
]) {
	const svg = await satori(card(w, h), { width: w, height: h, fonts });
	writeFileSync(
		out(name),
		new Resvg(svg, { fitTo: { mode: "width", value: w } }).render().asPng(),
	);
}
console.log(
	`brand: logo.svg, logo-small.svg, ${[...icons.images, ...icons.files].map((f) => f.name).join(", ")}, favicon.svg, og.png, og-square.png (letter ${FROM} to ${TO})`,
);
