// A tiny preview of a photo for the file list: the whole photo, long side 128 px, as a JPEG data
// URL. The list shows it in a square tile, so a wide and a tall photo are both seen whole.
// It is a display copy for the page only. The pixel work of the layers stays in the core.
import { tileOff } from "./decodeClient.ts";
import { fitLongSide } from "./fit.ts";
import { uprightBitmap } from "./orient.ts";
import { TILE_QUALITY, TILE_SIDE } from "./photo.ts";

/** A canvas element of `w` by `h` px with the bitmap drawn on it, stretched to fill it. */
function paint(bitmap: ImageBitmap, w: number, h: number) {
	const canvas = document.createElement("canvas");
	canvas.width = w;
	canvas.height = h;
	canvas.getContext("2d")?.drawImage(bitmap, 0, 0, w, h);
	return canvas;
}

/** The tiny preview of a decoded photo or a bitmap, or "" when the browser cannot make one. The
 * bitmap is not closed. */
export async function thumbnail(
	source: ImageBitmap | ImageData,
): Promise<string> {
	try {
		const { w, h } = fitLongSide(source.width, source.height, TILE_SIDE);
		const bitmap = await createImageBitmap(source, {
			resizeWidth: w,
			resizeHeight: h,
			resizeQuality: "medium",
		});
		try {
			return paint(bitmap, w, h).toDataURL("image/jpeg", TILE_QUALITY);
		} finally {
			bitmap.close();
		}
	} catch {
		return "";
	}
}

/** The tiny preview of a stored image (the bigger preview), or "". */
export async function thumbnailOfBlob(blob: Blob): Promise<string> {
	try {
		const url = await tileOff(blob);
		if (url) return url;
	} catch {
		// no worker: fall through to the page
	}
	try {
		const bitmap = await uprightBitmap(blob);
		try {
			return await thumbnail(bitmap);
		} finally {
			bitmap.close();
		}
	} catch {
		return "";
	}
}

/** The long side of the bigger preview of the hover card, in px. */
const BIG = 360;

/** A bigger preview (a JPEG blob, long side 360 px) of a decoded photo, or null. */
export async function previewOf(img: ImageData): Promise<Blob | null> {
	try {
		return await shrink(await createImageBitmap(img));
	} catch {
		return null;
	}
}

/** A bigger preview of a stored file, with the pixel size of the photo, or null. */
export async function previewOfFile(
	file: Blob,
): Promise<{ blob: Blob; width: number; height: number } | null> {
	try {
		const bitmap = await uprightBitmap(file);
		const { width, height } = bitmap;
		const blob = await shrink(bitmap);
		return blob ? { blob, width, height } : null;
	} catch {
		return null;
	}
}

/** Scales a bitmap to the long side `BIG` (never up), makes a JPEG, and lets the bitmap go. */
async function shrink(bitmap: ImageBitmap): Promise<Blob | null> {
	try {
		const { w, h } = fitLongSide(bitmap.width, bitmap.height, BIG);
		const canvas = paint(bitmap, w, h);
		return await new Promise<Blob | null>((done) =>
			canvas.toBlob(done, "image/jpeg", 0.82),
		);
	} finally {
		bitmap.close();
	}
}
