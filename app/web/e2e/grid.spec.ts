// The Grid card: the On switch, Opacity and the step in whole cm on the paper. There is no mode,
// cell count, width, heavy line or color to set; the lines are Contrast lines.
import { expect, MAIN_PHOTO, readCanvas, test } from "./studio";

test("test_grid_card_has_only_switch_opacity_and_step", async ({ studio }) => {
	const { page } = studio;
	await studio.open(MAIN_PHOTO);
	await studio.layer("grid", true);
	await expect(page.getByTestId("layer-grid")).toBeVisible();
	await expect(page.getByTestId("opacity-grid")).toBeVisible();
	await expect(page.getByTestId("grid-step")).toBeVisible();
	for (const id of [
		"grid-mode",
		"grid-unit",
		"grid-cells",
		"grid-group",
		"grid-center",
		"grid-width",
		"grid-paint",
		"grid-color",
	])
		await expect(page.getByTestId(id)).toHaveCount(0);
});

test("test_grid_in_whole_cm_on_the_paper", async ({ studio }) => {
	const { page } = studio;
	await studio.open(MAIN_PHOTO);
	await studio.layer("grid", true);
	// The lines across a row and down a column of the Grid canvas, with the canvas size.
	const lines = () =>
		readCanvas(page, "layer-canvas-grid", (d, c) => {
			const lit = (x: number, y: number) =>
				d.data[(y * c.width + x) * 4 + 3] > 0;
			const count = (n: number, at: (i: number) => boolean) => {
				let runs = 0;
				for (let i = 0; i < n; i++) if (at(i) && !(i > 0 && at(i - 1))) runs++;
				return runs;
			};
			return {
				w: c.width,
				h: c.height,
				across: count(c.width, (x) => lit(x, 3)),
				down: count(c.height, (y) => lit(3, y)),
			};
		});
	// The paper is set from the start (30 x 40, Whole photo): the step is 5 cm.
	const step = page.getByTestId("grid-step");
	await expect(step).toContainText("5");
	// Whole photo on 30 x 40: the long side of the picture is 40 cm. A line every 5 cm, none at the edge.
	const lineCount = (px: number, long: number, cm: number) =>
		Math.ceil(((px / long) * 40) / cm - 1e-6) - 1;
	let r = await lines();
	const long = Math.max(r.w, r.h);
	expect(r.across).toBe(lineCount(r.w, long, 5));
	expect(r.down).toBe(lineCount(r.h, long, 5));
	// 10 cm is the last step: fewer lines
	await studio.knob("grid-step", 7);
	await expect(step).toContainText("10");
	r = await lines();
	expect(r.across).toBe(lineCount(r.w, long, 10));
	expect(r.down).toBe(lineCount(r.h, long, 10));
	await expect(page.getByTestId("error")).toHaveCount(0);
});

test("test_grid_lines_are_contrast_lines", async ({ studio }) => {
	const { page } = studio;
	await studio.open(MAIN_PHOTO);
	await studio.layer("grid", true);
	// The colors of the opaque line pixels on the Grid canvas: Contrast lines change with the photo.
	const colors = await readCanvas(page, "layer-canvas-grid", ({ data: d }) => {
		const seen = new Set<string>();
		for (let i = 0; i < d.length; i += 4) {
			if (d[i + 3] === 255) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
		}
		return [...seen];
	});
	expect(colors.length).toBeGreaterThan(20);
	await expect(page.getByTestId("error")).toHaveCount(0);
});
