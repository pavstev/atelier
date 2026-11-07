// What the page keeps: the look and the layout, and how a broken save is read.
import { expect, KEYS, MAIN_PHOTO, store, test } from "./studio";

test("test_settings_come_back_after_reload", async ({ studio }) => {
	const { page } = studio;
	await studio.open(MAIN_PHOTO);
	await studio.layer("edges", true);
	await studio.knob("edges-amount", 80);
	await studio.opacity("edges", 60);
	const saved = await studio.saved();
	expect(Object.keys(saved).sort()).toEqual([
		"base",
		"edges",
		"grid",
		"shapes",
		"values",
	]);
	// the layout has its own key, so a panel drag never rewrites the knobs
	expect(Object.keys(await studio.layout()).sort()).toEqual([
		"panels",
		"widths",
	]);
	expect(saved.edges).toMatchObject({ on: true, amount: 80, opacity: 60 });
	await page.reload();
	await page.getByTestId("file").setInputFiles(MAIN_PHOTO);
	await expect(page.getByTestId("layer-canvas-edges")).toBeVisible({
		timeout: 60_000,
	});
	await expect(page.getByTestId("layer-canvas-edges")).toHaveCSS(
		"opacity",
		"0.6",
	);
	expect(await studio.isOn("layer-edges")).toBe(true);
});

test("test_old_fold_state_in_a_saved_layout_is_dropped", async ({ studio }) => {
	const { page } = studio;
	await studio.layout(); // let the page finish its own first save
	await store(page, KEYS.layout, {
		folds: { base: false, edges: true, grid: true },
		panels: { left: false },
		widths: { left: 320 },
	});
	await page.reload();
	// the tools are buttons in the bar now; nothing folds
	await expect(page.getByTestId("tool-popup")).toHaveCount(0);
	await page.getByTestId("file").setInputFiles(MAIN_PHOTO);
	await expect(page.getByTestId("tool-edges")).toBeVisible({ timeout: 60_000 });
	const saved = await studio.layout();
	expect(Object.keys(saved).sort()).toEqual(["panels", "widths"]);
	expect(saved.widths).toEqual({ left: 320 });
});

test("a broken or stale save does not stop the app from opening", async ({
	studio,
}) => {
	const { page } = studio;
	await store(page, KEYS.state, {
		workspace: "drawing",
		tool: "colors",
		edges: { on: "yes", opacity: 5000 },
		grid: null,
	});
	await page.reload();
	await page.getByTestId("file").setInputFiles(MAIN_PHOTO);
	await expect(page.getByTestId("photo-canvas")).toBeVisible({
		timeout: 60_000,
	});
});

test("test_out_of_range_save_loads_with_start_values", async ({ studio }) => {
	const { page } = studio;
	// let the page finish its own first save, or it would write over the old save set below
	await studio.saved();
	await store(page, KEYS.state, {
		base: { kind: "values", opacity: 0 },
		values: { preset: 7, detail: 50, tint: 2 },
		shapes: { step: 9, detail: 500 },
		edges: { on: true, opacity: 100, mode: 3, amount: 150 },
		grid: { on: true, opacity: 0, mode: 5, cells: 6 },
	});
	await page.reload();
	await page.getByTestId("file").setInputFiles(MAIN_PHOTO);
	await expect(page.getByTestId("layer-canvas-base")).toBeVisible({
		timeout: 60_000,
	});
	await expect(page.getByTestId("layer-canvas-edges")).toBeVisible({
		timeout: 60_000,
	});
	const saved = await studio.saved();
	expect(saved.base.opacity).toBe(100);
	expect(saved.values).toMatchObject({ preset: 1, tint: 0 });
	expect(saved.shapes).toEqual({ step: 3, detail: 50 });
	expect(saved.edges).toMatchObject({ mode: 0, amount: 67 });
	expect(saved.grid).toMatchObject({ mode: 2, opacity: 100 });
	await expect(page.getByTestId("error")).toHaveCount(0);
});

test.describe("a save from before the layout had its own key", () => {
	test("test_layout_fields_in_the_look_save_are_carried_over", async ({
		studio,
	}) => {
		const { page } = studio;
		await studio.layout(); // let the page finish its own first save
		await page.evaluate((key) => localStorage.removeItem(key), KEYS.layout);
		await store(page, KEYS.state, {
			folds: { base: false, edges: true, grid: false },
			widths: { left: 400 },
		});
		await page.reload();
		await expect
			.poll(async () => (await studio.layout()).widths)
			.toEqual({ left: 400 });
		expect(Object.keys(await studio.layout()).sort()).toEqual([
			"panels",
			"widths",
		]);
	});
});

for (const dark of [false, true]) {
	test(`the ${dark ? "dark" : "light"} theme opens a photo`, async ({
		studio,
	}) => {
		const { page } = studio;
		await page.emulateMedia({ colorScheme: dark ? "dark" : "light" });
		await studio.open(MAIN_PHOTO);
		await expect(page.getByTestId("photo-canvas")).toBeVisible();
	});
}

test("the page head says what the app is", async ({ page }) => {
	await page.goto("/");
	for (const m of ["og:description", "twitter:description"]) {
		const text = await page
			.locator(`meta[property="${m}"], meta[name="${m}"]`)
			.getAttribute("content");
		expect(text).toContain("Study a photo like a painter.");
		expect(text).toContain("Edges, shapes, values and a grid");
	}
});
