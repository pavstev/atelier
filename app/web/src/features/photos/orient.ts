// Upright pixels for any browser. A camera often stores a photo on its side and says how to turn it in
// the EXIF Orientation tag. Most browsers apply that turn in `createImageBitmap`; some (Safari in an
// installed app, seen 2026-11-17) do not. So the page asks the browser once, with a tiny built-in
// JPEG, and turns the pixels itself when the browser did not. Nothing leaves the page.

/** A 2 x 1 JPEG (red, then blue) whose EXIF says "turn 90 degrees right" (Orientation 6). A browser
 * that applies the turn decodes it as 1 x 2. Synthetic, made with Pillow. */
const PROBE =
	"/9j/4AAQSkZJRgABAQAAAQABAAD/4QAiRXhpZgAATU0AKgAAAAgAAQESAAMAAAABAAYAAAAAAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAABAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDkJv8AXP8A7x/nRRRX29D+FH0RjW/iS9Wf/9k=";

/** The bytes of the probe JPEG. */
export function probeBytes(): Uint8Array {
	const s = atob(PROBE);
	const out = new Uint8Array(s.length);
	for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
	return out;
}

/** The EXIF Orientation (1 to 8) of JPEG bytes; 1 (as stored) when there is none or the bytes are
 * not a JPEG. Reads only the APP1 Exif segment near the start, past any other APP1 (XMP). */
export function exifOrientation(bytes: Uint8Array): number {
	const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return 1;
	let at = 2;
	while (at + 4 <= v.byteLength) {
		const marker = v.getUint16(at);
		if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return 1;
		const len = v.getUint16(at + 2);
		// "Exif\0\0", then a TIFF header; another APP1 (XMP) is passed over
		if (
			marker === 0xffe1 &&
			at + 10 <= v.byteLength &&
			v.getUint32(at + 4) === 0x45786966
		) {
			const tiff = at + 10;
			if (tiff + 8 > v.byteLength) return 1;
			const little = v.getUint16(tiff) === 0x4949;
			const ifd = tiff + v.getUint32(tiff + 4, little);
			if (ifd + 2 > v.byteLength) return 1;
			const count = v.getUint16(ifd, little);
			for (let i = 0; i < count; i++) {
				const e = ifd + 2 + i * 12;
				if (e + 10 > v.byteLength) return 1;
				if (v.getUint16(e, little) === 0x0112) {
					const o = v.getUint16(e + 8, little);
					return o >= 1 && o <= 8 ? o : 1;
				}
			}
			return 1;
		}
		at += 2 + len;
	}
	return 1;
}

/** The size after the turn, and the canvas transform that draws a `w` by `h` picture upright for
 * EXIF Orientation `o` (the usual table: 5 to 8 swap the sides). */
export function turnOf(
	o: number,
	w: number,
	h: number,
): {
	w: number;
	h: number;
	m: [number, number, number, number, number, number];
} {
	switch (o) {
		case 2:
			return { w, h, m: [-1, 0, 0, 1, w, 0] };
		case 3:
			return { w, h, m: [-1, 0, 0, -1, w, h] };
		case 4:
			return { w, h, m: [1, 0, 0, -1, 0, h] };
		case 5:
			return { w: h, h: w, m: [0, 1, 1, 0, 0, 0] };
		case 6:
			return { w: h, h: w, m: [0, 1, -1, 0, h, 0] };
		case 7:
			return { w: h, h: w, m: [0, -1, -1, 0, h, w] };
		case 8:
			return { w: h, h: w, m: [0, -1, 1, 0, 0, w] };
		default:
			return { w, h, m: [1, 0, 0, 1, 0, 0] };
	}
}

/** A 2d canvas: an OffscreenCanvas where there is one, else a hidden canvas element. */
export function canvasOf(w: number, h: number) {
	if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
	const c = document.createElement("canvas");
	c.width = w;
	c.height = h;
	return c;
}

/** The 2d context of a canvas from `canvasOf`; null when there is none. */
export function context2d(canvas: ReturnType<typeof canvasOf>) {
	return canvas.getContext("2d") as
		| CanvasRenderingContext2D
		| OffscreenCanvasRenderingContext2D
		| null;
}

/** `bitmap` turned upright for EXIF Orientation `o`. The input bitmap is closed when it is replaced. */
export async function turnBitmap(
	bitmap: ImageBitmap,
	o: number,
): Promise<ImageBitmap> {
	if (o <= 1 || o > 8) return bitmap;
	const t = turnOf(o, bitmap.width, bitmap.height);
	const canvas = canvasOf(t.w, t.h);
	const ctx = context2d(canvas);
	if (!ctx) return bitmap;
	ctx.setTransform(...t.m);
	ctx.drawImage(bitmap, 0, 0);
	const out = await createImageBitmap(canvas);
	bitmap.close();
	return out;
}

let turns: Promise<boolean> | null = null;

/** Whether this browser turns a JPEG by its EXIF in `createImageBitmap` (asked once per thread). */
export function browserTurns(): Promise<boolean> {
	turns ??= createImageBitmap(
		new Blob([probeBytes() as BlobPart], { type: "image/jpeg" }),
		{ imageOrientation: "from-image" },
	)
		.then((b) => {
			const ok = b.width === 1 && b.height === 2;
			b.close();
			return ok;
		})
		// a browser that cannot even decode the probe: trust it, as before
		.catch(() => true);
	return turns;
}

/** An upright bitmap of a photo file: the browser's turn when it makes one, else ours. */
export async function uprightBitmap(file: Blob): Promise<ImageBitmap> {
	const bitmap = await createImageBitmap(file, {
		imageOrientation: "from-image",
	});
	if (await browserTurns()) return bitmap;
	const head = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
	return turnBitmap(bitmap, exifOrientation(head));
}
