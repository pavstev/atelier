// Where the bottom bar sits along the stage: the share of the stage width at the bar's center, 0 left
// to 1 right (0.5 is the middle, the start). No React, so a node test can load it.

export const BAR_START = 0.5;

/** The bar place read back from a save; anything that is not a number from 0 to 1 gives the start. */
export function cleanBar(raw: unknown): number {
	const x =
		typeof raw === "object" && raw !== null
			? (raw as { x?: unknown }).x
			: undefined;
	return typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1
		? x
		: BAR_START;
}

/**
 * The center of the bar in pixels, kept so the whole bar stays inside the stage (`edge` px of
 * room at each side). A bar wider than the stage sits in the middle.
 */
export function clampCenter(
	center: number,
	bar: number,
	stage: number,
	edge: number,
): number {
	const lo = bar / 2 + edge;
	const hi = stage - bar / 2 - edge;
	if (lo >= hi) return stage / 2;
	return Math.min(hi, Math.max(lo, center));
}
