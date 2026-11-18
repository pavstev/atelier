// The EXIF turn on a real canvas (`src/features/photos/orient.ts`): the fallback that turns the
// pixels when a browser does not (Safari in an installed app), and the probe that asks the browser.
// The tests import the module by its source path, so they need the Vite dev server (not PREVIEW=1
// or URL=).
import { expect, test } from "@playwright/test";

test("test_our_turn_puts_the_left_end_on_top", async ({ page }) => {
	await page.goto("/");
	const got = await page.evaluate(async () => {
		const path = "/src/features/photos/orient.ts";
		const m: typeof import("../src/features/photos/orient") = await import(
			/* @vite-ignore */ path
		);
		const c = new OffscreenCanvas(2, 1);
		const ctx = c.getContext("2d") as OffscreenCanvasRenderingContext2D;
		ctx.fillStyle = "#f00";
		ctx.fillRect(0, 0, 1, 1);
		ctx.fillStyle = "#00f";
		ctx.fillRect(1, 0, 1, 1);
		const turned = await m.turnBitmap(await createImageBitmap(c), 6);
		const out = new OffscreenCanvas(turned.width, turned.height);
		const o = out.getContext("2d") as OffscreenCanvasRenderingContext2D;
		o.drawImage(turned, 0, 0);
		const px = o.getImageData(0, 0, turned.width, turned.height).data;
		return {
			w: turned.width,
			h: turned.height,
			top: [px[0], px[1], px[2]],
			bottom: [px[4], px[5], px[6]],
		};
	});
	expect([got.w, got.h]).toEqual([1, 2]);
	expect(got.top[0]).toBeGreaterThan(200);
	expect(got.top[2]).toBeLessThan(60);
	expect(got.bottom[2]).toBeGreaterThan(200);
	expect(got.bottom[0]).toBeLessThan(60);
});

test("test_chromium_turns_by_exif_so_upright_is_one_by_two", async ({
	page,
}) => {
	await page.goto("/");
	const got = await page.evaluate(async () => {
		const path = "/src/features/photos/orient.ts";
		const m: typeof import("../src/features/photos/orient") = await import(
			/* @vite-ignore */ path
		);
		const blob = new Blob([m.probeBytes() as BlobPart], {
			type: "image/jpeg",
		});
		const b = await m.uprightBitmap(blob);
		return { turns: await m.browserTurns(), w: b.width, h: b.height };
	});
	expect(got).toEqual({ turns: true, w: 1, h: 2 });
});

test("test_uprightBitmap_turns_by_itself_when_the_browser_does_not", async ({
	page,
}) => {
	await page.goto("/");
	const got = await page.evaluate(async () => {
		// A browser that ignores the EXIF turn (Safari in an installed app). Chromium has no switch
		// for that ("none" means "from-image" now), so the wrapper hides the EXIF from the decoder:
		// the APP1 segment of a JPEG is renamed to APP2. The caller still holds the
		// original file, so `uprightBitmap` reads the real Orientation from it.
		const real = window.createImageBitmap.bind(window);
		window.createImageBitmap = (async (
			image: ImageBitmapSource,
			o?: unknown,
		) => {
			let src = image;
			if (image instanceof Blob) {
				const bytes = new Uint8Array(await image.arrayBuffer());
				for (let at = 2; at + 4 <= bytes.length; ) {
					if (bytes[at] !== 0xff || bytes[at + 1] === 0xda) break;
					if (bytes[at + 1] === 0xe1) {
						bytes[at + 1] = 0xe2;
						break;
					}
					at += 2 + ((bytes[at + 2] << 8) | bytes[at + 3]);
				}
				src = new Blob([bytes], { type: image.type });
			}
			return real(src, o as ImageBitmapOptions | undefined);
		}) as typeof window.createImageBitmap;
		// a fresh copy of the module: it asks the browser once and keeps the answer
		const path = `/src/features/photos/orient.ts?ignore-exif=${Date.now()}`;
		const m: typeof import("../src/features/photos/orient") = await import(
			/* @vite-ignore */ path
		);
		const blob = new Blob([m.probeBytes() as BlobPart], {
			type: "image/jpeg",
		});
		const b = await m.uprightBitmap(blob);
		const c = new OffscreenCanvas(b.width, b.height);
		const g = c.getContext("2d") as OffscreenCanvasRenderingContext2D;
		g.drawImage(b, 0, 0);
		const px = g.getImageData(0, 0, b.width, b.height).data;
		return {
			turns: await m.browserTurns(),
			w: b.width,
			h: b.height,
			top: [px[0], px[1], px[2]],
			bottom: [px[4], px[5], px[6]],
		};
	});
	// the browser did not turn, our fallback did: 1 x 2, the left end (red) on top
	expect(got.turns).toBe(false);
	expect([got.w, got.h]).toEqual([1, 2]);
	// The probe is a JPEG of two pixels, so both share one chroma and only the brightness differs.
	// Red is the brighter one: it is on top when the turn is right.
	expect(got.top[0]).toBeGreaterThan(got.bottom[0] + 40);
});
