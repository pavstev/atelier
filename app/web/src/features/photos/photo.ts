// Decodes a photo file in the browser to RGBA pixels. Nothing leaves the page.

/** A 2d canvas: an OffscreenCanvas where there is one, else a hidden canvas element. */
function canvasOf(w: number, h: number) {
	if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
	const c = document.createElement("canvas");
	c.width = w;
	c.height = h;
	return c;
}

/** The pixels of `file`, upright (the browser applies the EXIF turn). */
export async function loadPhoto(file: Blob): Promise<ImageData> {
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
