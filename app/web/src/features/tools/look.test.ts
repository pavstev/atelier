// Unit tests of the Look schema: the start values, and that an old or bad save still loads with them.
// Run with `pnpm --dir app/web exec node --test "src/**/*.test.ts"`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { PENCIL_START } from "../pencil/knobs.ts";
import { cleanLook, LOOK } from "./look.ts";

const START = {
	base: { kind: "photo", opacity: 100 },
	values: { preset: 1, detail: 50, tint: 0 },
	shapes: { step: 3, detail: 50 },
	pencil: PENCIL_START,
	edges: { on: false, opacity: 100, mode: 0, amount: 67, width: 5, even: 50 },
	grid: {
		on: false,
		opacity: 100,
		mode: 2,
		cells: 6,
		unit: 0,
		cm: 5,
		width: 2,
		group: 2,
		center: false,
		contrast: true,
		color: "#ffffff",
	},
};

test("the start values are the ones the app always had", () => {
	assert.deepEqual(LOOK, START);
});

test("a save that is not an object gives the start values", () => {
	for (const raw of [undefined, null, 7, "x", [1, 2], true, Number.NaN])
		assert.deepEqual(cleanLook(raw), START);
});

test("an old save, before the Pencil knobs, loads with the start values for them", () => {
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
		edges: "x",
		grid: [1, 2],
		base: { kind: "shapes", opacity: 50 },
	});
	assert.deepEqual(out, { ...START, base: { kind: "shapes", opacity: 50 } });
});

test("a bad value falls back to its start, the good ones stay", () => {
	const out = cleanLook({
		base: { kind: "oil", opacity: 9 }, // unknown kind, under the least opacity
		values: { preset: 6, detail: 50.5, tint: "1" },
		shapes: { step: Number.POSITIVE_INFINITY, detail: Number.NaN },
		edges: { on: 1, opacity: 101, mode: 4, amount: -1, width: 0, even: 80 },
		grid: {
			on: true,
			opacity: 10,
			mode: 3,
			cells: 7, // not one of the steps
			unit: 2,
			cm: 7,
			width: 17,
			group: 3,
			center: "yes",
			contrast: false,
			color: "red",
		},
	});
	assert.deepEqual(out, {
		...START,
		edges: { ...START.edges, even: 80 },
		grid: { ...START.grid, on: true, opacity: 10, contrast: false },
	});
});

test("a good save is kept whole, and unknown keys are dropped", () => {
	const save = {
		base: { kind: "pencil", opacity: 10 },
		values: { preset: 5, detail: 0, tint: 1 },
		shapes: { step: 0, detail: 100 },
		pencil: { ...PENCIL_START, look: 4, step: 8 },
		edges: { on: true, opacity: 100, mode: 2, amount: 0, width: 10, even: 0 },
		grid: {
			on: true,
			opacity: 55,
			mode: 1,
			cells: 50,
			unit: 1,
			cm: 10,
			width: 16,
			group: 4,
			center: true,
			contrast: false,
			color: "#A0b1C2",
		},
	};
	assert.deepEqual(cleanLook({ ...save, extra: 1 }), save);
	const out = cleanLook({ base: { kind: "photo", opacity: 100, extra: 1 } });
	assert.equal(Object.hasOwn(out.base, "extra"), false);
});

test("a saved Pencil look 2 (Zones) loads as Tone inside the look", () => {
	assert.equal(cleanLook({ pencil: { look: 2, mask: 12 } }).pencil.look, 0);
	assert.equal(cleanLook({ pencil: { look: 2, mask: 12 } }).pencil.mask, 12);
});
