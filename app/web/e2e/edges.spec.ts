// The Edges Width slider: wider lines cover more of the canvas in every mode, with no error. The
// Even slider: only in Lines, and it changes the lines.
import { expect, MAIN_PHOTO, test } from "./studio";

test("test_edges_width_adds_ink", async ({ studio }) => {
	const { page } = studio;
	await studio.open(MAIN_PHOTO);
	await studio.layer("edges", true);
	// The ink on the Edges canvas: the sum of its alpha.
	const ink = () =>
		page.evaluate(() => {
			const c = document.querySelector<HTMLCanvasElement>(
				"[data-testid=layer-canvas-edges]",
			);
			const d = c?.getContext("2d")?.getImageData(0, 0, c.width, c.height).data;
			if (!d) throw new Error("no edges pixels");
			let n = 0;
			for (let i = 3; i < d.length; i += 4) n += d[i];
			return n;
		});
	for (const mode of [0, 1, 2]) {
		// Lines (0) is the start mode: pressing it again changes nothing, so no draw follows
		if (mode !== 0) await studio.knob("edges-mode", mode);
		await studio.knob("edges-width", 1);
		const thin = await ink();
		await studio.knob("edges-width", 10);
		const wide = await ink();
		expect(wide, `mode ${mode}`).toBeGreaterThan(thin * 1.5);
		await expect(page.getByTestId("error")).toHaveCount(0);
	}
});

test("test_edges_even_only_in_lines", async ({ studio }) => {
	const { page } = studio;
	await studio.open(MAIN_PHOTO);
	await studio.layer("edges", true);
	const pixels = () =>
		page.evaluate(() => {
			const c = document.querySelector<HTMLCanvasElement>(
				"[data-testid=layer-canvas-edges]",
			);
			const d = c?.getContext("2d")?.getImageData(0, 0, c.width, c.height).data;
			if (!d) throw new Error("no edges pixels");
			return Array.from(d.filter((_, i) => i % 4 === 3)).join(",");
		});
	await studio.knob("edges-even", 0);
	const raw = await pixels();
	await studio.knob("edges-even", 100);
	expect(await pixels()).not.toBe(raw);
	await expect(page.getByTestId("error")).toHaveCount(0);
	await studio.knob("edges-mode", 1);
	await expect(page.getByTestId("edges-even")).toHaveCount(0);
});
