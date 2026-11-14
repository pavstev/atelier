// Unit tests of the Pencil settings: the start values, the cleaning of old and bad saves, Reset.
// Run with `pnpm --dir app/web exec node --test "src/**/*.test.ts"`.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	cleanPencil,
	PENCIL_RANGE,
	PENCIL_START,
	type PencilLook,
	resetKnobs,
} from "./knobs.ts";

test("the start values are the core's defaults", () => {
	assert.deepEqual(PENCIL_START, {
		look: 0,
		mask: 255,
		detail: 50,
		key: 50,
		contrast: 50,
		highlights: 1,
		darks: 20,
		local: 0,
		grain: 50,
		paper: 1,
		angle: 45,
		density: 50,
		step: 1,
	});
});

test("every start value sits inside its range", () => {
	for (const key of Object.keys(PENCIL_START) as (keyof PencilLook)[]) {
		const [lo, hi] = PENCIL_RANGE[key];
		assert.ok(PENCIL_START[key] >= lo && PENCIL_START[key] <= hi, key);
	}
});

test("an old save, before the knobs, loads with the start values for the new ones", () => {
	const old = { look: 1, mask: 12, detail: 70 };
	assert.deepEqual(cleanPencil(old), {
		...PENCIL_START,
		look: 1,
		mask: 12,
		detail: 70,
	});
});

test("a good save is kept whole", () => {
	const save: PencilLook = {
		look: 4,
		mask: 9,
		detail: 10,
		key: 80,
		contrast: 20,
		highlights: 25,
		darks: 0,
		local: 100,
		grain: 0,
		paper: 2,
		angle: 179,
		density: 100,
		step: 8,
	};
	assert.deepEqual(cleanPencil(save), save);
});

test("a bad value falls back to its start, the good ones stay", () => {
	const bad = {
		look: 5, // over the range
		mask: 0, // under the range
		detail: 50.5, // not whole
		key: "80", // a string
		contrast: Number.NaN,
		highlights: 26,
		darks: -1,
		local: null,
		grain: Number.POSITIVE_INFINITY,
		paper: 3,
		angle: 180,
		density: 60, // good
		step: 0,
	};
	assert.deepEqual(cleanPencil(bad), { ...PENCIL_START, density: 60 });
});

test("a save that is not an object gives the start values", () => {
	for (const raw of [undefined, null, 7, "x", [1, 2], true])
		assert.deepEqual(cleanPencil(raw), PENCIL_START);
});

test("unknown keys are dropped", () => {
	const out = cleanPencil({ look: 2, extra: 1 });
	assert.equal(Object.hasOwn(out, "extra"), false);
	assert.equal(out.look, 2);
});

test("Reset puts every knob back and keeps the look and the pencils", () => {
	const moved: PencilLook = {
		...PENCIL_START,
		look: 3,
		mask: 40,
		key: 90,
		step: 5,
		angle: 120,
	};
	assert.deepEqual(resetKnobs(moved), { ...PENCIL_START, look: 3, mask: 40 });
});
