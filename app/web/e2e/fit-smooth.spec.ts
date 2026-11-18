// A big photo shown small (at Fit) is drawn from a smooth copy, so fine detail does not turn to
// specks (LEFTOVERS rows 71 and 65). At 100 percent the full canvas shows. The full canvas keeps
// every pixel either way.
import type { Page } from "@playwright/test";
import { expect, test } from "./studio";

const W = 2400;
const H = 3600;

/** Opens a photo of one-pixel black and white checks: the hardest detail to scale down. */
async function openChecks(page: Page, name: string) {
	await page.evaluate(
		async ([w, h, name]) => {
			const c = document.createElement("canvas");
			c.width = Number(w);
			c.height = Number(h);
			const g = c.getContext("2d");
			if (!g) throw new Error("no 2d canvas");
			const img = g.createImageData(c.width, c.height);
			for (let y = 0; y < c.height; y++)
				for (let x = 0; x < c.width; x++) {
					const v = (x + y) % 2 === 0 ? 0 : 255;
					const i = (y * c.width + x) * 4;
					img.data[i] = v;
					img.data[i + 1] = v;
					img.data[i + 2] = v;
					img.data[i + 3] = 255;
				}
			g.putImageData(img, 0, 0);
			const blob = await new Promise<Blob>((ok) =>
				c.toBlob((b) => ok(b as Blob), "image/png"),
			);
			const input =
				document.querySelector<HTMLInputElement>("input[type=file]");
			if (!input) throw new Error("no file input");
			const dt = new DataTransfer();
			dt.items.add(new File([blob], String(name), { type: "image/png" }));
			input.files = dt.files;
			input.dispatchEvent(new Event("change", { bubbles: true }));
		},
		[W, H, name] as const,
	);
	await page
		.locator("[data-testid=facts] p", { hasText: name })
		.waitFor({ timeout: 30_000 });
}

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
	await openChecks(page, "checks.png");
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
