// Unit tests of the pure parts of `calls.ts`: the order of the Pencil numbers and the Auto answer.
// Run with `pnpm --dir app/web exec node --test "src/**/*.test.ts"` (node's own runner; no browser, no wasm).
import assert from "node:assert/strict";
import { test } from "node:test";
import { type PencilKnobs, pencilAutoOf, pencilNumbers } from "./calls.ts";

const knobs: PencilKnobs = {
	detail: 1,
	key: 2,
	contrast: 3,
	highlights: 4,
	darks: 5,
	local: 6,
	grain: 7,
	paper: 8,
	angle: 9,
	density: 10,
	step: 11,
};

test("the Pencil numbers go in the order of the core", () => {
	// detail, key, contrast, highlights, darks, local, grain, paper, angle, density, step
	assert.deepEqual(
		Array.from(pencilNumbers(knobs)),
		[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
	);
});

test("the Pencil numbers are a Float64Array of the length the core wants", () => {
	const n = pencilNumbers(knobs);
	assert.ok(n instanceof Float64Array);
	assert.equal(n.length, 11);
});

test("an extra key of a call does not leak into the numbers", () => {
	const call = { layer: "pencil", look: 4, mask: 255, ...knobs };
	assert.equal(pencilNumbers(call).length, 11);
});

test("the Auto answer is read in the core's order", () => {
	const a = pencilAutoOf([40, 62, 2, 28.4, 0, 0.31, 0.5, 0, 1]);
	assert.deepEqual(a, {
		key: 40,
		contrast: 62,
		highlights: 2,
		median: 28.4,
		keyClass: 0,
		iqr: 0.31,
		eta: 0.5,
		bimodal: false,
		spike: true,
	});
});

test("an Auto answer of the wrong length is refused", () => {
	assert.equal(pencilAutoOf([1, 2, 3]), null);
	assert.equal(pencilAutoOf([]), null);
});
