// Unit tests of the busy counter and the reload decision.
// Run with `pnpm --dir app/web exec node --test "src/**/*.test.ts"`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { begin, end, isBusy, onIdle, whileBusy } from "./busy.ts";
import { shouldReload } from "./register.ts";

test("busy while a save runs, idle after the last one ends", () => {
	assert.equal(isBusy(), false);
	begin();
	begin();
	end();
	assert.equal(isBusy(), true);
	end();
	assert.equal(isBusy(), false);
});

test("onIdle runs at once when idle and once after the last end when busy", () => {
	let n = 0;
	onIdle(() => n++);
	assert.equal(n, 1);
	begin();
	begin();
	onIdle(() => n++);
	end();
	assert.equal(n, 1);
	end();
	assert.equal(n, 2);
	begin();
	end();
	assert.equal(n, 2);
});

test("an extra end does not go below zero", () => {
	end();
	end();
	begin();
	assert.equal(isBusy(), true);
	end();
	assert.equal(isBusy(), false);
});

test("whileBusy ends also when the job fails", async () => {
	await assert.rejects(
		whileBusy(async () => {
			assert.equal(isBusy(), true);
			throw new Error("x");
		}),
	);
	assert.equal(isBusy(), false);
	assert.equal(await whileBusy(async () => 5), 5);
	assert.equal(isBusy(), false);
});

test("the reload waits while busy, never on the first claim, and only once", () => {
	assert.equal(shouldReload(true, false, false), true);
	assert.equal(shouldReload(true, false, true), false);
	assert.equal(shouldReload(false, false, false), false);
	assert.equal(shouldReload(true, true, false), false);
});
