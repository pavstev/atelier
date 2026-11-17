// The Pencil settings: their type, start values and the ranges the core accepts, and the reader that
// cleans a save. No React, no imports of the app, so a node test can load it.

/** What the Pencil base keeps: the look, the pencils and every knob. */
export type PencilLook = {
	/** 0 Tone, 1 Drawing, 3 Hatch, 4 By pencil (`PENCIL_LOOKS`). 2 was Zones and is gone. */
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
	/** A blending stump dragged along the stroke (Tone, Drawing, Hatch). 0 off. */
	smudge: number;
	/** Kneaded-eraser streaks in the light tones (Tone, Drawing, Hatch). 0 off. */
	lift: number;
	/** More crossed work in the darks (Drawing, Hatch). 0 off. */
	cross: number;
};

/** The looks of the Pencil base: the core's id, the name and one plain line of what it is for. */
export const PENCIL_LOOKS: readonly {
	id: number;
	label: string;
	hint: string;
}[] = [
	{
		id: 0,
		label: "Tone",
		hint: "Smooth gray tones. Good for judging the values.",
	},
	{
		id: 1,
		label: "Drawing",
		hint: "The tones with paper grain, like a pencil drawing.",
	},
	{
		id: 3,
		label: "Hatch",
		hint: "Lines that follow the form, crossed in the darks. The slowest look.",
	},
	{
		id: 4,
		label: "By pencil",
		hint: "The drawing built up one pencil at a time, lightest first.",
	},
];

/** The three knobs Auto sets. */
export const AUTO_KEYS = ["key", "contrast", "highlights"] as const;

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
	smudge: 0,
	lift: 0,
	cross: 0,
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
		smudge: [0, 100],
		lift: [0, 100],
		cross: [0, 100],
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
	// a look that is gone (2, Zones) or unknown falls back to Tone
	if (!PENCIL_LOOKS.some((l) => l.id === out.look))
		out.look = PENCIL_START.look;
	return out;
}

/** The settings after Reset: every knob at its start, the look and the pencils kept. */
export function resetKnobs(p: PencilLook): PencilLook {
	return { ...PENCIL_START, look: p.look, mask: p.mask };
}
