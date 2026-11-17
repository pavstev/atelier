// Unit tests of the pure step of the drag hook. Run with `pnpm --dir app/web exec node --test "src/**/*.test.ts"`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { dragStep, finishDrag } from "./useFrameDrag.ts";

test("a move gives the distance from the start", () => {
	assert.equal(dragStep(10, 25), 15);
	assert.equal(dragStep(25, 10), -15);
});

test("drag_cancel_restores: a cancel gives null, so the caller restores and does not end", () => {
	assert.equal(dragStep(10, 25, true), null);
});

test("drag_end_flushes_move: the end calls onMove with the last distance before onEnd", () => {
	const calls: string[] = [];
	finishDrag(
		10,
		40,
		(dx) => calls.push(`move ${dx}`),
		(dx) => calls.push(`end ${dx}`),
	);
	assert.deepEqual(calls, ["move 30", "end 30"]);
});
