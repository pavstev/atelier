// A big photo shown small (at Fit) is drawn from a smooth copy, so fine detail does not turn to
// specks (LEFTOVERS rows 71 and 65). At 100 percent the full canvas shows. The full canvas keeps
// every pixel either way.
import type { Page } from "@playwright/test";
import { expect, type Studio, test } from "./studio";

const W = 2400;
const H = 3600;

/** Opens a photo of one-pixel black and white checks: the hardest detail to scale down. */
const openChecks = (studio: Studio, name: string) =>
	studio.openCanvas(W, H, name, (g) => {
		const { width, height } = g.canvas;
		const img = g.createImageData(width, height);
		for (let y = 0; y < height; y++)
			for (let x = 0; x < width; x++) {
				const v = (x + y) % 2 === 0 ? 0 : 255;
				const i = (y * width + x) * 4;
				img.data[i] = v;
				img.data[i + 1] = v;
				img.data[i + 2] = v;
				img.data[i + 3] = 255;
			}
		g.putImageData(img, 0, 0);
	});

/** The spread of the gray values of a canvas (standard deviation, 0 to 128). */
const spread = (page: Page, testid: string) =>
	page.evaluate((id) => {
		const c = document.querySelector<HTMLCanvasElement>(`[data-testid=${id}]`);
		if (!c) throw new Error(`no canvas ${id}`);
		const d = c.getContext("2d")?.getImageData(0, 0, c.width, c.height).data;
		if (!d) throw new Error("no pixels");
		let sum = 0;
		let sum2 = 0;
		const n = d.length / 4;
		for (let i = 0; i < d.length; i += 4) {
			const v = d[i] as number;
			sum += v;
			sum2 += v * v;
		}
		const mean = sum / n;
		return { w: c.width, h: c.height, sd: Math.sqrt(sum2 / n - mean * mean) };
	}, testid);

test("test_a_big_photo_at_fit_is_shown_from_a_smooth_copy_without_specks", async ({
	studio,
}) => {
	const { page } = studio;
	await openChecks(studio, "checks.png");
	const small = page.getByTestId("smooth-photo");
	const full = page.getByTestId("photo-canvas");
	// the copy is made after the zoom settles, then it is the one that shows
	await expect(small).toHaveCSS("opacity", "1", { timeout: 10_000 });
	await expect(full).toHaveCSS("opacity", "0");
	const shown = await spread(page, "smooth-photo");
	expect(shown.w).toBeLessThan(W / 2);
	// 1 px checks averaged: one even gray, no black and white specks
	expect(shown.sd).toBeLessThan(12);
	// the full canvas keeps every pixel, for the picker and the rest
	const data = await spread(page, "photo-canvas");
	expect(data.w).toBe(W);
	expect(data.h).toBe(H);
	expect(data.sd).toBeGreaterThan(100);

	// at 100 percent the full canvas shows and the copy hides
	await studio.zoom("actual");
	await expect(full).toHaveCSS("opacity", "1");
	await expect(small).toHaveCSS("opacity", "0");

	// back at Fit the copy shows again
	await studio.zoom("fit");
	await expect(small).toHaveCSS("opacity", "1", { timeout: 10_000 });
});
