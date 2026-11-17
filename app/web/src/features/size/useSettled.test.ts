// Unit tests of the settler behind the Custom width and height boxes: one commit after the last key.
// Run with `pnpm --dir app/web exec node --test "src/**/*.test.ts"`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createSettler, SETTLE_MS } from "./useSettled.ts";

/** A fake timer: `tick(ms)` moves the clock and runs what is due. */
function fake() {
	let now = 0;
	let next = 1;
	const jobs = new Map<number, { at: number; f: () => void }>();
	return {
		timers: {
			set: (f: () => void, ms: number) => {
				const id = next++;
				jobs.set(id, { at: now + ms, f });
				return id;
			},
			clear: (id: unknown) => {
				jobs.delete(id as number);
			},
		},
		tick(ms: number) {
			now += ms;
			for (const [id, j] of [...jobs]) {
				if (j.at <= now) {
					jobs.delete(id);
					j.f();
				}
			}
		},
	};
}

test("keys in a row give one commit with the last value, after the pause", () => {
	const f = fake();
	const got: number[] = [];
	const s = createSettler((v) => got.push(v), SETTLE_MS, f.timers);
	s.push(1);
	f.tick(100);
	s.push(12);
	f.tick(100);
	s.push(125);
	assert.deepEqual(got, []);
	f.tick(SETTLE_MS - 1);
	assert.deepEqual(got, []);
	f.tick(1);
	assert.deepEqual(got, [125]);
	f.tick(1000);
	assert.deepEqual(got, [125]);
});

test("flush (blur) commits at once and the timer then does nothing", () => {
	const f = fake();
	const got: number[] = [];
	const s = createSettler((v) => got.push(v), SETTLE_MS, f.timers);
	s.push(7);
	assert.equal(s.waiting, true);
	s.flush();
	assert.deepEqual(got, [7]);
	assert.equal(s.waiting, false);
	f.tick(1000);
	assert.deepEqual(got, [7]);
});

test("flush with nothing waiting commits nothing", () => {
	const f = fake();
	const got: number[] = [];
	const s = createSettler((v) => got.push(v), SETTLE_MS, f.timers);
	s.flush();
	assert.deepEqual(got, []);
});
