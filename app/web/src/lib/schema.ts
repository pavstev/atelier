// Small valibot pieces for cleaning saved data: every part falls back to its start value, so a stale or
// hand-edited save never stops the app. No React and no `@/` imports, so a node test can load it.
import {
	boolean,
	check,
	fallback,
	getFallbacks,
	type InferOutput,
	integer,
	maxValue,
	minValue,
	number,
	type ObjectEntries,
	object,
	pipe,
	regex,
	string,
} from "valibot";

/** A whole number from `lo` to `hi`; anything else (a string, NaN, Infinity, a fraction) gives `start`. */
export const int = (start: number, lo: number, hi: number) =>
	fallback(pipe(number(), integer(), minValue(lo), maxValue(hi)), start);

/** One of the numbers in `list`; anything else gives `start`. */
export const oneOf = (list: readonly number[], start: number) =>
	fallback(
		pipe(
			number(),
			check((x) => list.includes(x)),
		),
		start,
	);

/** A boolean; anything else gives `start`. */
export const flag = (start: boolean) => fallback(boolean(), start);

/** A `#rrggbb` color; anything else gives `start`. */
export const hexColor = (start: string) =>
	fallback(pipe(string(), regex(/^#[0-9a-f]{6}$/i)), start);

/**
 * A group of settings: each key is read on its own, so a missing or bad one gives its start value;
 * unknown keys are dropped; a group that is not an object (null, a number, a string) gives every start.
 */
export const group = <const E extends ObjectEntries>(entries: E) => {
	const schema = object(entries);
	// every entry has a fallback, so `getFallbacks` is a whole output
	return fallback(
		schema,
		() => getFallbacks(schema) as unknown as InferOutput<typeof schema>,
	);
};
