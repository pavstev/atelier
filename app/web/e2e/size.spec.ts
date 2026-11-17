// The Size tool: a paper or canvas is picked in the bar, the photo can be cut to its shape, the choice
// is kept per photo, and "Show at real size" turns the zoom lock on.
import type { Page } from "@playwright/test";
import { expect, test } from "./studio";

const opened = (page: Page) =>
	page.locator("[data-testid=tool-popup][data-tool=size]");

/** Opens the Size card (its bar button). */
async function openSize(page: Page) {
	if ((await opened(page).count()) === 0)
		await page.getByTestId("tool-size").click();
	await opened(page).waitFor();
}

const canvasSize = async (page: Page) => {
	const c = page.getByTestId("photo-canvas");
	return {
		w: Number(await c.getAttribute("width")),
		h: Number(await c.getAttribute("height")),
	};
};

const preset = (page: Page, id: string) =>
	page.locator(`[data-testid=size-preset][data-preset="${id}"]`);

test("test_size_frames_the_photo_to_a4_and_keeps_the_choice", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "frame.png");
	await expect(page.getByTestId("tool-size")).toHaveAttribute(
		"aria-label",
		"Size",
	);
	await openSize(page);
	await expect(page.getByTestId("size-preset")).toHaveCount(10);
	await expect(page.getByTestId("size-preview")).toBeVisible();
	// the start: the owner's canvas, the whole photo
	await expect(preset(page, "30x40")).toHaveAttribute("aria-checked", "true");
	expect(await canvasSize(page)).toEqual({ w: 480, h: 640 });

	await preset(page, "a4").click();
	await expect(preset(page, "a4")).toHaveAttribute("aria-checked", "true");
	await expect(page.getByTestId("size-fact")).toContainText("21 × 29.7 cm");
	await expect(page.getByTestId("size-width").locator("input")).toHaveValue(
		"21",
	);
	await expect(page.getByTestId("size-height").locator("input")).toHaveValue(
		"29.7",
	);
	// Whole photo: nothing is cut yet
	expect(await canvasSize(page)).toEqual({ w: 480, h: 640 });

	await page.getByTestId("size-fit").getByRole("radio").nth(1).click();
	await expect
		.poll(async () => (await canvasSize(page)).w, { timeout: 15_000 })
		.toBeLessThan(480);
	const cut = await canvasSize(page);
	expect(Math.abs(cut.w / cut.h - 21 / 29.7) * cut.h).toBeLessThanOrEqual(1);
	await expect(page.getByTestId("size-preview")).toHaveAttribute(
		"data-fit",
		"true",
	);

	// the choice is kept for the photo and comes back after a reload
	await expect
		.poll(async () =>
			page.evaluate(() => localStorage.getItem("atelier-web-sizes")),
		)
		.toContain('"a4"');
	await page.reload();
	await expect(page.getByTestId("photo-canvas")).toBeVisible({
		timeout: 30_000,
	});
	await expect.poll(() => canvasSize(page)).toEqual(cut);
	await openSize(page);
	await expect(preset(page, "a4")).toHaveAttribute("aria-checked", "true");
	await expect(
		page.getByTestId("size-fit").getByRole("radio").nth(1),
	).toHaveAttribute("aria-checked", "true");

	// Landscape turns the paper, and the cut follows
	await page.getByTestId("size-orientation").getByRole("radio").nth(2).click();
	await expect(page.getByTestId("size-fact")).toContainText("29.7 × 21 cm");
	await expect
		.poll(async () => {
			const s = await canvasSize(page);
			return s.w > s.h;
		})
		.toBe(true);

	// back to the whole photo
	await page.getByTestId("size-fit").getByRole("radio").nth(0).click();
	await expect.poll(() => canvasSize(page)).toEqual({ w: 480, h: 640 });
});

test("test_size_custom_and_grid_cell_fact", async ({ studio }) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "custom.png");
	await studio.layer("grid", true);
	await openSize(page);
	// 40 cm long side over the 6 cells of the Grid
	await expect(page.getByTestId("size-fact")).toHaveText(
		"30 × 40 cm. Grid cell: about 6.7 cm.",
	);
	await page.getByTestId("size-fit").getByRole("radio").nth(1).click();
	await expect(page.getByTestId("size-fact")).toHaveText(
		"30 × 40 cm. Grid cell: 6.7 cm.",
	);
	// typing a width makes the paper Custom; a number out of range is clamped, never a crash
	const width = page.getByTestId("size-width").locator("input");
	await width.fill("500");
	await expect(preset(page, "custom")).toHaveAttribute("aria-checked", "true");
	await expect(page.getByTestId("size-fact")).toContainText("300 × 40 cm");
	await width.fill("12");
	await expect(page.getByTestId("size-fact")).toContainText("12 × 40 cm");
	await expect(
		page.getByTestId("size-orientation").getByRole("radio").first(),
	).toBeDisabled();
});

test("test_size_real_size_turns_the_zoom_lock_on", async ({ studio }) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "real.png");
	await expect(page.getByTestId("zoom-menu")).toHaveAttribute(
		"data-locked",
		"false",
	);
	await openSize(page);
	await preset(page, "a4").click();
	await page.getByTestId("size-fit").getByRole("radio").nth(1).click();
	await page.getByTestId("size-real").click();
	await expect(page.getByTestId("zoom-menu")).toHaveAttribute(
		"data-locked",
		"true",
	);
	await expect(opened(page)).toHaveCount(0);
	// the zoom menu keeps sharing the lock: the lock card shows the paper width
	await page.getByTestId("zoom-menu").click();
	await page.getByTestId("zoom-real").click();
	await expect(page.getByTestId("lock-width")).toBeVisible();
	await expect(page.getByTestId("lock-width").locator("input")).toHaveValue(
		"21",
	);
});
