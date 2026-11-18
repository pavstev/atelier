// Decodes a photo file in the browser to RGBA pixels. The photo worker does it when it can, else
// the page does. Nothing leaves the page.
import { decodeOff } from "./decodeClient.ts";
import { canvasOf, context2d, uprightBitmap } from "./orient.ts";

/** The long side of the list tile, in px (for sharp tiles on any screen). */
export const TILE_SIDE = 128;
/** The JPEG quality of the list tile. */
export const TILE_QUALITY = 0.62;

/** The upright pixels of `file` on this thread. The page and the photo worker both use it. */
export async function decodePixels(file: Blob): Promise<ImageData> {
	const bitmap = await uprightBitmap(file);
	try {
		const ctx = context2d(canvasOf(bitmap.width, bitmap.height));
		if (!ctx) throw new Error("no 2d canvas");
		ctx.drawImage(bitmap, 0, 0);
		return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
	} finally {
		bitmap.close();
	}
}

/** The pixels of `file`, upright (turned by its EXIF, see `orient.ts`). */
export async function loadPhoto(file: Blob): Promise<ImageData> {
	try {
		return await decodeOff(file);
	} catch {
		return decodePixels(file);
	}
}
