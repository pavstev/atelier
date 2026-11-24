// Where the bottom bar sits along the stage: the share of the stage width at the bar's center, 0 left
// to 1 right (0.5 is the middle, the start). No React, so a node test can load it.
import { isRecord } from "../../lib/clean.ts";

export const BAR_START = 0.5;

/** The bar place read back from a save; anything that is not a number from 0 to 1 gives the start. */
export function cleanBar(raw: unknown): number {
	const x = isRecord(raw) ? raw.x : undefined;
	return typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1
		? x
		: BAR_START;
}

/**
 * The center of the bar in pixels, kept so the whole bar stays inside the stage (`edge` px of
 * room at each side). `from` is where the free stage starts (the right edge of the open side
 * panel, 0 when it is hidden). A bar wider than the free stage stays inside the window at the
 * right, as `barLeft` in CSS does, or in the middle of the window when it is wider than that too.
 */
export function clampCenter(
	center: number,
	bar: number,
	stage: number,
	edge: number,
	from = 0,
): number {
	const lo = from + bar / 2 + edge;
	const hi = stage - bar / 2 - edge;
	if (lo >= hi) return Math.max(stage / 2, hi);
	return Math.min(hi, Math.max(lo, center));
}

/** The share of the free stage (from `from` to `stage`) at a pixel center; the middle when it has no width. */
export function shareOf(center: number, stage: number, from = 0): number {
	const room = stage - from;
	return room > 0
		? Math.min(1, Math.max(0, (center - from) / room))
		: BAR_START;
}
