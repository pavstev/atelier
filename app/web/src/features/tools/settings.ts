// The base, Edges and Grid switches, opacities and knobs, their start values, labels and the call each sends.
import { fallback, finite, number, parse, pipe, transform } from "valibot";
import type { Call, LayerId } from "@/draw/calls";
import { gridMilli } from "@/features/size/paper";
import { flag, group } from "@/lib/schema";
import { KEYS, loadJson, loadText, usePersisted } from "@/lib/storage";
import { cleanLook, GRID_UNIT, type Look } from "./look";

// The look itself (its type, start values, ranges and cleaner) lives in `look.ts`.
export {
	BASES,
	EDGES_MODE,
	EDGES_WIDTH_MAX,
	GRID_CELLS,
	GRID_GROUPS,
	GRID_MODE,
	GRID_UNIT,
	GRID_WIDTH_MAX,
	LOOK,
	type Look,
	OPACITY_MIN,
} from "./look";

/** The stacked layers, bottom first: the base (Values or Shapes), Edges and Grid. */
export const STAGE_IDS = ["base", "edges", "grid"] as const;
export type StageId = (typeof STAGE_IDS)[number];

/** The color of Paper. */
export const PAPER = "#ffffff";

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

/** What a state setter of the look or of the layout takes: a function from the old value to the new. */
export type SetLook = (f: (s: Look) => Look) => void;
export type SetLayout = (f: (s: Layout) => Layout) => void;

/** The picture of each stage layer (null while it is off or not drawn) with its opacity in percent. */
export type Layers = Record<
	StageId,
	{ image: ImageData; opacity: number } | null
>;

export const LAYOUT: Layout = {
	panels: { left: false },
	widths: { left: 300 },
};

/** The Grid color value that asks the core for Contrast lines (`CONTRAST` in `grid.rs`). */
const GRID_CONTRAST = 0x1000000;
/** A Contrast Grid line on Paper or Pencil: the dark Contrast line of the core (OKLab L 0.2), as on any light patch. */
const GRID_ON_PAPER = 0x1a1a1a;

/**
 * The saved layout, cleaned the same way as the look: a wrong type gives the start value, a size out
 * of range is pulled into it. Old saves may still hold `folds`; they are dropped here.
 */
const layoutSchema = group({
	panels: group({ left: flag(LAYOUT.panels.left) }),
	widths: group({
		left: fallback(
			pipe(
				number(),
				finite(),
				transform((w) =>
					Math.round(Math.min(PANEL_MAX.left, Math.max(PANEL_MIN.left, w))),
				),
			),
			LAYOUT.widths.left,
		),
	}),
});
const cleanLayout = (raw: unknown): Layout => parse(layoutSchema, raw);

export const LABELS = {
	valuesPreset: [
		"Notan",
		"Three",
		"Five",
		"Shadow family",
		"Light family",
		"Families",
	],
	shapesStep: ["Shadows", "Halftones", "Lights", "Accents"],
	valuesTint: ["Gray", "Umber"],
	pencilPaper: ["Smooth", "Medium", "Rough"],
	edgesMode: ["Lines", "Transfer", "Masses", "Sketch"],
	gridMode: ["Thirds", "Grid", "Both"],
	gridUnit: ["Cells", "cm"],
	gridGroup: ["2 × 2", "4 × 4"],
	gridPaint: ["Contrast", "One color"],
};

/**
 * The call that draws layer `id` with its settings. `widthCm` is the width of the picture on the
 * paper (`shownWidthCm`), or null with no photo: only a Grid in cm reads it, and without it the
 * Grid counts cells.
 */
export function callFor(
	id: LayerId,
	s: Look,
	widthCm: number | null = null,
): Call {
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
			return { layer: "shapes", ...s.shapes };
		case "values":
			return { layer: "values", ...s.values };
		case "pencil":
			return { layer: "pencil", ...s.pencil };
		case "grid":
			return {
				layer: "grid",
				mode: s.grid.mode,
				cells: s.grid.cells,
				// 0: count `cells`; else the squares across the width in thousandths (a step in cm)
				cellsMilli:
					s.grid.unit === GRID_UNIT.cm && widthCm !== null
						? gridMilli(widthCm, s.grid.cm)
						: 0,
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
