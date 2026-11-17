// Decodes a photo file in the browser to RGBA pixels. The photo worker does it when it can, else
// the page does. Nothing leaves the page.
import { decodeOff } from "./decodeClient.ts";

/** The long side of the list tile, in px (for sharp tiles on any screen). */
export const TILE_SIDE = 128;
/** The JPEG quality of the list tile. */
export const TILE_QUALITY = 0.62;

/** A 2d canvas: an OffscreenCanvas where there is one, else a hidden canvas element. */
function canvasOf(w: number, h: number) {
	if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
	const c = document.createElement("canvas");
	c.width = w;
	c.height = h;
	return c;
}

/** The upright pixels of `file` on this thread. The page and the photo worker both use it. */
export async function decodePixels(file: Blob): Promise<ImageData> {
	const bitmap = await createImageBitmap(file, {
		imageOrientation: "from-image",
	});
	try {
		const ctx = canvasOf(bitmap.width, bitmap.height).getContext("2d") as
			| CanvasRenderingContext2D
			| OffscreenCanvasRenderingContext2D
			| null;
		if (!ctx) throw new Error("no 2d canvas");
		ctx.drawImage(bitmap, 0, 0);
		return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
	} finally {
		bitmap.close();
	}
}

/** The pixels of `file`, upright (the browser applies the EXIF turn). */
export async function loadPhoto(file: Blob): Promise<ImageData> {
	try {
		return await decodeOff(file);
	} catch {
		return decodePixels(file);
	}
}
