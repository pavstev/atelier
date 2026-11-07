// The Grid Cells slider: the steps 3, 4, 6, 8, 9, 10, 12, 18, 20, 24, 30, 40 and 50, and no error on the way.
// The Width slider, the heavy lines every 2 or 4 cells, and the line color: Contrast or one color.
import { expect, MAIN_PHOTO, readCanvas, test } from "./studio";

const STEPS = [3, 4, 6, 8, 9, 10, 12, 18, 20, 24, 30, 40, 50];

test("test_cells_no_error", async ({ studio }) => {
	const { page } = studio;
	await studio.open(MAIN_PHOTO);
	await studio.layer("grid", true);
	const input = page.locator("[data-testid=grid-cells] input[type=range]");
	const shown = page.locator("[data-testid=grid-cells] output");
	const value = async () => Number(await shown.textContent());
	await input.focus();
	await studio.drawn(() => page.keyboard.press("Home"));
	const seen = [await value()];
	for (let i = 1; i < STEPS.length; i++) {
		await studio.drawn(() => page.keyboard.press("ArrowRight"));
		seen.push(await value());
		await expect(page.getByTestId("error")).toHaveCount(0);
	}
	expect(seen).toEqual(STEPS);
	// The end stops at 50.
	await page.keyboard.press("ArrowRight");
	expect(await value()).toBe(50);
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
