// Unit tests of the Size tool numbers: the table, the cm of a choice, the crop, the fact line, the preview
// and the cleaning of a save.
// Run with `pnpm --dir app/web exec node --test "src/**/*.test.ts"`.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	CM_MAX,
	CM_MIN,
	CUSTOM,
	clampCm,
	cleanChoice,
	cleanSizes,
	cropFor,
	cropRect,
	factText,
	PAPERS,
	paperCm,
	previewRects,
	SIZE_START,
	shownWidthCm,
} from "./paper.ts";

const at = (
	paper: string,
	orient: "auto" | "portrait" | "landscape",
	fit = true,
) => ({
	...SIZE_START,
	paper,
	orient,
	fit,
});

test("the table holds the A sizes and the canvases", () => {
	const a4 = PAPERS.find((p) => p.id === "a4");
	assert.deepEqual([a4?.w, a4?.h], [21, 29.7]);
	assert.equal(PAPERS.find((p) => p.id === "30x40")?.kind, "canvas");
	assert.equal(new Set(PAPERS.map((p) => p.id)).size, PAPERS.length);
	for (const p of PAPERS) assert.ok(p.w < p.h);
});

test("a preset takes the orientation, and Like photo follows the photo", () => {
	assert.deepEqual(paperCm(at("a4", "portrait"), 3000, 2000), {
		w: 21,
		h: 29.7,
	});
	assert.deepEqual(paperCm(at("a4", "landscape"), 2000, 3000), {
		w: 29.7,
		h: 21,
	});
	assert.deepEqual(paperCm(at("a4", "auto"), 3000, 2000), { w: 29.7, h: 21 });
	assert.deepEqual(paperCm(at("a4", "auto"), 2000, 3000), { w: 21, h: 29.7 });
	assert.deepEqual(paperCm(at("a4", "auto"), 2000, 2000), { w: 21, h: 29.7 });
});

test("Custom is as typed and a bad number is clamped", () => {
	const c = { ...SIZE_START, paper: CUSTOM, w: 12.5, h: 9 };
	assert.deepEqual(paperCm(c, 100, 100), { w: 12.5, h: 9 });
	assert.deepEqual(paperCm({ ...c, w: 0.2, h: 9000 }, 100, 100), {
		w: CM_MIN,
		h: CM_MAX,
	});
	// an empty box (0), a negative or a NaN side gives the start side
	assert.deepEqual(paperCm({ ...c, w: 0, h: -4 }, 100, 100), {
		w: SIZE_START.w,
		h: SIZE_START.h,
	});
	assert.deepEqual(paperCm({ ...c, w: Number.NaN, h: 5 }, 100, 100), {
		w: SIZE_START.w,
		h: 5,
	});
	assert.equal(clampCm(Number.POSITIVE_INFINITY, 30), 30);
	assert.equal(clampCm("7"), CM_MIN);
	assert.equal(clampCm(0.2), CM_MIN);
	assert.equal(clampCm(301), CM_MAX);
});

test("a 3000 x 2000 photo cut to 30 x 40", () => {
	assert.deepEqual(cropRect(3000, 2000, 30 / 40), {
		x: 750,
		y: 0,
		w: 1500,
		h: 2000,
	});
	assert.deepEqual(cropRect(3000, 2000, 40 / 30), {
		x: 167,
		y: 0,
		w: 2667,
		h: 2000,
	});
	assert.deepEqual(cropFor(at("30x40", "portrait"), 3000, 2000), {
		x: 750,
		y: 0,
		w: 1500,
		h: 2000,
	});
	assert.deepEqual(cropFor(at("30x40", "landscape"), 3000, 2000), {
		x: 167,
		y: 0,
		w: 2667,
		h: 2000,
	});
});

test("a tall photo is cut at the top and the bottom, and an offset moves the cut", () => {
	assert.deepEqual(cropRect(2000, 3000, 1.5), {
		x: 0,
		y: 834,
		w: 2000,
		h: 1333,
	});
	assert.deepEqual(cropRect(3000, 2000, 0.75, { x: 0, y: 0 }), {
		x: 0,
		y: 0,
		w: 1500,
		h: 2000,
	});
	assert.deepEqual(cropRect(3000, 2000, 0.75, { x: 1, y: 9 }), {
		x: 1500,
		y: 0,
		w: 1500,
		h: 2000,
	});
});

test("a bad ratio or a tiny photo never gives an empty or outside crop", () => {
	for (const r of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1e9, 1e-9]) {
		const c = cropRect(10, 7, r);
		assert.ok(c.w >= 1 && c.h >= 1 && c.x >= 0 && c.y >= 0);
		assert.ok(c.x + c.w <= 10 && c.y + c.h <= 7);
	}
	assert.deepEqual(cropRect(0, 0, 1), { x: 0, y: 0, w: 1, h: 1 });
});

test("Whole photo and a photo of the paper shape are not cut", () => {
	assert.equal(cropFor(at("a4", "auto", false), 3000, 2000), null);
	assert.equal(cropFor(at("a4", "portrait"), 2100, 2970), null);
});

test("the shown width is the paper width, or the photo scaled to the paper long side", () => {
	assert.equal(shownWidthCm(at("a4", "portrait"), 3000, 2000), 21);
	assert.equal(shownWidthCm(at("a4", "auto", false), 3000, 2000), 29.7);
	assert.ok(
		Math.abs(shownWidthCm(at("a4", "auto", false), 2000, 3000) - 19.8) < 1e-9,
	);
});

test("the fact line names the paper and the grid cell", () => {
	assert.equal(
		factText(at("30x40", "portrait"), 3000, 2000, 8),
		"30 × 40 cm. Grid cell: 5 cm.",
	);
	assert.equal(
		factText(at("a4", "portrait"), 3000, 2000, 6),
		"21 × 29.7 cm. Grid cell: 5 cm.",
	);
	assert.equal(
		factText(at("a4", "portrait", false), 3000, 2000, 6),
		"21 × 29.7 cm. Grid cell: about 5 cm.",
	);
	assert.equal(
		factText(at("a4", "portrait"), 3000, 2000, null),
		"21 × 29.7 cm.",
	);
});

test("the preview rectangles stay inside the box and are centered", () => {
	for (const fit of [true, false]) {
		const { photo, paper } = previewRects(
			at("a4", "portrait", fit),
			3000,
			2000,
			200,
			100,
		);
		for (const r of [photo, paper]) {
			assert.ok(r.x >= -1e-9 && r.y >= -1e-9);
			assert.ok(r.x + r.w <= 200 + 1e-9 && r.y + r.h <= 100 + 1e-9);
			assert.ok(Math.abs(r.x * 2 + r.w - 200) < 1e-9);
			assert.ok(Math.abs(r.y * 2 + r.h - 100) < 1e-9);
		}
	}
	const cut = previewRects(at("a4", "portrait"), 3000, 2000, 200, 100);
	assert.ok(Math.abs(cut.paper.w / cut.paper.h - 21 / 29.7) < 0.01);
	assert.ok(Math.abs(cut.photo.w / cut.photo.h - 1.5) < 1e-9);
});

test("a good save is kept and a bad one gives the start", () => {
	const good = { paper: "a4", w: 10, h: 20, orient: "landscape", fit: true };
	assert.deepEqual(cleanChoice(good), good);
	for (const bad of [
		null,
		3,
		"a",
		[],
		{},
		{ paper: "zz", fit: "yes", orient: "up" },
	]) {
		assert.deepEqual(cleanChoice(bad), SIZE_START);
	}
	const c = cleanChoice({ paper: CUSTOM, w: 5000, h: Number.NaN });
	assert.deepEqual([c.paper, c.w, c.h], [CUSTOM, CM_MAX, SIZE_START.h]);
});

test("a saved Custom side of 0 or less takes the start side, not 1 cm", () => {
	const c = cleanChoice({ paper: CUSTOM, w: 0, h: -4, orient: "auto" });
	assert.deepEqual([c.w, c.h], [SIZE_START.w, SIZE_START.h]);
	const d = cleanChoice({ paper: CUSTOM, w: 12, h: 0 });
	assert.deepEqual([d.w, d.h], [12, SIZE_START.h]);
});

test("the map of saves drops bad entries and start choices", () => {
	assert.deepEqual(cleanSizes(null), {});
	assert.deepEqual(cleanSizes("x"), {});
	assert.deepEqual(cleanSizes([1, 2]), {});
	const map = cleanSizes({
		a: { paper: "a4", w: 30, h: 40, orient: "auto", fit: true },
		b: 5,
		c: SIZE_START,
		d: { paper: "nope" },
	});
	assert.deepEqual(Object.keys(map), ["a"]);
	assert.equal(map.a?.paper, "a4");
});
