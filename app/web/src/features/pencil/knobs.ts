// The Pencil settings: their type, start values and the ranges the core accepts, and the reader that
// cleans a save. No React, no `@/` imports, so a node test can load it.
import { parse } from "valibot";
import { group, int, oneOf } from "../../lib/schema.ts";

/**
 * Every Pencil setting once: its start value (as the core's `Knobs::default`; By pencil starts at its
 * first pencil) and the least and the most the core takes (`render.rs`). The type, the start values,
 * the ranges and the cleaner all come from this table.
 */
const KNOBS = {
	/** 0 Tone, 1 Drawing, 3 Hatch, 4 By pencil (`PENCIL_LOOKS`). 2 was Zones and is gone. */
	look: { start: 0, range: [0, 4] },
	/** The pencils the painter has, one bit each: bit 0 the 9B up to bit 7 the 4H (255 all). */
	mask: { start: 255, range: [1, 255] },
	detail: { start: 50, range: [0, 100] },
	/** 50 keeps the photo's key; more is lighter. */
	key: { start: 50, range: [0, 100] },
	/** 50 keeps the photo's contrast. */
	contrast: { start: 50, range: [0, 100] },
	/** The percent of the photo left as bare paper (the white point). */
	highlights: { start: 1, range: [0, 25] },
	/** The most of the picture the darkest pencils may cover, in percent. */
	darks: { start: 20, range: [0, 100] },
	/** 0 off. */
	local: { start: 0, range: [0, 100] },
	/** The strength of the paper grain in Drawing and Hatch. */
	grain: { start: 50, range: [0, 100] },
	/** 0 smooth, 1 medium, 2 rough. */
	paper: { start: 1, range: [0, 2] },
	/** The stroke direction, in degrees. */
	angle: { start: 45, range: [0, 179] },
	/** Hatch line spacing: 0 wide, 100 tight. */
	density: { start: 50, range: [0, 100] },
	/** By pencil: how many pencils are drawn so far, from the lightest (1 up to 8). */
	step: { start: 1, range: [1, 8] },
	/** A blending stump dragged along the stroke (Tone, Drawing, Hatch). 0 off. */
	smudge: { start: 0, range: [0, 100] },
	/** Kneaded-eraser streaks in the light tones (Tone, Drawing, Hatch). 0 off. */
	lift: { start: 0, range: [0, 100] },
	/** More crossed work in the darks (Drawing, Hatch). 0 off. */
	cross: { start: 0, range: [0, 100] },
} as const satisfies Record<
	string,
	{ start: number; range: readonly [number, number] }
>;

/** What the Pencil base keeps: the look, the pencils and every knob (`KNOBS` has what each is). */
export type PencilLook = { [K in keyof typeof KNOBS]: number };

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
/** The three knobs Auto sets, as one object. */
export type AutoKnobs = Record<(typeof AUTO_KEYS)[number], number>;
/** The three Auto knobs of `a` (a Pencil look, or what Auto found), and nothing else. */
export const pickAuto = (a: AutoKnobs): AutoKnobs => ({
	key: a.key,
	contrast: a.contrast,
	highlights: a.highlights,
});

const KEYS = Object.keys(KNOBS) as (keyof PencilLook)[];
/** One value per setting, made from its row of `KNOBS`. */
const perKnob = <T>(f: (k: (typeof KNOBS)[keyof PencilLook]) => T) =>
	Object.fromEntries(KEYS.map((key) => [key, f(KNOBS[key])])) as Record<
		keyof PencilLook,
		T
	>;

/** The start values, as the core's `Knobs::default` (By pencil starts at its first pencil). */
export const PENCIL_START: PencilLook = perKnob((k) => k.start);

/** The least and the most of each setting, as the core takes them (`render.rs`). */
export const PENCIL_RANGE: Record<keyof PencilLook, readonly [number, number]> =
	perKnob((k) => k.range);

/**
 * The saved Pencil settings. A missing key, a wrong type, a number that is not whole or one out of
 * its range gets the start value, so an old save (before the knobs) loads with the start values and a
 * hand-edited one never reaches the core. A look that is gone (2, Zones) or unknown falls back to Tone.
 */
export const pencilSchema = group({
	...perKnob((k) => int(k.start, k.range[0], k.range[1])),
	look: oneOf(
		PENCIL_LOOKS.map((l) => l.id),
		PENCIL_START.look,
	),
});

/** The Pencil settings read back from a save (`pencilSchema`). */
export const cleanPencil = (raw: unknown): PencilLook =>
	parse(pencilSchema, raw);

/** The settings after Reset: every knob at its start, the look and the pencils kept. */
export function resetKnobs(p: PencilLook): PencilLook {
	return { ...PENCIL_START, look: p.look, mask: p.mask };
}
