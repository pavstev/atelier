// The free stage: the stage minus the open side panel. The bottom bar and the legend strip center on
// it and never sit on the panel, the bar grip stops at its edge, and the strip keeps clear of the
// Add photo button on a phone. A swatch press on a phone holds its color even with a sheet open.
import type { Page } from "@playwright/test";
import { box, expect, KEYS, ONE_PX, test } from "./studio";

type Rect = { x: number; y: number; width: number; height: number };

const right = (b: Rect) => b.x + b.width;
const overlaps = (a: Rect, b: Rect) =>
	a.x < right(b) &&
	right(a) > b.x &&
	a.y < b.y + b.height &&
	a.y + a.height > b.y;

/** Drags the bar grip by `dx` px. */
async function dragGrip(page: Page, dx: number) {
	const g = await box(page, "bar-handle");
	const x = g.x + g.width / 2;
	const y = g.y + g.height / 2;
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(x + dx, y, { steps: 8 });
	await page.mouse.up();
}

test.describe("desktop", () => {
	test("test_the_bar_and_the_strip_center_on_the_free_stage_not_on_the_wide_panel", async ({
		studio,
	}) => {
		const { page } = studio;
		await studio.openSynthetic(480, 640, "one.png");
		await studio.base("values");
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("tool-popup")).toHaveCount(0);
		// the widest panel: 720 px at 1440
		await page.getByTestId("files-resize").focus();
		await page.keyboard.press("End");
		await expect(page.getByTestId("files-resize")).toHaveAttribute(
			"aria-valuenow",
			"720",
		);
		const panel = await box(page, "files");
		const stage = await box(page, "stage");
		for (const id of ["stage-bar", "legend-strip"]) {
			// poll: the width goes to the page and the layout follows
			await expect
				.poll(async () => (await box(page, id)).x, { message: id })
				.toBeGreaterThanOrEqual(right(panel));
			const b = await box(page, id);
			// centered on the free stage, between the panel and the window edge
			const free = (right(panel) + 12 + stage.x + stage.width) / 2;
			expect(b.x + b.width / 2, id).toBeGreaterThan(free - 16);
			expect(b.x + b.width / 2, id).toBeLessThan(free + 16);
		}
		// the panel hidden: back on the middle of the window
		await page.getByTestId("files-fold").click();
		await expect(page.getByTestId("files")).toHaveAttribute(
			"data-collapsed",
			"true",
		);
		for (const id of ["stage-bar", "legend-strip"]) {
			await expect
				.poll(async () => {
					const b = await box(page, id);
					return b.x + b.width / 2;
				})
				.toBeCloseTo(stage.x + stage.width / 2, ONE_PX);
		}
	});

	test("test_the_bar_grip_stops_at_the_open_panel_and_a_saved_place_loads_right", async ({
		studio,
	}) => {
		const { page } = studio;
		await studio.openSynthetic(480, 640, "one.png");
		const panel = await box(page, "files");
		const stage = await box(page, "stage");
		await dragGrip(page, -5000);
		const left = await box(page, "stage-bar");
		// whole bar right of the panel, 8 px of room
		expect(left.x).toBeGreaterThanOrEqual(right(panel));
		expect(left.x).toBeCloseTo(right(panel) + 12 + 8, ONE_PX);
		await dragGrip(page, 5000);
		const far = await box(page, "stage-bar");
		expect(right(far)).toBeCloseTo(stage.x + stage.width - 8, ONE_PX);
		// the place saved at the far left is read back right of the panel
		await dragGrip(page, -5000);
		await page.reload();
		await expect
			.poll(async () => (await box(page, "stage-bar")).x)
			.toBeCloseTo(right(panel) + 12 + 8, ONE_PX);
		// a place saved in the middle of the free stage loads there. The page saves its own place when
		// it closes, so the save is put in place before the next page starts.
		await page.addInitScript(
			(save) => {
				if (sessionStorage.getItem("seeded")) return;
				sessionStorage.setItem("seeded", "1");
				localStorage.setItem(save.key, save.value);
			},
			{ key: KEYS.bar, value: JSON.stringify({ x: 0.5 }) },
		);
		await page.reload();
		const free = (right(panel) + 12 + stage.x + stage.width) / 2;
		await expect
			.poll(async () => {
				const b = await box(page, "stage-bar");
				return Math.abs(b.x + b.width / 2 - free);
			})
			.toBeLessThan(2);
	});

	test("test_real_size_in_the_zoom_menu_and_the_paper_button_say_their_state", async ({
		studio,
	}) => {
		const { page } = studio;
		await studio.openSynthetic(480, 640, "one.png");
		// Paper says so while Fit to paper is on
		const paper = page.getByTestId("tool-size");
		await expect(paper).toHaveAttribute("aria-pressed", "false");
		await paper.click();
		await page.getByTestId("size-fit").getByRole("radio").nth(1).click();
		await expect(paper).toHaveAttribute("aria-pressed", "true");
		await page.getByTestId("size-fit").getByRole("radio").nth(0).click();
		await expect(paper).toHaveAttribute("aria-pressed", "false");

		// Real size is a checkbox item with an on/off state and a check mark
		const menu = page.getByTestId("zoom-menu");
		const real = page.getByTestId("zoom-real");
		await menu.click();
		await expect(real).toHaveAttribute("role", "menuitemcheckbox");
		await expect(real).toHaveAttribute("aria-checked", "false");
		await real.click();
		await expect(menu).toHaveAttribute("data-locked", "true");
		if ((await menu.getAttribute("aria-expanded")) !== "true")
			await menu.click();
		await expect(real).toHaveAttribute("aria-checked", "true");
		await expect(real.locator("svg")).toBeVisible();
	});

	test("test_a_drag_from_the_middle_of_the_panel_edge_resizes_and_the_hide_handle_still_works", async ({
		studio,
	}) => {
		const { page } = studio;
		await studio.openSynthetic(480, 640, "one.png");
		const edge = page.getByTestId("files-resize");
		await expect(edge).toHaveAttribute("aria-valuenow", "300");
		// the middle of the edge, level with the middle of the window: where the hide handle was
		const e = await box(page, "files-resize");
		const x = e.x + e.width / 2;
		const y = e.y + e.height / 2;
		await page.mouse.move(x, y);
		await page.mouse.down();
		await page.mouse.move(x + 100, y, { steps: 6 });
		await page.mouse.up();
		await expect(edge).toHaveAttribute("aria-valuenow", "400");
		// the hide handle is off that line and still hides the panel
		const h = await box(page, "files-fold");
		expect(h.x).toBeGreaterThanOrEqual(x + 4 - 0.5);
		await page.getByTestId("files-fold").click();
		await expect(page.getByTestId("files")).toHaveAttribute(
			"data-collapsed",
			"true",
		);
	});
});

test.describe("phone", () => {
	test.use({ viewport: { width: 375, height: 812 } });
	test.describe.configure({ timeout: 60_000 });

	test("test_the_pencil_legend_strip_keeps_clear_of_the_add_photo_button", async ({
		studio,
	}) => {
		const { page } = studio;
		await studio.openSynthetic(480, 640, "one.png");
		const add = page.getByTestId("add-photo-bar");
		await expect(add).toBeVisible();
		for (const kind of ["pencil", "values"] as const) {
			await studio.base(kind);
			await page.keyboard.press("Escape");
			await expect(page.getByTestId("tool-popup")).toHaveCount(0);
			await expect(page.getByTestId("legend-strip")).toBeVisible({
				timeout: 30_000,
			});
			const strip = await box(page, "legend-strip");
			expect(overlaps(strip, await box(page, "add-photo-bar")), kind).toBe(
				false,
			);
			// still inside the window
			expect(strip.x).toBeGreaterThanOrEqual(0);
			expect(right(strip)).toBeLessThanOrEqual(375);
		}
	});

	test("test_a_swatch_press_holds_its_color_while_a_sheet_is_open", async ({
		studio,
	}) => {
		const { page } = studio;
		await studio.openSynthetic(480, 640, "one.png");
		await studio.base("pencil");
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("tool-popup")).toHaveCount(0);
		await expect(page.getByTestId("legend-strip")).toBeVisible({
			timeout: 30_000,
		});
		await page.getByTestId("tool-grid").click();
		await expect(page.getByTestId("tool-popup")).toBeVisible();
		// a plain press outside still closes the sheet
		await page.mouse.click(187, 300);
		await expect(page.getByTestId("tool-popup")).toHaveCount(0);
		await page.getByTestId("tool-grid").click();
		await expect(page.getByTestId("tool-popup")).toBeVisible();
		const swatch = page
			.getByTestId("legend-strip")
			.getByTestId("legend-swatch")
			.first();
		const grade = await swatch.getAttribute("data-grade");
		// the strip is above the scrim, so the press reaches the swatch
		await swatch.getByRole("button").click({ timeout: 10_000 });
		// as on desktop: the press holds the grade in the picker card and the sheet goes
		await expect(page.getByTestId("picker-card")).toContainText(grade ?? "");
		await expect(page.getByTestId("tool-popup")).toHaveCount(0);
	});
});
