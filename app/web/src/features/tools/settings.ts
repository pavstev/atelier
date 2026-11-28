// The base and Grid switches, opacities and knobs, their start values, labels and the call each sends.
import { fallback, finite, number, parse, pipe, transform } from "valibot";
import type { Call, LayerId } from "@/draw/calls";
import { gridMilli } from "@/features/size/paper";
import { flag, group } from "@/lib/schema";
import { KEYS, loadJson, loadText, usePersisted } from "@/lib/storage";
import { cleanLook, type Look } from "./look";

// The look itself (its type, start values, ranges and cleaner) lives in `look.ts`.
export { BASES, LOOK, type Look, OPACITY_MIN } from "./look";

/** The stacked layers, bottom first: the base (Values or Shapes) and Grid. */
export const STAGE_IDS = ["base", "grid"] as const;
export type StageId = (typeof STAGE_IDS)[number];

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
	valuesPreset: ["Notan", "Three", "Five", "Families"],
	shapesStep: ["Shadows", "Halftones", "Lights", "Accents"],
};

/**
 * The call that draws layer `id` with its settings. `widthCm` is the width of the picture on the
 * paper (`shownWidthCm`); the Grid counts squares of `grid.cm` across it, so with no photo
 * (`widthCm` null) there is no Grid call.
 */
export function callFor(
	id: LayerId,
	s: Look,
	widthCm: number | null = null,
): Call | null {
	switch (id) {
		case "shapes":
			return { layer: "shapes", ...s.shapes };
		case "values":
			return { layer: "values", ...s.values };
		case "grid":
			return widthCm === null
				? null
				: { layer: "grid", milli: gridMilli(widthCm, s.grid.cm) };
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
