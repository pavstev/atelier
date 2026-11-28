// Tests for the photo intake: the launch queue (Open with).
import assert from "node:assert/strict";
import { test } from "node:test";
import { type IntakeWindow, startIntake } from "./intake.ts";

const tick = () => new Promise((r) => setTimeout(r, 5));

test("test_no_queue: nothing to take never calls add", async () => {
	let n = 0;
	startIntake({}, () => n++);
	await tick();
	assert.equal(n, 0);
});

test("launch queue with 2 handles adds 2 files", async () => {
	const f = (name: string) => ({ getFile: async () => new File(["x"], name) });
	let consumer: ((p: { files: unknown[] }) => void) | undefined;
	const w = {
		launchQueue: { setConsumer: (c: never) => (consumer = c) },
	} as unknown as IntakeWindow;
	const got: File[][] = [];
	startIntake(w, (fs) => got.push(fs));
	consumer?.({ files: [f("a.jpg"), f("b.png")] });
	await tick();
	assert.equal(got.length, 1);
	assert.deepEqual(
		got[0]?.map((x) => x.name),
		["a.jpg", "b.png"],
	);
});

test("a launch with no files never calls add", async () => {
	let consumer: ((p: { files: unknown[] }) => void) | undefined;
	const w = {
		launchQueue: { setConsumer: (c: never) => (consumer = c) },
	} as unknown as IntakeWindow;
	let n = 0;
	startIntake(w, () => n++);
	consumer?.({ files: [] });
	await tick();
	assert.equal(n, 0);
});
