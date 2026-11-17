// The page side of the photo worker: decodeOff and tileOff hand a file to the worker and wait for
// the answer. They throw when the browser has no worker or no OffscreenCanvas 2d, so the caller
// keeps its main-thread path.

type Pending = { ok: (v: never) => void; fail: (e: Error) => void };

let worker: Worker | null = null;
let next = 1;
const pending = new Map<number, Pending>();

/** True when the worker path can work here. */
export function canDecodeOff(): boolean {
	return (
		typeof Worker !== "undefined" &&
		typeof OffscreenCanvas !== "undefined" &&
		typeof createImageBitmap !== "undefined"
	);
}

function get(): Worker {
	if (worker) return worker;
	const w = new Worker(new URL("./decodeWorker.ts", import.meta.url), {
		type: "module",
	});
	w.onmessage = (
		e: MessageEvent<{ id: number; ok?: unknown; error?: string }>,
	) => {
		const p = pending.get(e.data.id);
		if (!p) return;
		pending.delete(e.data.id);
		if (e.data.error !== undefined) p.fail(new Error(e.data.error));
		else p.ok(e.data.ok as never);
	};
	w.onerror = () => {
		for (const p of pending.values()) p.fail(new Error("photo worker failed"));
		pending.clear();
		worker?.terminate();
		worker = null;
	};
	worker = w;
	return w;
}

function ask<T>(kind: "decode" | "tile", file: Blob): Promise<T> {
	if (!canDecodeOff()) return Promise.reject(new Error("no photo worker"));
	return new Promise<T>((ok, fail) => {
		const id = next++;
		pending.set(id, { ok: ok as (v: never) => void, fail });
		try {
			get().postMessage({ id, kind, file });
		} catch (e) {
			pending.delete(id);
			fail(e instanceof Error ? e : new Error(String(e)));
		}
	});
}

/** The upright RGBA pixels of `file`, decoded in the worker. */
export function decodeOff(file: Blob): Promise<ImageData> {
	return ask<ImageData>("decode", file);
}

/** The small list tile of `file` (a JPEG data URL, long side 128 px), made in the worker. */
export function tileOff(file: Blob): Promise<string> {
	return ask<string>("tile", file);
}
