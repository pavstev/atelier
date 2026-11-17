// Tests for fitLongSide, the size maths shared by the page and the photo worker.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fitLongSide } from "./fit.ts";

test("wide photo shrinks to the long side", () => {
	assert.deepEqual(fitLongSide(4000, 3000, 128), { w: 128, h: 96 });
});
test("test_fit_tall", () => {
	assert.deepEqual(fitLongSide(3000, 4000, 128), { w: 96, h: 128 });
});
test("small photo is never scaled up", () => {
	assert.deepEqual(fitLongSide(100, 50, 128), { w: 100, h: 50 });
});
test("a thin photo keeps at least 1 px", () => {
	assert.deepEqual(fitLongSide(1000, 1, 100), { w: 100, h: 1 });
});
test("test_fit_bad", () => {
	assert.throws(() => fitLongSide(0, 10, 128));
	assert.throws(() => fitLongSide(10, 10, 0));
});
