// The Pencil base: it draws, it turns Edges off and leaves Grid, its legend has one row per pencil
// of the set and Paper, the last pencil cannot be switched off, the picker card names a grade, and
// the settings come back after a reload. Headless Chromium, on the synthetic photo (no real photo).
import { GRADES, pressureWords } from "../src/features/pencil/grades";
import { box, expect, KEYS, readCanvas, store, test } from "./studio";

/** The mask with every pencil on, and the card selectors of one pencil. */
const ALL = 255;
const grade = (id: string) => `[data-testid=pencil-grade][data-grade="${id}"]`;

/** How many different colors the base canvas holds (a flat map has one per level). */
const colors = (page: import("@playwright/test").Page) =>
	readCanvas(page, "layer-canvas-base", (img) => {
		const seen = new Set<number>();
		const d = img.data;
		for (let i = 0; i < d.length; i += 4)
			seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
		return seen.size;
	});

/** A spot of the synthetic photo, as a share of its width and height, in page px. */
async function spot(
	page: import("@playwright/test").Page,
	fx: number,
	fy: number,
) {
	const b = await box(page, "photo-canvas");
	return { x: b.x + b.width * fx, y: b.y + b.height * fy };
}

test("test_pencil_base_draws_a_map_and_a_drawing", async ({ studio }) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "pencil-draws.png");
	await studio.tool("base");
	await expect(page.getByTestId("base").getByRole("radio")).toHaveText([
		"Photo",
		"Values",
		"Shapes",
		"Paper",
		"Pencil",
	]);
	// the controls of Pencil are there only while it is the base
	await expect(page.getByTestId("pencil-look")).toHaveCount(0);
	await studio.base("pencil");
	await expect(page.getByTestId("layer-canvas-base")).toBeVisible();
	await expect(page.getByTestId("pencil-look").getByRole("radio")).toHaveText([
		"Tone",
		"Drawing",
		"Zones",
	]);
	await expect(page.getByTestId("pencil-detail")).toBeVisible();
	await expect(page.locator("[data-testid=pencil-grade]")).toHaveCount(8);
	// the start look is Tone, a smooth gray picture: many colors
	await expect(
		page.getByTestId("pencil-look").getByRole("radio", { name: "Tone" }),
	).toBeChecked();
	expect(await colors(page)).toBeGreaterThan(30);
	// Zones are flat: one color per level, nine at most (eight pencils and paper)
	await studio.knob("pencil-look", 2);
	expect(await colors(page)).toBeLessThanOrEqual(9);
	const flat = await studio.stats("layer-canvas-base");
	// the picture is opaque, like Values
	expect(flat.min).toBeGreaterThanOrEqual(0);
	await studio.knob("pencil-detail", 90);
	await studio.knob("pencil-look", 1);
	expect(await colors(page)).toBeGreaterThan(30);
	await expect(page.getByTestId("error")).toHaveCount(0);
	// opacity is there as for the other bases
	await studio.opacity("base", 50);
	await expect(page.getByTestId("layer-canvas-base")).toHaveCSS(
		"opacity",
		"0.5",
	);
});

test("test_pencil_turns_edges_off_keeps_grid_and_photo_brings_edges_back", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "pencil-edges.png");
	await studio.layer("edges", true);
	await expect(page.getByTestId("layer-canvas-edges")).toBeVisible();
	await studio.base("pencil");
	// Edges is gone from the picture and its button is off, with a tip that says why
	await expect(page.getByTestId("layer-canvas-edges")).toHaveCount(0);
	const edges = page.getByTestId("tool-edges");
	await expect(edges).toBeDisabled();
	// the tip says why
	await edges.hover();
	await expect(
		page.getByRole("tooltip").filter({ hasText: "Off in Pencil mode" }),
	).toBeVisible();
	// a real mouse press on it opens nothing (Playwright's own click refuses a disabled button)
	const at = await box(page, "tool-edges");
	await page.mouse.click(at.x + at.width / 2, at.y + at.height / 2);
	await expect(
		page.locator("[data-testid=tool-popup][data-tool=edges]"),
	).toHaveCount(0);
	// the saved switch is kept
	expect((await studio.saved()).edges.on).toBe(true);
	// Grid is fully usable on Pencil, and its Contrast lines are the dark ones of Paper
	await studio.layer("grid", true);
	await expect(page.getByTestId("layer-canvas-grid")).toBeVisible();
	await studio.knob("grid-cells", 3);
	await expect(page.getByTestId("tool-grid")).toBeEnabled();
	await studio.layer("grid", false);
	await expect(page.getByTestId("layer-canvas-grid")).toHaveCount(0);
	// back to Photo: Edges comes back with its old switch
	await studio.base("photo");
	await expect(page.getByTestId("tool-edges")).toBeEnabled();
	await expect(page.getByTestId("layer-canvas-edges")).toBeVisible({
		timeout: 30_000,
	});
	expect(await studio.isOn("layer-edges")).toBe(true);
});

test("test_pencil_legend_has_a_row_per_pencil_and_paper", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "pencil-legend.png");
	await studio.base("pencil");
	const rows = page.getByTestId("legend-swatch");
	await expect(page.getByLabel("Pencil legend")).toBeVisible();
	await expect(rows).toHaveCount(9);
	// darkest first: the pencils in order, then Paper
	const names = GRADES.map((g) => g.id);
	expect(await rows.evaluateAll((l) => l.map((e) => e.dataset.grade))).toEqual([
		...names,
		"Paper",
	]);
	// each row has its grade, its hint and a share (or "not used"); a swatch is not a button
	for (const g of [
		...GRADES,
		{ id: "Paper", hint: "leave white or lift out" },
	]) {
		const row = page.locator(
			`[data-testid=legend-swatch][data-grade="${g.id}"]`,
		);
		await expect(row).toContainText(g.id);
		await expect(row).toContainText(g.hint);
		await expect(row).toContainText(/\d+%|not used/);
	}
	await expect(rows.getByRole("button")).toHaveCount(0);
	// the shares of the levels add up to about 100
	const shares = await rows.evaluateAll((l) =>
		l.map((e) => Number((e as HTMLElement).dataset.share)),
	);
	const total = shares.reduce((a, b) => a + b, 0);
	expect(total).toBeGreaterThanOrEqual(95);
	expect(total).toBeLessThanOrEqual(105);
	// the legend swatches run from dark to light
	const lum = (i: number) =>
		rows
			.nth(i)
			.locator("span")
			.first()
			.evaluate((el) => {
				const [r, g, b] = (
					getComputedStyle(el).backgroundColor.match(/\d+/g) ?? []
				).map(Number);
				return r + g + b;
			});
	expect(await lum(0)).toBeLessThan(await lum(8));
	// seven pencils, eight rows: the 9B is gone from the legend
	await studio.drawn(() => page.locator(grade("9B")).click());
	await expect(rows).toHaveCount(8);
	await expect(
		page.locator('[data-testid=legend-swatch][data-grade="9B"]'),
	).toHaveCount(0);
	await expect(page.locator(grade("9B"))).toHaveAttribute(
		"aria-pressed",
		"false",
	);
});

test("test_the_last_pencil_cannot_be_switched_off", async ({ studio }) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "pencil-last.png");
	await studio.base("pencil");
	// every pencil starts on and says so
	for (const g of GRADES)
		await expect(page.locator(grade(g.id))).toHaveAttribute(
			"aria-pressed",
			"true",
		);
	// switch off all but the HB
	await studio.drawn(async () => {
		for (const g of GRADES)
			if (g.id !== "HB") await page.locator(grade(g.id)).click();
	});
	await expect(page.getByTestId("legend-swatch")).toHaveCount(2);
	const hb = page.locator(grade("HB"));
	await expect(hb).toHaveAttribute("aria-pressed", "true");
	await hb.click();
	await expect(hb).toHaveAttribute("aria-pressed", "true");
	await expect(page.getByTestId("legend-swatch")).toHaveCount(2);
	// the HB is bit 4 of the mask
	expect((await studio.saved()).pencil.mask).toBe(1 << 4);
	// switching one back on works
	await studio.drawn(() => page.locator(grade("2B")).click());
	await expect(page.getByTestId("legend-swatch")).toHaveCount(3);
	expect((await studio.saved()).pencil.mask).toBe((1 << 4) | (1 << 3));
});

test("test_the_picker_card_names_a_pencil_grade", async ({
	studio,
	context,
}) => {
	const { page } = studio;
	await context.grantPermissions(["clipboard-read", "clipboard-write"]);
	await studio.openSynthetic(480, 640, "pencil-picker.png");
	await studio.base("pencil");
	const order = (
		await page
			.getByTestId("legend-swatch")
			.evaluateAll((l) => l.map((e) => e.dataset.grade))
	).map(String);
	await page.getByTestId("tool-picker").click();

	// the dark sky and the bright moon: the moon is the lighter level
	const sky = await spot(page, 0.1, 0.05);
	await page.mouse.move(sky.x, sky.y);
	const card = page.getByTestId("picker-card");
	await expect(card).toBeVisible();
	const darkId = await page
		.getByTestId("picker-grade")
		.getAttribute("data-grade");
	expect(order).toContain(darkId);
	await expect(page.getByTestId("picker-grade")).toHaveText(String(darkId));
	await page.mouse.click(sky.x, sky.y);
	await expect(card).toHaveAttribute("data-pinned", "true");
	await page.keyboard.press("Escape");
	const moon = await spot(page, 340 / 480, 150 / 640);
	await page.mouse.move(moon.x, moon.y);
	await expect(card).toHaveAttribute("data-pinned", "false");
	await page.mouse.click(moon.x, moon.y);
	await expect(card).toHaveAttribute("data-pinned", "true");
	const lightId = String(
		await page.getByTestId("picker-grade").getAttribute("data-grade"),
	);
	expect(order).toContain(lightId);
	expect(order.indexOf(lightId)).toBeGreaterThan(order.indexOf(String(darkId)));

	// the card is a pencil card: a grade, a hint and the pressure; no paint, skin or dry hint
	const words = (id: string) =>
		id === "Paper"
			? "Paper, no pressure"
			: `${id}, ${pressureWords(GRADES.find((g) => g.id === id) ?? GRADES[0])}`;
	await expect(page.getByTestId("picker-hint")).not.toBeEmpty();
	await expect(page.getByTestId("picker-pressure")).toHaveText(
		/(light|medium|firm|no) pressure/,
	);
	for (const id of ["white", "yellow", "red", "lake", "phthalo", "black"])
		await expect(page.getByTestId(`picker-${id}`)).toHaveCount(0);
	await expect(page.getByTestId("picker-dry")).toHaveCount(0);
	await expect(page.getByTestId("picker-skin")).toHaveCount(0);
	await expect(page.getByTestId("picker-parts")).toHaveCount(0);

	// the area is never smaller than Small here
	const area = page.getByTestId("picker-area");
	await expect(area.getByRole("radio", { name: "Small" })).toBeChecked();
	await expect(area.getByRole("radio", { name: "Point" })).toHaveCount(0);

	// copy says the grade and the pressure; a screen reader hears the same
	await page.getByTestId("picker-copy").click();
	await expect(page.getByTestId("picker-copied")).toHaveText("Copied");
	const text = await page.evaluate(() => navigator.clipboard.readText());
	expect(text).toBe(words(lightId));
	await expect(
		page.getByRole("status").filter({ hasText: words(lightId) }),
	).toBeVisible();
	await page.getByTestId("picker-close").click();
	await expect(page.getByTestId("picker-mark")).toHaveCount(0);
});

test("test_pencil_settings_come_back_after_reload", async ({ studio }) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "pencil-reload.png");
	await studio.base("pencil");
	await studio.knob("pencil-look", 2);
	await studio.knob("pencil-detail", 80);
	await studio.drawn(() => page.locator(grade("4H")).click());
	const saved = await studio.saved();
	expect(saved.base.kind).toBe("pencil");
	expect(saved.pencil).toEqual({ look: 2, mask: ALL & ~(1 << 7), detail: 80 });
	await page.reload();
	await studio.openSynthetic(480, 640, "pencil-reload.png");
	await expect(page.getByTestId("layer-canvas-base")).toBeVisible({
		timeout: 60_000,
	});
	await studio.tool("base");
	await expect(
		page.getByTestId("pencil-look").getByRole("radio", { name: "Zones" }),
	).toBeChecked();
	await expect(page.locator(grade("4H"))).toHaveAttribute(
		"aria-pressed",
		"false",
	);
	await expect(page.locator(grade("9B"))).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await expect(page.getByTestId("legend-swatch")).toHaveCount(8);
});

test("test_an_old_save_without_pencil_and_a_bad_pencil_save_load_with_start_values", async ({
	studio,
}) => {
	const { page } = studio;
	// let the page finish its own first save, or it would write over the save set below
	await studio.saved();
	await store(page, KEYS.state, {
		base: { kind: "pencil", opacity: 100 },
		pencil: { look: 5, mask: 0, detail: 500 },
	});
	await page.reload();
	await studio.openSynthetic(480, 640, "pencil-old.png");
	await expect(page.getByTestId("layer-canvas-base")).toBeVisible({
		timeout: 60_000,
	});
	const bad = await studio.saved();
	expect(bad.pencil).toEqual({ look: 0, mask: 255, detail: 50 });
	// a save from before Pencil has no `pencil` part at all
	await store(page, KEYS.state, { base: { kind: "values", opacity: 100 } });
	await page.reload();
	await studio.openSynthetic(480, 640, "pencil-old.png");
	await expect(page.getByTestId("layer-canvas-base")).toBeVisible({
		timeout: 60_000,
	});
	expect((await studio.saved()).pencil).toEqual({
		look: 0,
		mask: 255,
		detail: 50,
	});
	await expect(page.getByTestId("error")).toHaveCount(0);
});
