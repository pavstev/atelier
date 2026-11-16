// Unit tests of the bar place: the cleaning of a save and the keep-inside rule.
// Run with `pnpm --dir app/web exec node --test "src/**/*.test.ts"`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { BAR_START, clampCenter, cleanBar } from "./barPlace.ts";

test("a good save is kept and a bad one gives the middle", () => {
	assert.equal(cleanBar({ x: 0.25 }), 0.25);
	assert.equal(cleanBar({ x: 0 }), 0);
	for (const bad of [null, 3, "a", {}, { x: "0.2" }, { x: 1.2 }, { x: -1 }]) {
		assert.equal(cleanBar(bad), BAR_START);
	}
	assert.equal(cleanBar({ x: Number.NaN }), BAR_START);
});

test("the bar stays inside the stage", () => {
	assert.equal(clampCenter(5, 400, 1000, 8), 208);
	assert.equal(clampCenter(990, 400, 1000, 8), 792);
	assert.equal(clampCenter(500, 400, 1000, 8), 500);
});

test("a bar wider than the stage sits in the middle", () => {
	assert.equal(clampCenter(10, 990, 1000, 8), 500);
});
