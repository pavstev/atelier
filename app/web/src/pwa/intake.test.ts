// Tests for the photo intake: the launch queue (Open with) and the share cache (Share).
import assert from "node:assert/strict";
import { test } from "node:test";
import { type IntakeWindow, startIntake } from "./intake.ts";

const tick = () => new Promise((r) => setTimeout(r, 5));

function fakeCache(files: Blob[]) {
	const m = new Map<string, Response>(
		files.map((b, i) => [`/shared/${i}`, new Response(b)]),
	);
	return {
		m,
		keys: async () => [...m.keys()].map((u) => new Request(`http://x${u}`)),
		match: async (r: Request) => m.get(new URL(r.url).pathname),
		delete: async (r: Request) => m.delete(new URL(r.url).pathname),
	};
}

function win(over: Partial<IntakeWindow> & { search?: string }) {
	const urls: string[] = [];
	const cache = fakeCache([]);
	const w = {
		location: { search: over.search ?? "", pathname: "/" },
		history: {
			replaceState: (_a: unknown, _b: string, u: string) => urls.push(u),
		},
		caches: { open: async () => cache },
		...over,
	} as unknown as IntakeWindow;
	return { w, urls };
}

test("test_no_queue: nothing to take never calls add", async () => {
	const { w } = win({});
	let n = 0;
	startIntake(w, () => n++);
	await tick();
	assert.equal(n, 0);
});

test("test_shared_empty: ?shared=1 with an empty cache never calls add", async () => {
	const { w, urls } = win({ search: "?shared=1" });
	let n = 0;
	startIntake(w, () => n++);
	await tick();
	assert.equal(n, 0);
	assert.deepEqual(urls, ["/"]);
});

test("launch queue with 2 handles adds 2 files", async () => {
	const f = (name: string) => ({ getFile: async () => new File(["x"], name) });
	let consumer: ((p: { files: unknown[] }) => void) | undefined;
	const { w } = win({
		launchQueue: { setConsumer: (c: never) => (consumer = c) },
	} as never);
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

test("shared file is added, cache emptied, query removed", async () => {
	const cache = fakeCache([new Blob(["x"], { type: "image/jpeg" })]);
	const urls: string[] = [];
	const w = {
		location: { search: "?shared=1", pathname: "/" },
		history: {
			replaceState: (_a: unknown, _b: string, u: string) => urls.push(u),
		},
		caches: { open: async () => cache },
	} as unknown as IntakeWindow;
	const got: File[][] = [];
	startIntake(w, (fs) => got.push(fs));
	await tick();
	assert.equal(got[0]?.length, 1);
	assert.equal(got[0]?.[0]?.type, "image/jpeg");
	assert.equal(cache.m.size, 0);
	assert.deepEqual(urls, ["/"]);
});
