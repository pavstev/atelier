// What is drawn: the base and Grid with their knobs. The type, the start values, the ranges the
// core accepts and the cleaner of a save all come from one schema. No React, no `@/` imports, so a
// node test can load it.
import {
	custom,
	fallback,
	getFallbacks,
	type InferOutput,
	parse,
} from "valibot";
import { flag, group, int, oneOf } from "../../lib/schema.ts";
import { GRID_CM } from "../size/paper.ts";

/** The least opacity a layer can have, in percent. */
export const OPACITY_MIN = 10;

/** The base: the bare photo, Values or Shapes. */
export const BASES = [
	{ id: "photo", label: "Photo" },
	{ id: "values", label: "Values" },
	{ id: "shapes", label: "Shapes" },
] as const;
type BaseKind = (typeof BASES)[number]["id"];

const opacity = int(100, OPACITY_MIN, 100);

/**
 * The saved look. Each part that is missing, the wrong type or out of the range the core accepts
 * falls back to its start value, and unknown keys are dropped, so a stale or hand-edited save never
 * stops the app. Every count and percent is a whole number inside its range.
 */
const lookSchema = group({
	base: group({
		kind: fallback(
			custom<BaseKind>((x) => BASES.some((b) => b.id === x)),
			"photo",
		),
		opacity,
	}),
	values: group({
		preset: int(1, 0, 3),
		detail: int(50, 0, 100),
	}),
	shapes: group({ step: int(3, 0, 3), detail: int(50, 0, 100) }),
	grid: group({
		on: flag(false),
		opacity,
		/** The squares by cm on the paper: one of `GRID_CM`. */
		cm: oneOf(GRID_CM, 5),
	}),
});

/** What is drawn: the base and Grid, with their knobs. */
export type Look = InferOutput<typeof lookSchema>;

/** The start values, read from the schema. */
export const LOOK = getFallbacks(lookSchema) as unknown as Look;

/** The look read back from a save (`lookSchema`). */
export const cleanLook = (raw: unknown): Look => parse(lookSchema, raw);
