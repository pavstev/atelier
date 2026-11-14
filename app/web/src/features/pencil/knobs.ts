// The Pencil settings: their type, start values and the ranges the core accepts, and the reader that
// cleans a save. No React, no imports of the app, so a node test can load it.

/** What the Pencil base keeps: the look, the pencils and every knob. */
export type PencilLook = {
	/** 0 Tone, 1 Drawing, 2 Zones, 3 Hatch, 4 By pencil (`LABELS.pencilLook`). */
	look: number;
	/** The pencils the painter has, one bit each: bit 0 the 9B up to bit 7 the 4H (255 all). */
	mask: number;
	detail: number;
	/** 50 keeps the photo's key; more is lighter. */
	key: number;
	/** 50 keeps the photo's contrast. */
	contrast: number;
	/** The percent of the photo left as bare paper (the white point). */
	highlights: number;
	/** The most of the picture the darkest pencils may cover, in percent. */
	darks: number;
	/** 0 off. */
	local: number;
	/** The strength of the paper grain in Drawing and Hatch. */
	grain: number;
	/** 0 smooth, 1 medium, 2 rough. */
	paper: number;
	/** The stroke direction, in degrees. */
	angle: number;
	/** Hatch line spacing: 0 wide, 100 tight. */
	density: number;
	/** By pencil: how many pencils are drawn so far, from the lightest (1 up to 8). */
	step: number;
};

/** The start values, as the core's `Knobs::default` (By pencil starts at its first pencil). */
export const PENCIL_START: PencilLook = {
	look: 0,
	mask: 255,
	detail: 50,
	key: 50,
	contrast: 50,
	highlights: 1,
	darks: 20,
	local: 0,
	grain: 50,
	paper: 1,
	angle: 45,
	density: 50,
	step: 1,
};

/** The least and the most of each setting, as the core takes them (`render.rs`). */
export const PENCIL_RANGE: Record<keyof PencilLook, readonly [number, number]> =
	{
		look: [0, 4],
		mask: [1, 255],
		detail: [0, 100],
		key: [0, 100],
		contrast: [0, 100],
		highlights: [0, 25],
		darks: [0, 100],
		local: [0, 100],
		grain: [0, 100],
		paper: [0, 2],
		angle: [0, 179],
		density: [0, 100],
		step: [1, 8],
	};

/**
 * The Pencil settings read back from a save. A missing key, a wrong type, a number that is not whole
 * or one out of its range gets the start value, so an old save (before the knobs) loads with the start
 * values and a hand-edited one never reaches the core.
 */
export function cleanPencil(raw: unknown): PencilLook {
	const src: Record<string, unknown> =
		typeof raw === "object" && raw !== null && !Array.isArray(raw)
			? (raw as Record<string, unknown>)
			: {};
	const out = { ...PENCIL_START };
	for (const key of Object.keys(PENCIL_START) as (keyof PencilLook)[]) {
		const x = src[key];
		const [lo, hi] = PENCIL_RANGE[key];
		if (typeof x === "number" && Number.isInteger(x) && x >= lo && x <= hi)
			out[key] = x;
	}
	return out;
}

/** The settings after Reset: every knob at its start, the look and the pencils kept. */
export function resetKnobs(p: PencilLook): PencilLook {
	return { ...PENCIL_START, look: p.look, mask: p.mask };
}
