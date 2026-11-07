// What the base, the switches, opacities and knobs do to the canvases.
import { expect, MAIN_PHOTO, setRange, test } from "./studio";

test("test_bare_photo_on_open", async ({ studio }) => {
	const { page } = studio;
	await studio.open(MAIN_PHOTO);
	await expect(page.getByTestId("photo-canvas")).toBeVisible();
	await expect(page.locator("[data-testid^=layer-canvas-]")).toHaveCount(0);
});

test("test_base_is_one_choice", async ({ studio }) => {
	const { page } = studio;
	await studio.open(MAIN_PHOTO);
	await studio.tool("base");
	await expect(page.getByTestId("base").getByRole("radio")).toHaveText([
		"Photo",
		"Values",
		"Shapes",
		"Paper",
	]);
	await expect(page.getByTestId("values-tint")).toHaveCount(0);
	await studio.base("values");
	await expect(page.getByTestId("values-tint")).toBeVisible();
	await expect(page.getByTestId("shapes-step")).toHaveCount(0);
	await studio.base("shapes");
	await expect(page.getByTestId("shapes-step")).toBeVisible();
	await expect(page.getByTestId("values-tint")).toHaveCount(0);
	await expect(page.locator("[data-testid^=layer-canvas-]")).toHaveCount(1);
});

test("test_legend_shows_munsell_values", async ({ studio }) => {
	const { page } = studio;
	await studio.open(MAIN_PHOTO);
	await expect(page.getByTestId("legend")).toHaveCount(0);
	await studio.base("values");
	const swatches = page.getByTestId("legend-swatch");
	await expect(swatches.first()).toBeVisible();
	const n = await swatches.count();
	expect(n).toBeGreaterThanOrEqual(2);
	await expect(swatches).toHaveText(Array.from({ length: n }, () => /^V\d+$/));
	await expect(page.getByLabel("Value legend")).toBeVisible();
	const lum = async (i: number) => {
		const rgb = await swatches
			.nth(i)
			.evaluate((el) => getComputedStyle(el).backgroundColor);
		const [r, g, b] = (rgb.match(/\d+/g) ?? []).map(Number);
		return r + g + b;
	};
	// darkest first, as the Munsell scale runs
	expect(await lum(0)).toBeLessThan(await lum(n - 1));
	// Shapes lists the piles to mix in its step, as Munsell values too. A step may have none.
	await studio.base("shapes");
	await expect(page.getByTestId("layer-canvas-base")).toBeVisible();
	await expect(page.getByLabel("Value legend")).toHaveCount(0);
	const piles = page.getByLabel("Mix piles");
	if (await piles.count()) {
		await expect(piles.getByTestId("legend-swatch").first()).toHaveText(
			/^V\d+$/,
		);
	}
});

test("test_legend_color_opens_big_on_a_gray_mat", async ({ studio }) => {
	const { page } = studio;
	await studio.open(MAIN_PHOTO);
	await studio.base("values");
	const swatches = page.getByTestId("legend-swatch");
	await expect(swatches.first()).toBeVisible();
	const bg = (el: Element) => getComputedStyle(el).backgroundColor;
	const first = await swatches.first().evaluate(bg);
	await swatches.first().getByRole("button").click();
	const zoom = page.getByTestId("swatch-zoom");
	await expect(zoom).toBeVisible();
	const big = page.getByTestId("swatch-zoom-color");
	expect(await big.evaluate(bg)).toBe(first);
	const box = await big.boundingBox();
	expect(box?.width ?? 0).toBeGreaterThan(300);
	// the arrow keys switch to the next color, a press fills the screen, Escape goes back
	await page.keyboard.press("ArrowRight");
	expect(await big.evaluate(bg)).toBe(await swatches.nth(1).evaluate(bg));
	await big.click();
	await expect(page.getByTestId("swatch-full")).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(zoom).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(zoom).toHaveCount(0);
});

test("test_opacity_changes_the_canvas_style", async ({ studio }) => {
	const { page } = studio;
	await studio.open(MAIN_PHOTO);
	await studio.layer("edges", true);
	await studio.opacity("edges", 40);
	await expect(page.getByTestId("layer-canvas-edges")).toHaveCSS(
		"opacity",
		"0.4",
	);
});

test("test_knob_redraws_its_layer_only", async ({ studio }) => {
	await studio.open(MAIN_PHOTO);
	await studio.layer("edges", true);
	await studio.layer("grid", true);
	const edges = await studio.stats("layer-canvas-edges");
	const grid = await studio.stats("layer-canvas-grid");
	await studio.knob("edges-amount", 5);
	const edges2 = await studio.stats("layer-canvas-edges");
	const grid2 = await studio.stats("layer-canvas-grid");
	expect(edges2.hash).not.toBe(edges.hash);
	expect(grid2.hash).toBe(grid.hash);
});

test("test_photo_hold_hides_layers", async ({ studio }) => {
	const { page } = studio;
	await studio.open(MAIN_PHOTO);
	await studio.base("values");
	const canvas = page.getByTestId("layer-canvas-base");
	await expect(canvas).toBeVisible();
	const box = await page.getByTestId("photo-hold").boundingBox();
	if (!box) throw new Error("no hold button");
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await expect(canvas).toBeHidden();
	await page.mouse.up();
	await expect(canvas).toBeVisible();
});

test("the Photo base takes the base canvas away", async ({ studio }) => {
	const { page } = studio;
	await studio.open(MAIN_PHOTO);
	await studio.base("shapes");
	await studio.base("photo");
	await expect(page.getByTestId("layer-canvas-base")).toHaveCount(0);
});

test("test_paper_base_hides_the_photo", async ({ studio }) => {
	const { page } = studio;
	await studio.open(MAIN_PHOTO);
	await studio.base("shapes");
	await studio.base("paper");
	const photo = page.getByTestId("photo-canvas");
	await expect(page.getByTestId("layer-canvas-base")).toHaveCount(0);
	await expect(page.getByTestId("opacity-base")).toHaveCount(0);
	await expect(photo).toBeHidden();
	await studio.layer("edges", true);
	await expect(page.getByTestId("layer-canvas-edges")).toBeVisible();
	// The Photo button still shows the bare photo while it is held.
	const hold = page.getByTestId("photo-hold");
	await hold.hover();
	await page.mouse.down();
	await expect(photo).toBeVisible();
	await page.mouse.up();
	await expect(photo).toBeHidden();
	await studio.base("photo");
	await expect(photo).toBeVisible();
});

test("a layer stays on screen while a knob redraws it", async ({ studio }) => {
	const { page } = studio;
	await studio.openSynthetic();
	await studio.layer("edges", true);
	const prev = await studio.stamp();
	await setRange(
		page.locator("[data-testid=edges-amount] input[type=range]"),
		10,
	);
	await expect(page.getByTestId("layer-canvas-edges")).toHaveCount(1);
	await studio.waitDraw(prev);
	await expect(page.getByTestId("layer-canvas-edges")).toHaveCount(1);
});
