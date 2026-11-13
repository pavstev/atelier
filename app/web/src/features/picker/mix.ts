// The paint recipe of a color: how much white, yellow, red, lake blue, phthalo blue and black to
// mix to match it. The prediction is spectral. Each paint is a spectrum and a tinting strength
// (`paints.ts`); a mix adds the absorption K and the scattering S of the paints by share, finds the
// light the layer gives back with the Kubelka-Munk law, adds the surface (Saunderson), and turns
// that spectrum into a screen color under daylight D65 (`spectral.ts`). The search then looks for
// the shares whose color is closest to the wanted one by CIEDE2000, and prefers fewer paints.
// Skin is the one special case: it is mixed without black first (black turns skin gray), and a
// skin string gives a warm, a same and a cool mix of one lightness.
// One color goes in and one recipe comes out; no photo data lives here.
import { PAINTS, type PaintId } from "./paints";
import {
	BANDS,
	D65_WHITE,
	deltaE2000,
	ksOf,
	kubelkaMunk,
	type Lab,
	labOfRgb,
	labOfXyz,
	type Rgb,
	rgbOfXyz,
	surface,
	xyzOf,
} from "./spectral";

export type { PaintId };
export { PAINTS, type Rgb };

export type Mix = {
	/** The share of each paint (same order as PAINTS), 0 to 1, adding up to 1. */
	weights: number[];
	/** The same shares as small whole numbers, for a brush: 6, 2, 1, 0, 0, 0. A paint that is only a
	 * touch (a share too small for a whole part) has 0 here and a share above 0. */
	parts: number[];
	/** The color the recipe makes, sRGB. */
	result: Rgb;
	/** CIEDE2000 between the wanted color and the result. Under 1 cannot be seen; under 3 is a
	 * match for the eye in a side-by-side look. */
	error: number;
	/** The wanted color is skin-like, so it was mixed without black when that matches closely. */
	skin: boolean;
};

/** The cost of using one more paint, in CIEDE2000 units. A paint is worth adding only when the
 * match gets better by more than this (1 is a just visible difference), so simple recipes win. */
const PER_PAINT = 1;
/** The first search puts the paints in steps of 1/GRID; the best few are then refined. */
const GRID = 10;
const KEEP = 3;
/** A share above this counts as a paint in use. */
const USED = 1e-4;
/** The refine steps, coarse to fine. Strong colorants (black, phthalo) matter in shares of a tenth
 * of a percent. */
const STEPS = [1 / 20, 1 / 40, 1 / 80, 1 / 160, 1 / 320, 1 / 640, 1 / 1280];

const N = BANDS.length;
const P = PAINTS.length;

/** The absorption K of each paint at each band, from its inside reflectance and its strength. It is
 * laid out band by band (`K[b * P + i]`), so the sum over the paints of a band reads one run. */
const K = Float64Array.from({ length: N * P }, (_, n) => {
	const p = PAINTS[n % P] as (typeof PAINTS)[number];
	return ksOf(p.spectrum[Math.floor(n / P)] as number) * p.strength;
});
/** The scattering S of each paint: its strength, the same at every band. */
const S = PAINTS.map((p) => p.strength);

const spectrumBuf = new Float64Array(N);
const inMix = new Int8Array(P);

/** The spectrum, seen from outside, of a mix with these shares. The search calls this thousands
 * of times, so it sums only the paints in the mix, and S once for all bands. */
function spectrumOf(w: readonly number[]): Float64Array {
	let n = 0;
	let s = 0;
	for (let i = 0; i < P; i++) {
		const wi = w[i] as number;
		if (wi === 0) continue;
		inMix[n++] = i;
		s += wi * (S[i] as number);
	}
	for (let b = 0; b < N; b++) {
		let k = 0;
		for (let a = 0; a < n; a++) {
			const i = inMix[a] as number;
			k += (w[i] as number) * (K[b * P + i] as number);
		}
		spectrumBuf[b] = surface(kubelkaMunk(k, s));
	}
	return spectrumBuf;
}

/** What the eye sees is judged against the white of the table: the white paint on its own is the
 * brightest white, so it becomes the white of the screen (255, 255, 255). A photo has no fixed
 * exposure, so only this relative reading makes sense. */
const FACTOR = (() => {
	const white = xyzOf(spectrumOf(PAINTS.map((_, i) => (i === 0 ? 1 : 0))));
	return [0, 1, 2].map((k) => (D65_WHITE[k] as number) / (white[k] as number));
})();

const seen = (w: readonly number[]): Lab => {
	const xyz = xyzOf(spectrumOf(w));
	return [
		xyz[0] * (FACTOR[0] as number),
		xyz[1] * (FACTOR[1] as number),
		xyz[2] * (FACTOR[2] as number),
	];
};

/** The CIE L*a*b* color of a recipe. */
export const labOfMix = (w: readonly number[]): Lab => labOfXyz(seen(w));

/** The screen color of a recipe. */
export const rgbOfMix = (w: readonly number[]): Rgb => rgbOfXyz(seen(w));

/** The color a paint has on its own, for its dot on the card. */
export function masstone(i: number): Rgb {
	const only = Array.from({ length: P }, (_, j) => (j === i ? 1 : 0));
	return rgbOfMix(only);
}

/** The recipe in words: whole parts first, then a touch of any strong paint too small for a part.
 * It is never empty; a recipe with no words (it cannot happen, the parts always hold one) says
 * "white". */
export function recipeWords(mix: Mix): string {
	const name = (i: number) =>
		(PAINTS[i] as (typeof PAINTS)[number]).name.toLowerCase();
	const parts = mix.parts.flatMap((n, i) => (n > 0 ? [`${n} ${name(i)}`] : []));
	const touches = mix.parts.flatMap((n, i) =>
		n === 0 && (mix.weights[i] as number) >= 0.0003
			? [`a touch of ${name(i)}`]
			: [],
	);
	const words = [...parts, ...touches].join(", ");
	return words || "white";
}

/** Every recipe in steps of 1/n, handed to `visit`. */
function eachRecipe(n: number, visit: (w: number[]) => void) {
	const w = new Array<number>(P).fill(0);
	const walk = (i: number, left: number) => {
		if (i === P - 1) {
			w[i] = left / n;
			visit(w);
			return;
		}
		for (let a = 0; a <= left; a++) {
			w[i] = a / n;
			walk(i + 1, left - a);
		}
	};
	walk(0, n);
}

/** The shares as the smallest whole numbers that are close enough: 55%, 18%, 9% is 6, 2, 1. */
function toParts(w: readonly number[]): number[] {
	for (let total = 3; total <= 12; total++) {
		const parts = w.map((x) => Math.round(x * total));
		if (parts.every((n, i) => Math.abs(n / total - (w[i] as number)) < 0.045))
			return parts;
	}
	return w.map((x) => Math.round(x * 12));
}

const BLACK = PAINTS.findIndex((p) => p.id === "black");
/** A skin recipe is good enough without black when it is a close match to the eye. */
const SKIN_CLOSE = 3;

/** The skin window in CIE L*, chroma and hue (degrees): a warm hue (red to yellow-orange), a soft
 * chroma, not near white or black. It holds pale to very dark skin and the flush of a cheek. Teachers
 * mix such colors from the chromatic paints, because black turns skin gray and muddy. The ends are
 * wide on purpose: a color that falls in the window is tried without black first, and black still
 * comes in when that match is not close, so a window that is a little too wide costs nothing. */
export const SKIN = {
	lightness: [12, 97],
	chroma: [8, 50],
	hue: [15, 85],
} as const;

const within = (x: number, [lo, hi]: readonly [number, number]) =>
	x >= lo && x <= hi;

/** Is this a skin-like color? */
export function isSkin([l, a, b]: Lab): boolean {
	const hue = (Math.atan2(b, a) * 180) / Math.PI;
	return (
		within(l, SKIN.lightness) &&
		within(Math.hypot(a, b), SKIN.chroma) &&
		within(hue, SKIN.hue)
	);
}

/** Every recipe of the first search with the color it makes. It does not depend on the wanted
 * color, so it is made once and every search shares it. */
type Cell = { w: number[]; lab: Lab; paints: number };
let cells: Cell[] | null = null;
const grid = (): Cell[] => {
	if (!cells) {
		const made: Cell[] = [];
		eachRecipe(GRID, (w) =>
			made.push({ w: [...w], lab: labOfMix(w), paints: paintsIn(w) }),
		);
		cells = made;
	}
	return cells;
};

const paintsIn = (w: readonly number[]) => w.filter((x) => x > USED).length;

/** How far a recipe is from the wanted color. */
type Distance = (w: readonly number[]) => number;
const errorTo =
	(want: Lab): Distance =>
	(w) =>
		deltaE2000(labOfMix(w), want);
/** The error plus the cost of the paints in use. */
const costOf = (error: Distance, w: readonly number[]) =>
	error(w) + PER_PAINT * paintsIn(w);

/** Moves a small share from one paint to an allowed paint while the error falls, in finer steps. */
function refine(
	start: readonly number[],
	allowed: readonly boolean[],
	error: Distance,
): number[] {
	const w = [...start];
	let e = error(w);
	for (const step of STEPS) {
		for (let round = 0; round < 100; round++) {
			let moved = false;
			for (let i = 0; i < P; i++)
				for (let j = 0; j < P; j++) {
					if (i === j || !allowed[j] || (w[i] as number) < step - 1e-9)
						continue;
					const from = w[i] as number;
					const to = w[j] as number;
					w[i] = from - step;
					w[j] = to + step;
					const k = error(w);
					if (k < e - 1e-6) {
						e = k;
						moved = true;
					} else {
						w[i] = from;
						w[j] = to;
					}
				}
			if (!moved) break;
		}
	}
	return w;
}

type Start = { w: number[]; e: number; c: number };

/** The few best recipes of the grid by color error, and the few by cost, so a simple recipe is a
 * start too (a gray starts as white and black). A blocked paint is left out. */
function starts(want: Lab, blocked: readonly number[]): Start[] {
	const byError: Start[] = [];
	const byCost: Start[] = [];
	const fits = (list: Start[], x: number, by: "e" | "c") =>
		list.length < KEEP || x < (list[list.length - 1] as Start)[by];
	const keep = (list: Start[], item: Start, by: "e" | "c") => {
		list.push(item);
		list.sort((x, y) => x[by] - y[by]);
		if (list.length > KEEP) list.pop();
	};
	for (const cell of grid()) {
		if (blocked.some((i) => (cell.w[i] as number) > 0)) continue;
		const e = deltaE2000(cell.lab, want);
		const c = e + PER_PAINT * cell.paints;
		const byE = fits(byError, e, "e");
		const byC = fits(byCost, c, "c");
		if (!byE && !byC) continue;
		const item = { w: cell.w, e, c };
		if (byE) keep(byError, item, "e");
		if (byC) keep(byCost, item, "c");
	}
	return [...byError, ...byCost.filter((x) => !byError.includes(x))];
}

/** Polishes a start with the allowed paints, then takes paints away while a simpler recipe costs
 * less than the color it loses. Gives the recipe and its cost. */
function polish(
	start: readonly number[],
	blocked: readonly number[],
	error: Distance,
): { w: number[]; cost: number } {
	const allowed = PAINTS.map((_, i) => !blocked.includes(i));
	let w = refine(start, allowed, error);
	let cost = costOf(error, w);
	for (;;) {
		// try each paint in use, smallest share first, as the one to leave out
		const order = w
			.map((x, i) => [x, i] as const)
			.filter(([x]) => x > USED)
			.sort((a, b) => a[0] - b[0]);
		if (order.length <= 1) break;
		let next: { w: number[]; cost: number } | null = null;
		for (const [, i] of order) {
			const rest = allowed.map((a, j) => a && j !== i);
			const moved = [...w];
			const give = moved[i] as number;
			moved[i] = 0;
			// the share goes to the largest remaining paint, then the search settles it
			let big = -1;
			for (let j = 0; j < P; j++)
				if (
					rest[j] &&
					(big < 0 || (moved[j] as number) > (moved[big] as number))
				)
					big = j;
			moved[big] = (moved[big] as number) + give;
			const cut = refine(moved, rest, error);
			const c = costOf(error, cut);
			if (c < cost - 1e-6) {
				next = { w: cut, cost: c };
				for (let j = 0; j < P; j++) allowed[j] = rest[j] as boolean;
				break;
			}
		}
		if (!next) break;
		({ w, cost } = next);
	}
	return { w, cost };
}

/** The search itself: the best recipe for a color with the `blocked` paints left out. The wanted
 * color is a Lab color, so one outside the screen (a shifted skin tone) is not clipped first. */
function search(want: Lab, blocked: readonly number[], skin: boolean): Mix {
	const error = errorTo(want);
	let best: number[] = [1, 0, 0, 0, 0, 0];
	let bestCost = Number.POSITIVE_INFINITY;
	for (const start of starts(want, blocked)) {
		const { w, cost } = polish(start.w, blocked, error);
		if (cost < bestCost) {
			bestCost = cost;
			best = w;
		}
	}
	return {
		weights: best,
		parts: toParts(best),
		result: rgbOfMix(best),
		error: error(best),
		skin,
	};
}

/** The best recipe of a skin color: without black, and black only when that does not match
 * closely and black matches clearly better. */
function searchSkin(want: Lab): Mix {
	const clean = search(want, [BLACK], true);
	if (clean.error < SKIN_CLOSE) return clean;
	const full = search(want, [], true);
	return clean.error <= full.error + 1 ? clean : full;
}

/** A small memory for answers: the same color gives the same answer, and a mouse that moves over
 * a flat area asks for it again and again. The key is the color as one number. */
const CACHE_MAX = 400;
const keyOf = (rgb: Rgb) => rgb[0] * 65536 + rgb[1] * 256 + rgb[2];
function remember<T>(cache: Map<number, T>, rgb: Rgb, make: () => T): T {
	const key = keyOf(rgb);
	const hit = cache.get(key);
	if (hit) return hit;
	const made = make();
	if (cache.size >= CACHE_MAX) cache.clear();
	cache.set(key, made);
	return made;
}

const mixes = new Map<number, Mix>();
const strings = new Map<number, SkinString>();

/** The best recipe for a color. The same color gives the same answer. A skin-like color is mixed
 * without black first, and black comes in only when the match is not close without it. */
export function mixFor(rgb: Rgb): Mix {
	return remember(mixes, rgb, () => {
		const want = labOfRgb(rgb);
		return isSkin(want) ? searchSkin(want) : search(want, [], false);
	});
}

export type SkinString = { warm: Mix; same: Mix; cool: Mix };

/** Three mixes of one skin tone with the same lightness: a warmer, the same, and a cooler one.
 * A painter keeps one string of them on the palette and places them where the light turns. None
 * holds black. The shifted colors are searched as they are, so a tone near the edge of the screen
 * keeps its full shift and its lightness. */
export function skinString(rgb: Rgb): SkinString {
	return remember(strings, rgb, () => {
		const [l, a, b] = labOfRgb(rgb);
		const row = (da: number, db: number) =>
			search([l, a + da, b + db], [BLACK], true);
		return { warm: row(3, 4), same: row(0, 0), cool: row(-3, -5) };
	});
}
