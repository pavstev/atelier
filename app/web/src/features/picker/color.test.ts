// Tests for the color text helpers shared by the legend and the picker.
import assert from "node:assert/strict";
import { test } from "node:test";
import { css, hex, ink, munsellValue } from "./color.ts";

test("ink picks black on white and white on black", () => {
	assert.equal(ink([255, 255, 255]), "#000");
	assert.equal(ink([0, 0, 0]), "#fff");
});

test("ink_one_limit: the limit is 140 for legend and picker", () => {
	assert.equal(ink([140, 140, 140]), "#fff");
	assert.equal(ink([141, 141, 141]), "#000");
});

test("munsellValue finds the nearest value step", () => {
	assert.equal(munsellValue([119, 119, 119]), 5);
	assert.equal(munsellValue([0, 0, 0]), 0);
	assert.equal(munsellValue([255, 255, 255]), 10);
});

test("css and hex write a color as text", () => {
	assert.equal(css([1, 2, 3]), "rgb(1, 2, 3)");
	assert.equal(hex([1, 2, 255]), "#0102ff");
});
