// The page side of the layers worker (`worker.ts`, line in `connect.ts`). The worker keeps the
// photo and draws. A photo goes to the worker once; a draw sends only the numbers.
import type { Call, Rgb } from "./calls";
import { connect } from "./connect";
import { PHOTO_GONE } from "./messages";

/** The long side of the picture on screen. */
export const WORK_LONG_SIDE = 1024;

const link = connect(
	new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
);

let nextPhoto = 1;
const ids = new WeakMap<ImageData, number>();
function idOf(img: ImageData): number {
	let n = ids.get(img);
	if (n === undefined) {
		n = nextPhoto++;
		ids.set(img, n);
	}
	return n;
}

/** The photo the layers worker holds now, and how many it holds (a test hook reads the count). */
let heldId: number | null = null;
let heldCount = 0;
export const layersHeld = () => heldCount;

/** The photos sent to the worker: a promise per image, so a second send waits for the first. */
const inLayers = new WeakMap<ImageData, Promise<number>>();

/** Sends the photo to the layers worker. Gives the photo id. */
function toLayers(img: ImageData): Promise<number> {
	let p = inLayers.get(img);
	// The worker holds one photo. Another photo came after this one, so it is gone: send it again.
	if (p && heldId !== idOf(img)) {
		inLayers.delete(img);
		p = undefined;
	}
	if (!p) {
		const photo = idOf(img);
		const rgba = img.data.slice().buffer;
		heldId = photo;
		const sent = link(
			{ kind: "load", photo, rgba, width: img.width, height: img.height },
			[rgba],
		).then((r) => {
			heldCount = r.held;
			return photo;
		});
		sent.catch(() => {
			if (inLayers.get(img) === sent) inLayers.delete(img);
		});
		inLayers.set(img, sent);
		p = sent;
	}
	return p;
}

/**
 * The worker keeps one photo. When it dropped `img`, send it again and retry once, while
 * `wanted` says the photo is still needed.
 */
async function withPhoto<T>(
	img: ImageData,
	run: (photo: number) => Promise<T>,
	wanted: () => boolean = () => true,
): Promise<T> {
	try {
		return await run(await toLayers(img));
	} catch (e) {
		if (!(e instanceof Error) || !e.message.includes(PHOTO_GONE) || !wanted())
			throw e;
		inLayers.delete(img);
		return run(await toLayers(img));
	}
}

/** Sends the photo to the layers worker. */
export async function loadPhoto(img: ImageData): Promise<void> {
	await toLayers(img);
}

/** Draws one layer over `img`; Values also returns its tones and Shapes its piles, darkest first,
 * and Pencil its tones with their shares. Rejects with an Error that holds the core's message. */
export async function draw(
	img: ImageData,
	call: Call,
	long: number,
	wanted: () => boolean = () => true,
): Promise<{ layer: ImageData; tones?: Rgb[]; shares?: number[] }> {
	// A draw for a photo that left the screen must not send it back and push the new one out.
	if (!wanted()) throw new Error("the photo left the screen");
	const r = await withPhoto(
		img,
		(photo) => link({ kind: "draw", photo, long, call }),
		wanted,
	);
	return {
		layer: new ImageData(new Uint8ClampedArray(r.rgba), r.width, r.height),
		tones: r.tones,
		shares: r.shares,
	};
}
