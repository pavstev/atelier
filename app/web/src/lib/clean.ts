// Small checks for cleaning saved data: a save from an old visit or a broken one must never crash
// the page, so every reader runs its data through these.

/** A plain object (not null, not an array). */
export const isRecord = (x: unknown): x is Record<string, unknown> =>
	typeof x === "object" && x !== null && !Array.isArray(x);

/** `x` when it is a finite number, else `fallback`. */
export const finite = (x: unknown, fallback = 0): number =>
	typeof x === "number" && Number.isFinite(x) ? x : fallback;

/** `x` when it is a finite number of at least 0, else `fallback`. */
export const nonNegative = (x: unknown, fallback = 0): number => {
	const n = finite(x, -1);
	return n >= 0 ? n : fallback;
};

/** `x` when it is a whole number above 0, else 0. */
export const whole = (x: unknown): number =>
	typeof x === "number" && Number.isInteger(x) && x > 0 ? x : 0;
