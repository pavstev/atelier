// What is drawn: the base, Edges and Grid with their knobs. The type, the start values, the ranges the
// core accepts and the cleaner of a save all come from one schema. No React, no `@/` imports, so a
// node test can load it.
import {
	custom,
	fallback,
	getFallbacks,
	type InferOutput,
	parse,
} from "valibot";
import { flag, group, hexColor, int, oneOf } from "../../lib/schema.ts";
import { pencilSchema } from "../pencil/knobs.ts";
import { GRID_CM } from "../size/paper.ts";

/** The least opacity a layer can have, in percent. */
export const OPACITY_MIN = 10;

/** The base: the bare photo, Values, Shapes, Paper (white, no photo), or Pencil (a graphite study;
 * Edges is off while it is the base). */
export const BASES = [
	{ id: "photo", label: "Photo" },
	{ id: "values", label: "Values" },
	{ id: "shapes", label: "Shapes" },
	{ id: "paper", label: "Paper" },
	{ id: "pencil", label: "Pencil" },
] as const;
type BaseKind = (typeof BASES)[number]["id"];

/** The modes of Edges, as the core numbers them (`LABELS.edgesMode` has the names in this order). */
export const EDGES_MODE = { lines: 0, transfer: 1, masses: 2 } as const;
/** The modes of Grid, as the core numbers them (`LABELS.gridMode` has the names in this order). */
export const GRID_MODE = { thirds: 0, grid: 1, both: 2 } as const;
/** What the Grid counts (`LABELS.gridUnit` has the names in this order). */
export const GRID_UNIT = { cells: 0, cm: 1 } as const;

/** The Grid cell counts across the width, in slider order (`CELL_STEPS` in `grid.rs`). */
export const GRID_CELLS: readonly number[] = [
	3, 4, 6, 8, 9, 10, 12, 18, 20, 24, 30, 40, 50,
];
/** The widest Grid line, in px at a long side of 2048 (`MAX_WIDTH` in `grid.rs`). */
export const GRID_WIDTH_MAX = 16;
/** A heavy Grid line closes a block of this many cells each way (`GROUPS` in `grid.rs`). */
export const GRID_GROUPS: readonly number[] = [2, 4];
/** The widest Edges line; 3 is the width before the knob (`EDGES_WIDTH_MAX` in `render.rs`). */
export const EDGES_WIDTH_MAX = 10;

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
		preset: int(1, 0, 5),
		detail: int(50, 0, 100),
		tint: int(0, 0, 1),
	}),
	shapes: group({ step: int(3, 0, 3), detail: int(50, 0, 100) }),
	pencil: pencilSchema,
	edges: group({
		on: flag(false),
		opacity,
		mode: int(EDGES_MODE.lines, EDGES_MODE.lines, EDGES_MODE.masses),
		amount: int(67, 0, 100),
		width: int(5, 1, EDGES_WIDTH_MAX),
		/** 0 the line widths of Lines as traced, 100 one width end to end. */
		even: int(50, 0, 100),
	}),
	grid: group({
		on: flag(false),
		opacity,
		mode: int(GRID_MODE.both, GRID_MODE.thirds, GRID_MODE.both),
		/** One of `GRID_CELLS`, the steps the core takes. */
		cells: oneOf(GRID_CELLS, 6),
		/** What the Grid counts: `GRID_UNIT.cells` or `GRID_UNIT.cm` (a step in whole cm on the paper). */
		unit: int(GRID_UNIT.cells, GRID_UNIT.cells, GRID_UNIT.cm),
		/** The step in whole cm, one of `GRID_CM`; used when `unit` is cm. */
		cm: oneOf(GRID_CM, 5),
		width: int(2, 1, GRID_WIDTH_MAX),
		/** One of `GRID_GROUPS`. */
		group: oneOf(GRID_GROUPS, 2),
		/** The rows sit in the middle, the part row split between the top and the bottom. */
		center: flag(false),
		/** Contrast lines, or lines in `color`. */
		contrast: flag(true),
		/** One sRGB color as `#rrggbb`. */
		color: hexColor("#ffffff"),
	}),
});

/** What is drawn: the base, Edges and Grid, with their knobs. */
export type Look = InferOutput<typeof lookSchema>;

/** The start values, read from the schema. */
export const LOOK = getFallbacks(lookSchema) as unknown as Look;

/** The look read back from a save (`lookSchema`). */
export const cleanLook = (raw: unknown): Look => parse(lookSchema, raw);
