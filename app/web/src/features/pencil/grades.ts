// The graphite pencils of the Pencil base: one list in the core's bit order, a short plain hint for
// each, the set a mask picks, and the level a color is nearest to. No React and no photo here.
import type { Rgb } from "@/draw/calls";
import { type Rgb as Color, labOfRgb } from "@/features/picker/spectral";

/** How hard to press: a pencil grade has one, bare paper has none. */
type Pressure = "light" | "medium" | "firm";

/** One pencil, or bare paper. */
export type Grade = {
	id: string;
	/** A few plain words for the legend and the picker card. */
	hint: string;
	/** `null` for bare paper: nothing is drawn. */
	pressure: Pressure | null;
};

/**
 * The pencils in the order of the bits of the core's `mask`: bit 0 is the 9B, bit 7 the 4H. So the
 * list runs from the darkest to the lightest. The hints follow what graphite makers teach: hard
 * grades give faint light tones, the middle grades the midtones, soft grades the darks.
 */
export const GRADES: readonly Grade[] = [
	{ id: "9B", hint: "darkest accents, soft grain", pressure: "firm" },
	{ id: "7B", hint: "deep accents only", pressure: "firm" },
	{ id: "5B", hint: "dark; close to the darkest", pressure: "firm" },
	{ id: "2B", hint: "darker midtone, smudges", pressure: "medium" },
	{ id: "HB", hint: "all-round midtone", pressure: "medium" },
	{ id: "H", hint: "light halftone", pressure: "light" },
	{ id: "3H", hint: "light tone, very light touch", pressure: "light" },
	{ id: "4H", hint: "faint, fine light tone", pressure: "light" },
];

/** Bare paper: the lightest level, always last. */
export const PAPER_GRADE: Grade = {
	id: "Paper",
	hint: "leave white or lift out",
	pressure: null,
};

/** Every pencil on: the mask of the core that selects all eight. */
export const ALL_PENCILS = 255;

/** The grades of `mask`, darkest first, then Paper: the order of the levels the core answers. */
export function gradesOf(mask: number): Grade[] {
	return [...GRADES.filter((_, bit) => (mask >> bit) & 1), PAPER_GRADE];
}

/** `mask` with the pencil at `bit` switched on or off. The last pencil stays on. */
export function maskWith(mask: number, bit: number, on: boolean): number {
	const next = on ? mask | (1 << bit) : mask & ~(1 << bit);
	return next === 0 ? mask : next;
}

/** The pressure in words, for the card and for the copy button. */
export const pressureWords = (g: Grade) =>
	g.pressure ? `${g.pressure} pressure` : "no pressure";

/** One level of the Pencil view: its grade, its flat tone and its share of the photo in percent. */
export type Level = { grade: Grade; tone: Rgb; share: number };

/**
 * The levels of a draw, darkest first. Null while the answer does not fit the set of pencils (a
 * new set is drawn, the old answer still shows).
 */
export function levelsOf(
	mask: number,
	tones: Rgb[] | null,
	shares: number[] | null,
): Level[] | null {
	const grades = gradesOf(mask);
	if (!tones || !shares) return null;
	if (tones.length !== grades.length || shares.length !== grades.length)
		return null;
	return grades.map((grade, i) => ({
		grade,
		tone: tones[i] as Rgb,
		share: shares[i] as number,
	}));
}

/**
 * The level whose tone is nearest in CIE L* to `color`. Only levels the photo uses count, so a
 * grain pixel never lands on a pencil that has no zone; with none used, all count.
 */
export function nearestLevel(color: Color, levels: Level[]): Level | null {
	const used = levels.filter((l) => l.share > 0);
	const pool = used.length > 0 ? used : levels;
	const l = labOfRgb(color)[0];
	let best: Level | null = null;
	let gap = Number.POSITIVE_INFINITY;
	for (const level of pool) {
		const d = Math.abs(labOfRgb(level.tone)[0] - l);
		if (d < gap) {
			best = level;
			gap = d;
		}
	}
	return best;
}

/** How the grade of a spot reads, for the copy button and a screen reader: "2B, medium pressure". */
export const gradeWords = (g: Grade) => `${g.id}, ${pressureWords(g)}`;
