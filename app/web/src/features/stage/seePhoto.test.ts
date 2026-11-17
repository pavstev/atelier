// Unit tests of the See photo state: tap keeps it on, a long press only peeks.
// Run with `pnpm --dir app/web exec node --test "src/**/*.test.ts"`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createSeePhoto, HOLD_MS, type SeeState } from "./seePhoto.ts";

function make() {
	const state: SeeState = { on: false, latched: false };
	const c = createSeePhoto((s) => Object.assign(state, s));
	return { state, c };
}

test("a press shows the photo at once", () => {
	const { state, c } = make();
	c.press(0);
	assert.deepEqual(state, { on: true, latched: false });
});

test("a quick tap keeps the photo on", () => {
	const { state, c } = make();
	c.press(0);
	c.release(HOLD_MS - 1);
	assert.deepEqual(state, { on: true, latched: true });
});

test("a long press peeks only while pressed", () => {
	const { state, c } = make();
	c.press(0);
	c.release(HOLD_MS);
	assert.deepEqual(state, { on: false, latched: false });
});

test("a tap while kept on turns it off", () => {
	const { state, c } = make();
	c.press(0);
	c.release(50);
	c.press(1000);
	assert.equal(state.on, true);
	c.release(1050);
	assert.deepEqual(state, { on: false, latched: false });
});

test("a long press while kept on turns it off too", () => {
	const { state, c } = make();
	c.press(0);
	c.release(50);
	c.press(1000);
	c.release(2000);
	assert.deepEqual(state, { on: false, latched: false });
});

test("a repeated press (key repeat) counts once", () => {
	const { state, c } = make();
	c.press(0);
	c.press(500);
	c.press(900);
	c.release(1000);
	assert.deepEqual(state, { on: false, latched: false });
});

test("a release without a press does nothing", () => {
	const { state, c } = make();
	c.release(10);
	assert.deepEqual(state, { on: false, latched: false });
	c.press(20);
	c.release(30);
	c.release(40);
	assert.deepEqual(state, { on: true, latched: true });
});

test("a cancelled or left press only ends the peek, it never latches", () => {
	const { state, c } = make();
	c.press(0);
	c.release(50, false);
	assert.deepEqual(state, { on: false, latched: false });
	// and the next real tap still works
	c.press(100);
	c.release(120);
	assert.deepEqual(state, { on: true, latched: true });
});

test("a cancelled press while kept on leaves it kept on", () => {
	const { state, c } = make();
	c.press(0);
	c.release(10);
	c.press(100);
	c.release(120, false);
	assert.deepEqual(state, { on: true, latched: true });
	// the next real tap turns it off
	c.press(200);
	c.release(210);
	assert.deepEqual(state, { on: false, latched: false });
});

test("reset puts it off, also while kept on or pressed", () => {
	const { state, c } = make();
	c.press(0);
	c.release(10);
	c.reset();
	assert.deepEqual(state, { on: false, latched: false });
	c.press(100);
	c.reset();
	assert.deepEqual(state, { on: false, latched: false });
	c.press(200);
	assert.equal(state.on, true);
});
