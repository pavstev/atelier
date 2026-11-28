// Unit tests of the Look schema: the start values, and that an old or bad save still loads with them.
// Run with `pnpm --dir app/web exec node --test "src/**/*.test.ts"`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanLook, LOOK } from "./look.ts";

const START = {
	base: { kind: "photo", opacity: 100 },
	values: { preset: 1, detail: 50 },
	shapes: { step: 3, detail: 50 },
	grid: { on: false, opacity: 100, cm: 5 },
};

test("the start values are the ones the app always had", () => {
	assert.deepEqual(LOOK, START);
});

test("a save that is not an object gives the start values", () => {
	for (const raw of [undefined, null, 7, "x", [1, 2], true, Number.NaN])
		assert.deepEqual(cleanLook(raw), START);
});

test("a partial save loads with the start values for the rest", () => {
	const old = { base: { kind: "values", opacity: 60 }, values: { preset: 3 } };
	assert.deepEqual(cleanLook(old), {
		...START,
		base: { kind: "values", opacity: 60 },
		values: { ...START.values, preset: 3 },
	});
});

test("a part that is not an object gives its start values, the others stay", () => {
	const out = cleanLook({
		values: 5,
		shapes: null,
		grid: [1, 2],
		base: { kind: "shapes", opacity: 50 },
	});
	assert.deepEqual(out, { ...START, base: { kind: "shapes", opacity: 50 } });
});

test("a bad value falls back to its start, the good ones stay", () => {
	const out = cleanLook({
		base: { kind: "oil", opacity: 9 }, // unknown kind, under the least opacity
		values: { preset: 4, detail: 50.5 }, // preset past Families
		shapes: { step: Number.POSITIVE_INFINITY, detail: Number.NaN },
		grid: { on: true, opacity: 10, cm: 7 }, // 7 is not a step in cm
	});
	assert.deepEqual(out, {
		...START,
		grid: { ...START.grid, on: true, opacity: 10 },
	});
});

test("a cut base, a cut preset and the cut parts of an old save are dropped", () => {
	for (const kind of ["paper", "pencil"])
		assert.equal(cleanLook({ base: { kind, opacity: 40 } }).base.kind, "photo");
	assert.equal(cleanLook({ values: { preset: 5 } }).values.preset, 1);
	const old = {
		edges: { on: true },
		pencil: { look: 1 },
		values: { preset: 2, detail: 10, tint: 1 },
		grid: { on: true, opacity: 55, cm: 3, mode: 1, cells: 50, unit: 1 },
	};
	assert.deepEqual(cleanLook(old), {
		...START,
		values: { preset: 2, detail: 10 },
		grid: { on: true, opacity: 55, cm: 3 },
	});
});

test("a good save is kept whole, and unknown keys are dropped", () => {
	const save = {
		base: { kind: "shapes", opacity: 10 },
		values: { preset: 3, detail: 0 },
		shapes: { step: 0, detail: 100 },
		grid: { on: true, opacity: 55, cm: 10 },
	};
	assert.deepEqual(cleanLook({ ...save, extra: 1 }), save);
	const out = cleanLook({ base: { kind: "photo", opacity: 100, extra: 1 } });
	assert.equal(Object.hasOwn(out.base, "extra"), false);
});
