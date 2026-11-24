// Color text helpers: CSS and hex strings, the ink (black or white) that reads on a color, and the
// Munsell value of a color. One home for the legend and the picker.
import { labOfRgb, type Rgb } from "./spectral.ts";

/** The CIE L* of each Munsell value V0 to V10. */
const MUNSELL_L = [
	0, 10.6, 20.5, 30.8, 41.2, 51.6, 61.7, 71.6, 81.3, 91.1, 100,
];

/** The brightness above which black ink reads better than white. */
const INK_LIMIT = 140;

/** `rgb(r, g, b)` for a CSS color. */
export const css = (t: readonly number[]) => `rgb(${t[0]}, ${t[1]}, ${t[2]})`;

/** `#rrggbb`. */
export const hex = (t: readonly number[]) =>
	`#${t.map((c) => c.toString(16).padStart(2, "0")).join("")}`;

/** Black or white, whichever reads on this color. */
export const ink = (t: readonly number[]): "#000" | "#fff" =>
	0.299 * (t[0] as number) +
		0.587 * (t[1] as number) +
		0.114 * (t[2] as number) >
	INK_LIMIT
		? "#000"
		: "#fff";

/** The Munsell value (0 to 10) of an sRGB color: the nearest L* in the table. */
export function munsellValue(t: readonly number[]): number {
	const l = labOfRgb(t as Rgb)[0];
	let best = 0;
	for (let v = 1; v < MUNSELL_L.length; v++) {
		if (
			Math.abs((MUNSELL_L[v] as number) - l) <
			Math.abs((MUNSELL_L[best] as number) - l)
		)
			best = v;
	}
	return best;
}
