// The paint recipe of a color: how much white, yellow, red, blue and black to mix to match it.
// Paint mixes by taking light away, so the model is a weighted geometric mean of the paints in
// linear light (blue and yellow make green, not gray). It is an estimate: real tubes differ, so the
// PAINTS colors below are the knob. Change them to the tubes on your table.
// No photo data lives here, only one color in and one recipe out.

/** A color as sRGB, each channel 0 to 255. */
export type Rgb = readonly [number, number, number];

export type Paint = {
	id: "white" | "yellow" | "red" | "blue" | "black";
	name: string;
	/** The color of the tube, straight from the tube, sRGB. */
	rgb: Rgb;
};

/** The five paints, in the order the card lists them. */
export const PAINTS: readonly Paint[] = [
	{ id: "white", name: "White", rgb: [245, 243, 238] },
	{ id: "yellow", name: "Yellow", rgb: [250, 215, 20] },
	{ id: "red", name: "Red", rgb: [200, 25, 30] },
	{ id: "blue", name: "Blue", rgb: [25, 35, 140] },
	{ id: "black", name: "Black", rgb: [30, 28, 28] },
];

export type Mix = {
	/** The share of each paint (same order as PAINTS), 0 to 1, adding up to 1. */
	weights: number[];
	/** The same shares as small whole numbers, for a brush: 6, 2, 1, 0, 0. */
	parts: number[];
	/** The color the recipe makes, sRGB. */
	result: Rgb;
	/** CIE76 color difference between the wanted color and the result; under 3 is hard to see. */
	error: number;
};

/** A paint share below this is left out of the recipe (a pinch nobody can measure). */
const MIN_SHARE = 0.02;
/** The cost of using one more paint, in color-difference units: simple recipes win a near tie. */
const PER_PAINT = 1;
/** A linear channel never goes under this, so a zero (pure yellow has no blue) cannot flatten a mix. */
const FLOOR = 0.004;
/** The first search puts the paints in steps of 1/GRID, then it refines. */
const GRID = 20;

const lin = (c: number) => {
	const x = c / 255;
	return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
};
const enc = (x: number) => {
	const v = x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055;
	return Math.round(Math.min(1, Math.max(0, v)) * 255);
};

type Vec = readonly [number, number, number];

/** CIE L*a*b* of a linear-light color (D65). */
function lab([r, g, b]: Vec): Vec {
	const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
	const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
	const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
	const f = (t: number) =>
		t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116;
	const [fx, fy, fz] = [f(x), f(y), f(z)];
	return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const LOGS: Vec[] = PAINTS.map(
	(p) => p.rgb.map((c) => Math.log(Math.max(lin(c), FLOOR))) as unknown as Vec,
);

/** The linear-light color of a recipe: a weighted geometric mean of the paints. */
function blend(w: readonly number[]): Vec {
	let r = 0;
	let g = 0;
	let b = 0;
	for (let i = 0; i < w.length; i++) {
		const wi = w[i] as number;
		if (wi === 0) continue;
		const l = LOGS[i] as Vec;
		r += wi * l[0];
		g += wi * l[1];
		b += wi * l[2];
	}
	return [Math.exp(r), Math.exp(g), Math.exp(b)];
}

const distance = (a: Vec, b: Vec) =>
	Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

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

	const want = lab([lin(rgb[0]), lin(rgb[1]), lin(rgb[2])]);
	const cost = (w: readonly number[]) => {
		let used = 0;
		for (const x of w) if (x > 1e-4) used++;
		return distance(lab(blend(w)), want) + PER_PAINT * used;
	};

	// 1. every recipe in steps of 1/GRID
	let best: number[] = [1, 0, 0, 0, 0];
	let bestCost = Number.POSITIVE_INFINITY;
	const w = [0, 0, 0, 0, 0];
	for (let a = 0; a <= GRID; a++)
		for (let b = 0; b <= GRID - a; b++)
			for (let c = 0; c <= GRID - a - b; c++)
				for (let d = 0; d <= GRID - a - b - c; d++) {
					w[0] = a / GRID;
					w[1] = b / GRID;
					w[2] = c / GRID;
					w[3] = d / GRID;
					w[4] = (GRID - a - b - c - d) / GRID;
					const k = cost(w);
					if (k < bestCost) {
						bestCost = k;
						best = [...w];
					}
				}

	// 2. move a small share from one paint to another while it helps, in finer and finer steps
	for (const step of [1 / 40, 1 / 80, 1 / 160]) {
		for (let round = 0; round < 200; round++) {
			let moved = false;
			for (let i = 0; i < best.length; i++)
				for (let j = 0; j < best.length; j++) {
					if (i === j || (best[i] as number) < step - 1e-9) continue;
					const next = [...best];
					next[i] = (next[i] as number) - step;
					next[j] = (next[j] as number) + step;
					const k = cost(next);
					if (k < bestCost - 1e-6) {
						bestCost = k;
						best = next;
						moved = true;
					}
				}
			if (!moved) break;
		}
	}

	// 3. drop the pinches and say what the cleaned recipe makes
	const kept = best.map((x) => (x < MIN_SHARE ? 0 : x));
	const sum = kept.reduce((s, x) => s + x, 0) || 1;
	const weights = kept.map((x) => x / sum);
	const made = blend(weights);
	const mix: Mix = {
		weights,
		parts: toParts(weights),
		result: [enc(made[0]), enc(made[1]), enc(made[2])],
		error: distance(lab(made), want),
	};
	if (cache.size >= CACHE_MAX) cache.clear();
	cache.set(key, mix);
	return mix;
}
