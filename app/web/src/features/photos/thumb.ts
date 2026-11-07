// A tiny preview of a photo for the file list: the whole photo, long side 128 px, as a JPEG data
// URL. The list shows it in a square tile, so a wide and a tall photo are both seen whole.
// It is a display copy for the page only. The pixel work of the layers stays in the core.

/** The long side of the tiny preview, in px (for sharp tiles on any screen). */
const SMALL = 128;

/** The tiny preview of a bitmap, or "" when the browser cannot make one. The bitmap is not closed. */
async function small(source: ImageBitmap | ImageData): Promise<string> {
	try {
		const k = Math.min(1, SMALL / Math.max(source.width, source.height));
		const w = Math.max(1, Math.round(source.width * k));
		const h = Math.max(1, Math.round(source.height * k));
		const bitmap = await createImageBitmap(source, {
			resizeWidth: w,
			resizeHeight: h,
			resizeQuality: "medium",
		});
		try {
			const canvas = document.createElement("canvas");
			canvas.width = w;
			canvas.height = h;
			canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
			return canvas.toDataURL("image/jpeg", 0.62);
		} finally {
			bitmap.close();
		}
	} catch {
		return "";
	}
}

/** The tiny preview of a decoded photo, or "". */
export const thumbnail = (img: ImageData) => small(img);

/** The tiny preview of a stored image (the bigger preview), or "". */
export async function thumbnailOfBlob(blob: Blob): Promise<string> {
	try {
		const bitmap = await createImageBitmap(blob);
		try {
			return await small(bitmap);
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
		const k = Math.min(1, BIG / Math.max(bitmap.width, bitmap.height));
		const w = Math.max(1, Math.round(bitmap.width * k));
		const h = Math.max(1, Math.round(bitmap.height * k));
		const canvas = document.createElement("canvas");
		canvas.width = w;
		canvas.height = h;
		canvas.getContext("2d")?.drawImage(bitmap, 0, 0, w, h);
		return await new Promise<Blob | null>((done) =>
			canvas.toBlob(done, "image/jpeg", 0.82),
		);
	} finally {
		bitmap.close();
	}
}
