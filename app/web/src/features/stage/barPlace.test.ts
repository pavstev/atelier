// Unit tests of the bar place: the cleaning of a save and the keep-inside rule.
// Run with `pnpm --dir app/web exec node --test "src/**/*.test.ts"`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { BAR_START, clampCenter, cleanBar, shareOf } from "./barPlace.ts";

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

test("the bar stays right of the open side panel", () => {
	// the free stage starts at 300: the bar's left edge stops at 308
	assert.equal(clampCenter(5, 400, 1000, 8, 300), 508);
	assert.equal(clampCenter(990, 400, 1000, 8, 300), 792);
	// too wide for the free stage: inside the window at the right, as the CSS puts it
	assert.equal(clampCenter(400, 700, 1000, 8, 300), 642);
});

test("the share is taken of the free stage", () => {
	assert.equal(shareOf(500, 1000), 0.5);
	assert.equal(shareOf(650, 1000, 300), 0.5);
	assert.equal(shareOf(100, 1000, 300), 0);
	assert.equal(shareOf(300, 300, 300), BAR_START);
});
