// The layers worker owns one wasm instance and the photo on screen, kept prepared between
// draws, so a knob redraws at once. It talks in the types of `messages.ts`.

import { keepNewest } from "@/lib/lru";
import init, { Photo } from "../../wasm/atelier_wasm.js";
import type { Call, Rgb } from "./calls";
import {
	PHOTO_GONE,
	type WorkerRequest,
	type WorkerResponse,
} from "./messages";

/**
 * How many photos the worker keeps: the one on screen. A photo that was dropped is sent again
 * when a draw asks for it (`withPhoto` in `coreClient.ts`), so a draw of a photo that lost its
 * tab still works.
 */
const KEEP_PHOTOS = 1;

const ready = init();
/** The kept photos by id, oldest first. */
const photos = new Map<number, Photo>();

function current(id: number): Photo {
	const p = photos.get(id);
	if (!p) throw new Error(PHOTO_GONE);
	return p;
}

function keep(id: number, p: Photo): void {
	photos.get(id)?.free();
	photos.delete(id);
	photos.set(id, p);
	keepNewest(photos, KEEP_PHOTOS, (_, old) => old.free());
}

function draw(p: Photo, long: number, c: Call): Uint8Array {
	switch (c.layer) {
		case "edges":
			return p.edges(long, c.mode, c.amount, c.width, c.even);
		case "shapes":
			return p.shapes(long, c.step, c.detail);
		case "values":
			return p.values(long, c.preset, c.detail, c.tint);
		case "grid":
			return p.grid(long, c.mode, c.cells, c.width, c.group, c.color, c.center);
	}
}

/**
 * Splits a core answer: `[w u32][h u32][w*h*4 rgba]`, and for Values and Shapes one count byte
 * and 3 bytes per tone (or pile) after the pixels.
 */
function splitDraw(out: Uint8Array): {
	width: number;
	height: number;
	rgba: Uint8Array<ArrayBuffer>;
	tones?: Rgb[];
} {
	const head = new DataView(out.buffer, out.byteOffset, 8);
	const width = head.getUint32(0, true);
	const height = head.getUint32(4, true);
	const end = 8 + width * height * 4;
	const rgba = out.slice(8, end);
	if (out.length <= end) return { width, height, rgba };
	const count = out[end];
	const tones: Rgb[] = [];
	for (let i = 0; i < count; i++) {
		const at = end + 1 + i * 3;
		tones.push([out[at], out[at + 1], out[at + 2]]);
	}
	return { width, height, rgba, tones };
}

const reply = (msg: WorkerResponse, transfer: Transferable[] = []) =>
	postMessage(msg, { transfer });

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
	const r = e.data;
	try {
		await ready;
		if (r.kind === "load") {
			keep(r.photo, new Photo(new Uint8Array(r.rgba), r.width, r.height));
			reply({ id: r.id, ok: true, kind: "load", held: photos.size });
			return;
		}
		const p = current(r.photo);
		const t = performance.now();
		const out = draw(p, r.long, r.call);
		const ms = performance.now() - t;
		const { width, height, rgba: pixels, tones } = splitDraw(out);
		reply(
			{
				id: r.id,
				ok: true,
				kind: "draw",
				width,
				height,
				rgba: pixels.buffer,
				tones,
				ms,
			},
			[pixels.buffer],
		);
	} catch (err) {
		reply({
			id: r.id,
			ok: false,
			error: String(err instanceof Error ? err.message : err),
		});
	}
};
