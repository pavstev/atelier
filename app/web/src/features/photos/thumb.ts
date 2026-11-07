// A tiny preview of a photo for the file list: the whole photo, long side 128 px, as a JPEG data
// URL. The list shows it in a square tile, so a wide and a tall photo are both seen whole.
// It is a display copy for the page only. The pixel work of the layers stays in the core.

/** The long side of the tiny preview, in px (for sharp tiles on any screen). */
const SMALL = 128;

/** The size of a `width` by `height` image scaled to the long side `long` (never up, at least 1 px). */
function fitTo(width: number, height: number, long: number) {
	const k = Math.min(1, long / Math.max(width, height));
	return {
		w: Math.max(1, Math.round(width * k)),
		h: Math.max(1, Math.round(height * k)),
	};
}

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
		const { w, h } = fitTo(source.width, source.height, SMALL);
		const bitmap = await createImageBitmap(source, {
			resizeWidth: w,
			resizeHeight: h,
			resizeQuality: "medium",
		});
		try {
			return paint(bitmap, w, h).toDataURL("image/jpeg", 0.62);
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
		const bitmap = await createImageBitmap(blob);
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
		const bitmap = await createImageBitmap(file);
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
		const { w, h } = fitTo(bitmap.width, bitmap.height, BIG);
		const canvas = paint(bitmap, w, h);
		return await new Promise<Blob | null>((done) =>
			canvas.toBlob(done, "image/jpeg", 0.82),
		);
	} finally {
		bitmap.close();
	}
}
