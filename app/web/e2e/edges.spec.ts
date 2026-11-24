// The Edges Width slider: wider lines cover more of the canvas in every mode, with no error. The
// Even slider: only in Lines, and it changes the lines.
import { expect, MAIN_PHOTO, readCanvas, test } from "./studio";

test("test_edges_width_adds_ink", async ({ studio }) => {
	const { page } = studio;
	await studio.open(MAIN_PHOTO);
	await studio.layer("edges", true);
	// The ink on the Edges canvas: the sum of its alpha.
	const ink = () =>
		readCanvas(page, "layer-canvas-edges", ({ data: d }) => {
			let n = 0;
			for (let i = 3; i < d.length; i += 4) n += d[i];
			return n;
		});
	for (const mode of [0, 1, 2, 3]) {
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
		readCanvas(page, "layer-canvas-edges", ({ data: d }) =>
			Array.from(d.filter((_, i) => i % 4 === 3)).join(","),
		);
	await studio.knob("edges-even", 0);
	const raw = await pixels();
	await studio.knob("edges-even", 100);
	expect(await pixels()).not.toBe(raw);
	await expect(page.getByTestId("error")).toHaveCount(0);
	await studio.knob("edges-mode", 1);
	await expect(page.getByTestId("edges-even")).toHaveCount(0);
});

test("test_edges_sketch_is_graphite_and_survives_a_reload", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.open(MAIN_PHOTO);
	await studio.layer("edges", true);
	await studio.knob("edges-mode", 3);
	// Sketch is one gray, not black: where the ink is nearly solid its color is a mid dark gray
	// (a faint pixel loses its color to the canvas rounding, so only solid ones are read)
	const gray = () =>
		readCanvas(page, "layer-canvas-edges", ({ data: d }) => {
			let ink = 0;
			let top = 0;
			for (let i = 0; i < d.length; i += 4) {
				if (d[i + 3] === 0) continue;
				ink++;
				if (d[i + 3] >= 240) top = Math.max(top, d[i]);
			}
			return { ink, top };
		});
	const g = await gray();
	expect(g.ink).toBeGreaterThan(1000);
	expect(g.top).toBeGreaterThan(10);
	expect(g.top).toBeLessThan(120);
	await expect(page.getByTestId("edges-even")).toHaveCount(0);
	await expect(page.getByTestId("error")).toHaveCount(0);
	// it draws over every base that shows Edges (Pencil is a drawing of its own: Edges is off there)
	for (const kind of ["values", "shapes", "paper", "photo"] as const) {
		await studio.base(kind);
		await expect(page.getByTestId("layer-canvas-edges")).toBeVisible();
		expect((await gray()).ink, kind).toBeGreaterThan(1000);
	}
	await page.reload();
	await expect(page.getByTestId("layer-canvas-edges")).toBeVisible({
		timeout: 30_000,
	});
	await studio.tool("edges");
	await expect(
		page.locator("[data-testid=edges-mode]").getByRole("radio").nth(3),
	).toBeChecked();
});

test("test_opacity_first", async ({ studio }) => {
	const { page } = studio;
	await studio.open(MAIN_PHOTO);
	// Edges and Grid: Opacity is the first control under the head
	for (const id of ["edges", "grid"] as const) {
		await studio.tool(id);
		await expect(
			page.locator("[data-testid=tools] > *").first(),
		).toHaveAttribute("data-testid", `opacity-${id}`);
	}
	// Base: no Opacity for the photo; a toned base has it right after the Show row
	await studio.tool("base");
	await expect(page.getByTestId("opacity-base")).toHaveCount(0);
	for (const kind of ["values", "shapes", "pencil"] as const) {
		await studio.base(kind);
		await expect(
			page.locator("[data-testid=tools] > *").nth(1),
			kind,
		).toHaveAttribute("data-testid", "opacity-base");
	}
});
