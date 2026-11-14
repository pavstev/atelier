// Unit tests of the Auto note. Run with `pnpm --dir app/web exec node --test "src/**/*.test.ts"`.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { PencilAuto } from "../../draw/calls.ts";
import { explainAuto } from "./explain.ts";

const base: PencilAuto = {
	key: 50,
	contrast: 50,
	highlights: 1,
	median: 50,
	keyClass: 1,
	iqr: 0.45,
	eta: 0.6,
	bimodal: false,
	spike: false,
};

test("a low key photo that is lifted a little with more contrast", () => {
	const note = explainAuto({
		...base,
		key: 62,
		contrast: 70,
		median: 28.2,
		keyClass: 0,
	});
	assert.equal(
		note,
		"Low key photo (middle tone L* 28). Lifted the key a little. The middle tones are close together, so more contrast. 1 percent stays bare paper.",
	);
});

test("a high key photo that is lowered a lot with less contrast", () => {
	const note = explainAuto({
		...base,
		key: 10,
		contrast: 30,
		median: 81,
		keyClass: 2,
		highlights: 5,
	});
	assert.equal(
		note,
		"High key photo (middle tone L* 81). Lowered the key a lot. The middle tones are far apart, so less contrast. 5 percent stays bare paper.",
	);
});

test("a photo that needs nothing says the key and contrast stay", () => {
	const note = explainAuto(base);
	assert.match(note, /^Mid key photo \(middle tone L\* 50\)\./);
	assert.match(note, /The key stays\./);
	assert.match(note, /contrast stays\./);
});

test("two tone groups keep the key", () => {
	const note = explainAuto({ ...base, bimodal: true, key: 50 });
	assert.match(note, /two separate groups of tones, so the key stays/);
});

test("a glint adds a word about the highlights", () => {
	const note = explainAuto({ ...base, highlights: 2, spike: true });
	assert.match(
		note,
		/2 percent stays bare paper, with a little extra for a bright glint\.$/,
	);
});

test("an unknown key class reads as a mid key photo", () => {
	assert.match(explainAuto({ ...base, keyClass: 9 }), /^Mid key photo/);
});
