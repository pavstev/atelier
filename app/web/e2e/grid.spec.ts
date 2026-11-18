// The Grid Cells select: the steps 3, 4, 6, 8, 9, 10, 12, 18, 20, 24, 30, 40 and 50, and no error on the way.
// The Count by choice (Cells or a step in whole cm on the paper), the Width slider, the heavy lines
// every 2 or 4 cells, and the line color: Contrast or one color.
import { expect, MAIN_PHOTO, readCanvas, test } from "./studio";

const STEPS = [3, 4, 6, 8, 9, 10, 12, 18, 20, 24, 30, 40, 50];

test("test_cells_select", async ({ studio }) => {
	const { page } = studio;
	await studio.open(MAIN_PHOTO);
	await studio.layer("grid", true);
	const cells = page.getByTestId("grid-cells");
	await cells.locator("button").first().click();
	const options = page.getByRole("option");
	await expect(options).toHaveText(STEPS.map(String));
	await studio.drawn(() => options.nth(STEPS.indexOf(12)).click());
	await expect(cells).toContainText("12");
	await expect(page.getByTestId("error")).toHaveCount(0);
	// the last step, 50, draws without an error too
	await studio.knob("grid-cells", STEPS.length - 1);
	await expect(cells).toContainText("50");
	await expect(page.getByTestId("error")).toHaveCount(0);
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
	// The paper is set from the start (30 x 40, Whole photo): the choice is there, on Cells.
	await studio.knob("grid-mode", 1);
	await expect(page.getByTestId("grid-unit")).toBeVisible();
	await expect(page.getByTestId("grid-cells")).toBeVisible();
	await expect(page.getByTestId("grid-step")).toHaveCount(0);
	await studio.knob("grid-unit", 1);
	await expect(page.getByTestId("grid-cells")).toHaveCount(0);
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

test("test_width_and_heavy_lines", async ({ studio }) => {
	const { page } = studio;
	await studio.open(MAIN_PHOTO);
	await studio.layer("grid", true);
	// The pixels a line covers on the Grid canvas.
	const ink = () =>
		readCanvas(page, "layer-canvas-grid", ({ data: d }) => {
			let n = 0;
			for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
			return n;
		});
	await studio.knob("grid-width", 1);
	const thin = await ink();
	await studio.knob("grid-width", 6);
	const wide = await ink();
	expect(wide).toBeGreaterThan(thin * 2);
	await expect(page.getByTestId("error")).toHaveCount(0);
	// 4 x 4 blocks have fewer heavy lines than 2 x 2 ones (6 cells: 4 heavy lines, then 2).
	const two = await ink();
	await studio.knob("grid-group", 1);
	const four = await ink();
	expect(four).toBeLessThan(two);
	await expect(page.getByTestId("error")).toHaveCount(0);
});

test("test_line_color_contrast_or_one", async ({ studio }) => {
	const { page } = studio;
	await studio.open(MAIN_PHOTO);
	await studio.layer("grid", true);
	// The colors of the opaque line pixels on the Grid canvas.
	const colors = () =>
		readCanvas(page, "layer-canvas-grid", ({ data: d }) => {
			const seen = new Set<string>();
			for (let i = 0; i < d.length; i += 4) {
				if (d[i + 3] === 255) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
			}
			return [...seen];
		});
	// Contrast: the lines change color with the photo under them.
	expect((await colors()).length).toBeGreaterThan(20);
	// One color: every line pixel is that color.
	await studio.knob("grid-paint", 1);
	const box = page.locator("[data-testid=grid-color] input");
	await studio.drawn(() => box.fill("#ff2010"));
	expect(await colors()).toEqual(["255,32,16"]);
	await expect(page.getByTestId("error")).toHaveCount(0);
});

test("test_center_puts_a_heavy_line_in_the_middle", async ({ studio }) => {
	const { page } = studio;
	await studio.open(MAIN_PHOTO);
	await studio.layer("grid", true);
	await studio.knob("grid-group", 1);
	// The lit runs along one row and one column of the Grid canvas: [start, length] each.
	const runs = () =>
		readCanvas(page, "layer-canvas-grid", (d, c) => {
			const lit = (x: number, y: number) =>
				d.data[(y * c.width + x) * 4 + 3] > 0;
			const along = (n: number, at: (i: number) => boolean) => {
				const out: [number, number][] = [];
				for (let i = 0; i < n; i++) {
					if (!at(i)) continue;
					const last = out[out.length - 1];
					if (last && last[0] + last[1] === i) last[1]++;
					else out.push([i, 1]);
				}
				return out;
			};
			return {
				w: c.width,
				h: c.height,
				across: along(c.width, (x) => lit(x, 3)),
				down: along(c.height, (y) => lit(3, y)),
			};
		});
	await studio.drawn(() => page.getByTestId("grid-center").click());
	const r = await runs();
	// A run covers the middle pixel each way, and it is the widest run there is: a heavy line.
	for (const [n, list] of [
		[r.w, r.across],
		[r.h, r.down],
	] as const) {
		const mid = Math.floor(n / 2);
		const hit = list.find(([a, l]) => a <= mid && mid < a + l);
		expect(hit, `a line on pixel ${mid} of ${n}`).toBeTruthy();
		const widest = Math.max(...list.map(([, l]) => l));
		expect(hit?.[1]).toBe(widest);
	}
	await expect(page.getByTestId("error")).toHaveCount(0);
});
