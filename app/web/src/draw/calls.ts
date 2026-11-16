// One typed call per see-through layer, as the page sends it to the core in the worker.
export type LayerId = "edges" | "shapes" | "values" | "pencil" | "grid";

/** A color as red, green and blue, 0 to 255. */
export type Rgb = [number, number, number];

/** The knobs of a Pencil draw. The core reads them as one array of numbers (`pencilNumbers`). */
export type PencilKnobs = {
	detail: number;
	key: number;
	contrast: number;
	highlights: number;
	darks: number;
	local: number;
	grain: number;
	paper: number;
	angle: number;
	density: number;
	step: number;
	/** The effects, 0 off to 100. */
	smudge: number;
	lift: number;
	cross: number;
};

/** The Pencil knobs in the order the core reads them (`PENCIL_NUMBERS` in `render.rs`): detail, key,
 * contrast, highlights, darks, local, grain, paper, angle, density, step, smudge, lift, cross. */
export const pencilNumbers = (k: PencilKnobs): Float64Array =>
	Float64Array.of(
		k.detail,
		k.key,
		k.contrast,
		k.highlights,
		k.darks,
		k.local,
		k.grain,
		k.paper,
		k.angle,
		k.density,
		k.step,
		k.smudge,
		k.lift,
		k.cross,
	);

/** What Auto found in a photo: the three knob values it sets, and the numbers behind them. */
export type PencilAuto = {
	key: number;
	contrast: number;
	highlights: number;
	/** The middle tone of the photo, in CIE L*. */
	median: number;
	/** 0 low key, 1 mid key, 2 high key. */
	keyClass: number;
	/** The spread of the middle half of the tones, 0 to 1 of the range. */
	iqr: number;
	/** How two-humped the tones are, 0 to 1. */
	eta: number;
	/** The photo has two separate tone groups. */
	bimodal: boolean;
	/** The lightest tail is a thin spike (a glint). */
	spike: boolean;
};

/** The nine numbers of the core's Auto (`pencil_auto`): key, contrast, highlights, median L*, key
 * class, IQR, eta, bimodal 0 or 1, spike 0 or 1. */
export const PENCIL_AUTO_NUMBERS = 9;

/** Reads the answer of the core's Auto; null when it is not the nine numbers. */
export function pencilAutoOf(n: ArrayLike<number>): PencilAuto | null {
	if (n.length !== PENCIL_AUTO_NUMBERS) return null;
	const [
		key,
		contrast,
		highlights,
		median,
		keyClass,
		iqr,
		eta,
		bimodal,
		spike,
	] = Array.from(n) as [
		number,
		number,
		number,
		number,
		number,
		number,
		number,
		number,
		number,
	];
	return {
		key,
		contrast,
		highlights,
		median,
		keyClass,
		iqr,
		eta,
		bimodal: bimodal === 1,
		spike: spike === 1,
	};
}

export type Call =
	| {
			layer: "edges";
			mode: number;
			amount: number;
			width: number;
			even: number;
	  }
	| { layer: "shapes"; step: number; detail: number }
	| { layer: "values"; preset: number; detail: number; tint: number }
	| ({ layer: "pencil"; look: number; mask: number } & PencilKnobs)
	| {
			layer: "grid";
			mode: number;
			cells: number;
			width: number;
			group: number;
			center: number;
			color: number;
	  };
