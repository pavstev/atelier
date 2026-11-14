// The layers worker owns one wasm instance and the photo on screen, kept prepared between
// draws, so a knob redraws at once. It talks in the types of `messages.ts`.

import { keepNewest } from "@/lib/lru";
import init, { Photo } from "../../wasm/atelier_wasm.js";
import { type Call, pencilAutoOf, pencilNumbers, type Rgb } from "./calls";
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
		case "pencil":
			return p.pencil(long, c.look, c.mask, pencilNumbers(c));
		case "grid":
			return p.grid(long, c.mode, c.cells, c.width, c.group, c.color, c.center);
	}
}

/** The mark byte of a Pencil answer when no level is marked. */
const NO_MARK = 255;

/**
 * Splits a core answer: `[w u32][h u32][w*h*4 rgba]`, and for Values and Shapes one count byte
 * and 3 bytes per tone (or pile) after the pixels. Pencil adds one byte per tone after those: its
 * share of the photo in percent, then one byte for the marked level (255 for none).
 */
function splitDraw(out: Uint8Array): {
	width: number;
	height: number;
	rgba: Uint8Array<ArrayBuffer>;
	tones?: Rgb[];
	shares?: number[];
	mark?: number;
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
	const at = end + 1 + count * 3;
	if (out.length < at + count) return { width, height, rgba, tones };
	const mark = out[at + count];
	return {
		width,
		height,
		rgba,
		tones,
		shares: Array.from(out.slice(at, at + count)),
		// 255 is "no level marked"; an answer without the byte has none either
		mark: mark === undefined || mark === NO_MARK ? undefined : mark,
	};
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
		if (r.kind === "pencilAuto") {
			const auto = pencilAutoOf(p.pencil_auto(r.long));
			if (!auto) throw new Error("the core gave a wrong Auto answer");
			reply({ id: r.id, ok: true, kind: "pencilAuto", auto });
			return;
		}
		if (r.kind === "pencilSuggest") {
			reply({
				id: r.id,
				ok: true,
				kind: "pencilSuggest",
				mask: p.pencil_suggest(r.long, r.count),
			});
			return;
		}
		const t = performance.now();
		const out = draw(p, r.long, r.call);
		const ms = performance.now() - t;
		const { width, height, rgba: pixels, tones, shares, mark } = splitDraw(out);
		reply(
			{
				id: r.id,
				ok: true,
				kind: "draw",
				width,
				height,
				rgba: pixels.buffer,
				tones,
				shares,
				mark,
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
