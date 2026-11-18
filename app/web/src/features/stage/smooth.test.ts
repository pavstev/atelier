// Unit tests of the smooth copy size: when it is used and how big it is.
// Run with `pnpm --dir app/web exec node --test "src/**/*.test.ts"`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { SMOOTH_BELOW, smoothTarget } from "./smooth.ts";

const BIG = { width: 3840, height: 5723 };

test("no copy at half size or more", () => {
	assert.equal(smoothTarget(BIG, 3840 * 0.5, 1), null);
	assert.equal(smoothTarget(BIG, 3840, 1), null);
	assert.equal(smoothTarget(BIG, 3840 * 4, 1), null);
});

test("a copy below half size, never larger than half", () => {
	const t = smoothTarget(BIG, 3840 * 0.15, 1);
	assert.ok(t);
	assert.ok(t.width <= BIG.width * SMOOTH_BELOW);
	// never smaller than the screen needs
	assert.ok(t.width >= 3840 * 0.15);
	// the shape of the picture stays
	assert.ok(Math.abs(t.width / t.height - BIG.width / BIG.height) < 0.01);
});

test("device pixels count: the same CSS size on a 2x screen needs a bigger copy", () => {
	const one = smoothTarget(BIG, 3840 * 0.2, 1);
	const two = smoothTarget(BIG, 3840 * 0.2, 2);
	assert.ok(one && two);
	assert.ok(two.width > one.width);
	// at 2x, 0.3 CSS is 0.6 device: crisp full picture
	assert.equal(smoothTarget(BIG, 3840 * 0.3, 2), null);
});

test("a small zoom change or a pan keeps the same copy size", () => {
	const a = smoothTarget(BIG, 3840 * 0.15, 1);
	const b = smoothTarget(BIG, 3840 * 0.152, 1);
	assert.deepEqual(a, b);
});

test("a big zoom change is another size", () => {
	const a = smoothTarget(BIG, 3840 * 0.1, 1);
	const b = smoothTarget(BIG, 3840 * 0.3, 1);
	assert.ok(a && b);
	assert.ok(b.width > a.width);
});

test("odd input gives no copy and no crash", () => {
	assert.equal(smoothTarget({ width: 0, height: 0 }, 100, 1), null);
	assert.equal(smoothTarget(BIG, 0, 1), null);
	assert.equal(smoothTarget(BIG, Number.NaN, 1), null);
	const tiny = smoothTarget(BIG, 0.001, 1);
	assert.ok(tiny && tiny.width >= 1 && tiny.height >= 1);
});
