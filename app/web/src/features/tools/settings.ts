// The base, Edges and Grid switches, opacities and knobs, their start values, labels and the call each sends.
import type { Call, LayerId } from "@/draw/calls";
import { isRecord } from "@/lib/clean";
import { KEYS, loadJson, loadText, usePersisted } from "@/lib/storage";

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

/** The stacked layers, bottom first: the base (Values or Shapes), Edges and Grid. */
export const STAGE_IDS = ["base", "edges", "grid"] as const;
export type StageId = (typeof STAGE_IDS)[number];

/** The color of Paper. */
export const PAPER = "#ffffff";

/** The modes of Edges, as the core numbers them (`LABELS.edgesMode` has the names in this order). */
export const EDGES_MODE = { lines: 0, transfer: 1, masses: 2 } as const;
/** The modes of Grid, as the core numbers them (`LABELS.gridMode` has the names in this order). */
export const GRID_MODE = { thirds: 0, grid: 1, both: 2 } as const;

/** The side panel. It hides fully; its width can be dragged. */
const PANEL_IDS = ["left"] as const;
type PanelId = (typeof PANEL_IDS)[number];

/** The least and the most the side panel can be dragged to, in px. */
export const PANEL_MIN: Record<PanelId, number> = { left: 280 };
export const PANEL_MAX: Record<PanelId, number> = { left: 720 };

/** How the page is laid out. Saved apart from the look, so a panel drag never rewrites the knobs. */
export type Layout = {
	/** Whether the side panel is hidden (true). */
	panels: Record<PanelId, boolean>;
	/** The width of the side panel in px, between `PANEL_MIN` and `PANEL_MAX`. */
	widths: Record<PanelId, number>;
};

/** What is drawn: the base, Edges and Grid, with their knobs. */
export type Look = {
	base: { kind: BaseKind; opacity: number };
	values: { preset: number; detail: number; tint: number };
	shapes: { step: number; detail: number };
	pencil: {
		/** 0 the flat map of the zones, 1 the drawing with grain and hatching. */
		look: number;
		/** The pencils the painter has, one bit each: bit 0 the 9B up to bit 7 the 4H (255 all). */
		mask: number;
		detail: number;
	};
	edges: {
		on: boolean;
		opacity: number;
		mode: number;
		amount: number;
		width: number;
		/** 0 the line widths of Lines as traced, 100 one width end to end. */
		even: number;
	};
	grid: {
		on: boolean;
		opacity: number;
		mode: number;
		cells: number;
		width: number;
		group: number;
		/** The rows sit in the middle, the part row split between the top and the bottom. */
		center: boolean;
		/** Contrast lines, or lines in `color`. */
		contrast: boolean;
		/** One sRGB color as `#rrggbb`. */
		color: string;
	};
};

export const LAYOUT: Layout = {
	panels: { left: false },
	widths: { left: 300 },
};

export const LOOK: Look = {
	base: { kind: "photo", opacity: 100 },
	values: { preset: 1, detail: 50, tint: 0 },
	shapes: { step: 3, detail: 50 },
	pencil: { look: 0, mask: 255, detail: 50 },
	edges: {
		on: false,
		opacity: 100,
		mode: EDGES_MODE.lines,
		amount: 67,
		width: 5,
		even: 50,
	},
	grid: {
		on: false,
		opacity: 100,
		mode: GRID_MODE.both,
		cells: 6,
		width: 2,
		group: 2,
		center: false,
		contrast: true,
		color: "#ffffff",
	},
};

/** The Grid cell counts across the long side, in slider order (`CELL_STEPS` in `grid.rs`). */
export const GRID_CELLS: readonly number[] = [
	3, 4, 6, 8, 9, 10, 12, 18, 20, 24, 30, 40, 50,
];
/** The widest Grid line, in px at a long side of 2048 (`MAX_WIDTH` in `grid.rs`). */
export const GRID_WIDTH_MAX = 16;
/** A heavy Grid line closes a block of this many cells each way (`GROUPS` in `grid.rs`). */
export const GRID_GROUPS: readonly number[] = [2, 4];
/** The Grid color value that asks the core for Contrast lines (`CONTRAST` in `grid.rs`). */
const GRID_CONTRAST = 0x1000000;
/** A Contrast Grid line on Paper or Pencil: the dark Contrast line of the core (OKLab L 0.2), as on any light patch. */
const GRID_ON_PAPER = 0x1a1a1a;
/** The widest Edges line; 3 is the width before the knob (`EDGES_WIDTH_MAX` in `render.rs`). */
export const EDGES_WIDTH_MAX = 10;

/** Each key of `start` read from `v`; a missing or wrong-typed value falls back to the start. */
function pick<T extends object>(v: unknown, start: T): T {
	const src = isRecord(v) ? v : {};
	const out: Record<string, unknown> = {};
	for (const [k, d] of Object.entries(start)) {
		const x = src[k];
		out[k] =
			typeof x === typeof d && (typeof x !== "number" || Number.isFinite(x))
				? x
				: d;
	}
	return out as T;
}

/**
 * The look read back from `localStorage`: any part that is missing, the wrong type or out of the
 * range the core accepts falls back to its start value, and unknown keys are dropped, so a stale or
 * hand-edited save never stops the app.
 */
function cleanLook(raw: unknown): Look {
	const r = isRecord(raw) ? raw : {};
	const values = pick(r.values, LOOK.values);
	const shapes = pick(r.shapes, LOOK.shapes);
	const pencil = pick(r.pencil, LOOK.pencil);
	const edges = pick(r.edges, LOOK.edges);
	const base = pick(r.base, LOOK.base);
	if (!BASES.some((b) => b.id === base.kind)) base.kind = LOOK.base.kind;
	const grid = pick(r.grid, LOOK.grid);
	// Grid cells must be one of the steps the core takes.
	if (!GRID_CELLS.includes(grid.cells)) grid.cells = LOOK.grid.cells;
	if (!GRID_GROUPS.includes(grid.group)) grid.group = LOOK.grid.group;
	if (!/^#[0-9a-f]{6}$/i.test(grid.color)) grid.color = LOOK.grid.color;
	// Every count and percent must sit in the range the core accepts; else the start value.
	const fit = <T extends object>(
		o: T,
		d: T,
		key: keyof T,
		lo: number,
		hi: number,
	) => {
		const x = o[key] as number;
		if (!Number.isInteger(x) || x < lo || x > hi) o[key] = d[key];
	};
	fit(base, LOOK.base, "opacity", OPACITY_MIN, 100);
	fit(values, LOOK.values, "preset", 0, 5);
	fit(values, LOOK.values, "detail", 0, 100);
	fit(values, LOOK.values, "tint", 0, 1);
	fit(shapes, LOOK.shapes, "step", 0, 3);
	fit(shapes, LOOK.shapes, "detail", 0, 100);
	fit(pencil, LOOK.pencil, "look", 0, 2);
	fit(pencil, LOOK.pencil, "mask", 1, 255);
	fit(pencil, LOOK.pencil, "detail", 0, 100);
	fit(edges, LOOK.edges, "opacity", OPACITY_MIN, 100);
	fit(edges, LOOK.edges, "mode", EDGES_MODE.lines, EDGES_MODE.masses);
	fit(edges, LOOK.edges, "amount", 0, 100);
	fit(edges, LOOK.edges, "width", 1, EDGES_WIDTH_MAX);
	fit(edges, LOOK.edges, "even", 0, 100);
	fit(grid, LOOK.grid, "opacity", OPACITY_MIN, 100);
	fit(grid, LOOK.grid, "mode", GRID_MODE.thirds, GRID_MODE.both);
	fit(grid, LOOK.grid, "width", 1, GRID_WIDTH_MAX);
	return { base, values, shapes, pencil, edges, grid };
}

/** The saved layout, cleaned the same way: wrong types and out-of-range sizes give the start values. */
function cleanLayout(raw: unknown): Layout {
	const r = isRecord(raw) ? raw : {};
	const panels = pick(r.panels, LAYOUT.panels);
	const widths = pick(r.widths, LAYOUT.widths);
	for (const id of PANEL_IDS)
		widths[id] = Math.round(
			Math.min(PANEL_MAX[id], Math.max(PANEL_MIN[id], widths[id])),
		);
	// old saves may still hold `folds`; they are dropped here
	return { panels, widths };
}

export const LABELS = {
	valuesPreset: [
		"Notan",
		"Three",
		"Five",
		"Shadow family",
		"Light family",
		"Families",
	],
	shapesStep: ["1 Shadows", "2 Halftones", "3 Lights", "4 Accents"],
	valuesTint: ["Gray", "Umber"],
	pencilLook: ["Tone", "Drawing", "Zones"],
	edgesMode: ["Lines", "Transfer", "Masses"],
	gridMode: ["Thirds", "Grid", "Both"],
	gridGroup: ["2 × 2", "4 × 4"],
	gridPaint: ["Contrast", "One color"],
};

/** The call that draws layer `id` with its settings. */
export function callFor(id: LayerId, s: Look): Call {
	switch (id) {
		case "edges":
			return {
				layer: "edges",
				mode: s.edges.mode,
				amount: s.edges.amount,
				width: s.edges.width,
				even: s.edges.even,
			};
		case "shapes":
			return {
				layer: "shapes",
				step: s.shapes.step,
				detail: s.shapes.detail,
			};
		case "values":
			return {
				layer: "values",
				preset: s.values.preset,
				detail: s.values.detail,
				tint: s.values.tint,
			};
		case "pencil":
			return {
				layer: "pencil",
				look: s.pencil.look,
				mask: s.pencil.mask,
				detail: s.pencil.detail,
			};
		case "grid":
			return {
				layer: "grid",
				mode: s.grid.mode,
				cells: s.grid.cells,
				width: s.grid.width,
				group: s.grid.group,
				center: s.grid.center ? 1 : 0,
				color: !s.grid.contrast
					? Number.parseInt(s.grid.color.slice(1), 16)
					: s.base.kind === "paper" || s.base.kind === "pencil"
						? GRID_ON_PAPER
						: GRID_CONTRAST,
			};
	}
}

/** A window narrower than this is a phone: the panel is a drawer over the stage, not a column. */
export const NARROW = "(max-width: 767px)";

/** The saved look, or the start values. */
const readLook = (): Look => loadJson(KEYS.state, cleanLook);

/**
 * The saved layout, or the start values (on a phone the drawer starts closed). The first visit
 * after the layout got its own key still finds its fields in the look save: they are carried over once.
 */
const readLayout = (): Layout =>
	loadJson(KEYS.layout, cleanLayout, () => {
		const old = loadText(KEYS.state);
		if (old !== null)
			try {
				return cleanLayout(JSON.parse(old));
			} catch {
				// a broken look save: the start layout
			}
		return {
			...LAYOUT,
			panels: { left: window.matchMedia(NARROW).matches },
		};
	});

/** The look as state, kept saved (a slider drag is saved once it settles). The photos have their
 * own home in `features/photos/store/`. */
export const useLook = () => usePersisted(KEYS.state, readLook, 150);

/** The layout as state, kept saved in its own key. */
export const useLayout = () => usePersisted(KEYS.layout, readLayout, 150);
