// The photo worker: decodes a photo file to RGBA pixels and makes the small list tile, off the main
// thread. Pixels go back as a transfer. Nothing leaves the device.
import { fitLongSide } from "./fit.ts";

type Req = { id: number; kind: "decode" | "tile"; file: Blob };

const TILE = 128;

function dataUrlOf(blob: Blob): Promise<string> {
	return new Promise((done, fail) => {
		const r = new FileReader();
		r.onload = () => done(String(r.result));
		r.onerror = () => fail(r.error);
		r.readAsDataURL(blob);
	});
}

async function decode(file: Blob): Promise<ImageData> {
	const bitmap = await createImageBitmap(file, {
		imageOrientation: "from-image",
	});
	try {
		const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext(
			"2d",
		);
		if (!ctx) throw new Error("no 2d canvas");
		ctx.drawImage(bitmap, 0, 0);
		return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
	} finally {
		bitmap.close();
	}
}

async function tile(file: Blob): Promise<string> {
	const bitmap = await createImageBitmap(file);
	try {
		const { w, h } = fitLongSide(bitmap.width, bitmap.height, TILE);
		const canvas = new OffscreenCanvas(w, h);
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("no 2d canvas");
		ctx.drawImage(bitmap, 0, 0, w, h);
		const blob = await canvas.convertToBlob({
			type: "image/jpeg",
			quality: 0.62,
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
			const img = await decode(file);
			self.postMessage({ id, ok: img }, [img.data.buffer]);
		} else {
			self.postMessage({ id, ok: await tile(file) });
		}
	} catch (err) {
		self.postMessage({ id, error: String(err) });
	}
};
