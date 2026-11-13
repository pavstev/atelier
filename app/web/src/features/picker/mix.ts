// The paint recipe of a color: how much white, yellow, red, lake blue, phthalo blue and black to
// mix to match it. The prediction is spectral. Each paint is a spectrum and a tinting strength
// (`paints.ts`); a mix adds the absorption K and the scattering S of the paints by share, finds the
// light the layer gives back with the Kubelka-Munk law, adds the surface (Saunderson), and turns
// that spectrum into a screen color under daylight D65 (`spectral.ts`). The search then looks for
// the shares whose color is closest to the wanted one by CIEDE2000, and prefers fewer paints.
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
};

/** The cost of using one more paint, in CIEDE2000 units. A paint is worth adding only when the
 * match gets better by more than this (1 is a just visible difference), so simple recipes win. */
const PER_PAINT = 1;
/** The first search puts the paints in steps of 1/GRID; the best few are then refined. */
const GRID = 10;
const KEEP = 3;

const N = BANDS.length;
const P = PAINTS.length;

/** K and S of each paint at each band, from its inside reflectance and its strength. */
const K = PAINTS.map((p) =>
	Float64Array.from(p.spectrum, (r) => ksOf(r) * p.strength),
);
const S = PAINTS.map((p) => Float64Array.from(p.spectrum, () => p.strength));

const spectrumBuf = new Float64Array(N);

/** The spectrum, seen from outside, of a mix with these shares. */
function spectrumOf(w: readonly number[]): Float64Array {
	for (let b = 0; b < N; b++) {
		let k = 0;
		let s = 0;
		for (let i = 0; i < P; i++) {
			const wi = w[i] as number;
			if (wi === 0) continue;
			k += wi * ((K[i] as Float64Array)[b] as number);
			s += wi * ((S[i] as Float64Array)[b] as number);
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

const cache = new Map<string, Mix>();
const CACHE_MAX = 400;

/** The best recipe for a color. The same color gives the same answer. */
export function mixFor(rgb: Rgb): Mix {
	const key = rgb.join(",");
	const hit = cache.get(key);
	if (hit) return hit;

	const want = labOfRgb(rgb);
	const error = (w: readonly number[]) => deltaE2000(labOfMix(w), want);
	const count = (w: readonly number[]) => w.filter((x) => x > 1e-4).length;
	const total = (w: readonly number[]) => error(w) + PER_PAINT * count(w);

	/** Moves a small share from one allowed paint to another while the error falls, in finer steps. */
	const refine = (start: number[], allowed: readonly boolean[]) => {
		let w = start;
		let e = error(w);
		// strong colorants (black, phthalo) matter in shares of a tenth of a percent
		for (const step of [
			1 / 20,
			1 / 40,
			1 / 80,
			1 / 160,
			1 / 320,
			1 / 640,
			1 / 1280,
		]) {
			for (let round = 0; round < 100; round++) {
				let moved = false;
				for (let i = 0; i < P; i++)
					for (let j = 0; j < P; j++) {
						if (i === j || !allowed[j] || (w[i] as number) < step - 1e-9)
							continue;
						const next = [...w];
						next[i] = (next[i] as number) - step;
						next[j] = (next[j] as number) + step;
						const k = error(next);
						if (k < e - 1e-6) {
							e = k;
							w = next;
							moved = true;
						}
					}
				if (!moved) break;
			}
		}
		return w;
	};

	// 1. every recipe in steps of 1/GRID; keep the few with the least color error and the few with
	// the least cost, so a simple recipe is a start too (a gray starts as white and black)
	type Start = { w: number[]; e: number; c: number };
	const keep = (list: Start[], item: Start, by: "e" | "c") => {
		if (list.length < KEEP || item[by] < (list[list.length - 1] as Start)[by]) {
			list.push(item);
			list.sort((x, y) => x[by] - y[by]);
			if (list.length > KEEP) list.pop();
		}
	};
	const byError: Start[] = [];
	const byCost: Start[] = [];
	eachRecipe(GRID, (w) => {
		const e = error(w);
		const item = { w: [...w], e, c: e + PER_PAINT * count(w) };
		keep(byError, item, "e");
		keep(byCost, item, "c");
	});
	const starts = [...byError, ...byCost.filter((x) => !byError.includes(x))];

	// 2. polish each with all paints, then take paints away while a simpler recipe costs less
	// than the color it loses (`PER_PAINT` is what one more paint costs)
	let best: number[] = starts[0]?.w ?? [1, 0, 0, 0, 0, 0];
	let bestCost = Number.POSITIVE_INFINITY;
	for (const start of starts) {
		const allowed = new Array<boolean>(P).fill(true);
		let w = refine(start.w, allowed);
		for (;;) {
			const here = total(w);
			if (here < bestCost) {
				bestCost = here;
				best = w;
			}
			// try each paint in use, smallest share first, as the one to leave out
			let better: number[] | null = null;
			const order = w
				.map((x, i) => [x, i] as const)
				.filter(([x]) => x > 1e-4)
				.sort((a, b) => a[0] - b[0]);
			if (order.length <= 1) break;
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
				const cut = refine(moved, rest);
				if (
					total(cut) < here - 1e-6 &&
					(!better || total(cut) < total(better))
				) {
					better = cut;
					for (let j = 0; j < P; j++) allowed[j] = rest[j] as boolean;
					break;
				}
			}
			if (!better) break;
			w = better;
		}
	}

	// 3. say what the recipe makes; a strong colorant in a touch (a few percent) really matters
	const weights = best;
	const mix: Mix = {
		weights,
		parts: toParts(weights),
		result: rgbOfMix(weights),
		error: error(weights),
	};
	if (cache.size >= CACHE_MAX) cache.clear();
	cache.set(key, mix);
	return mix;
}
