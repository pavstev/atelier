// Cuts a rectangle out of a photo's pixels. The page does this before the pixels reach the layers
// worker, so the Rust core never knows about paper. The photo it is given is never changed.
import type { Rect } from "./paper";

/** A new `ImageData` holding the `r` part of `photo` (the rectangle is kept inside the photo). */
export function cropImage(photo: ImageData, r: Rect): ImageData {
	const x = Math.min(photo.width - 1, Math.max(0, r.x));
	const y = Math.min(photo.height - 1, Math.max(0, r.y));
	const w = Math.min(photo.width - x, Math.max(1, r.w));
	const h = Math.min(photo.height - y, Math.max(1, r.h));
	const out = new ImageData(w, h);
	for (let row = 0; row < h; row++) {
		const from = ((y + row) * photo.width + x) * 4;
		out.data.set(photo.data.subarray(from, from + w * 4), row * w * 4);
	}
	return out;
}
