// The photo worker: decodes a photo file to RGBA pixels and makes the small list tile, off the main
// thread. Pixels go back as a transfer. Nothing leaves the device.
import { fitLongSide } from "./fit.ts";
import { uprightBitmap } from "./orient.ts";
import { decodePixels, TILE_QUALITY, TILE_SIDE } from "./photo.ts";

type Req = { id: number; kind: "decode" | "tile"; file: Blob };

function dataUrlOf(blob: Blob): Promise<string> {
	return new Promise((done, fail) => {
		const r = new FileReader();
		r.onload = () => done(String(r.result));
		r.onerror = () => fail(r.error);
		r.readAsDataURL(blob);
	});
}

async function tile(file: Blob): Promise<string> {
	const bitmap = await uprightBitmap(file);
	try {
		const { w, h } = fitLongSide(bitmap.width, bitmap.height, TILE_SIDE);
		const canvas = new OffscreenCanvas(w, h);
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("no 2d canvas");
		ctx.drawImage(bitmap, 0, 0, w, h);
		const blob = await canvas.convertToBlob({
			type: "image/jpeg",
			quality: TILE_QUALITY,
		});
		return await dataUrlOf(blob);
	} finally {
		bitmap.close();
	}
}

self.onmessage = async (e: MessageEvent<Req>) => {
	const { id, kind, file } = e.data;
	try {
		if (kind === "decode") {
			const img = await decodePixels(file);
			self.postMessage({ id, ok: img }, [img.data.buffer]);
		} else {
			self.postMessage({ id, ok: await tile(file) });
		}
	} catch (err) {
		self.postMessage({ id, error: String(err) });
	}
};
