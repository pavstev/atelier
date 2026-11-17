// The size of an image scaled to a long side, never up. Shared by the page and the photo worker.

export type Size = { w: number; h: number };

/** `w` by `h` scaled so the long side is at most `max` (never up, at least 1 px). Throws on a size
 * that is not positive. */
export function fitLongSide(w: number, h: number, max: number): Size {
	if (!(w > 0) || !(h > 0) || !(max > 0)) {
		throw new RangeError("fitLongSide needs positive sizes");
	}
	const k = Math.min(1, max / Math.max(w, h));
	return {
		w: Math.max(1, Math.round(w * k)),
		h: Math.max(1, Math.round(h * k)),
	};
}
