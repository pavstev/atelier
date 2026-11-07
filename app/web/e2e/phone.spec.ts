// A phone-sized window (390 x 844): the side panel is a drawer over the stage. It starts closed,
// opens from the edge handle or the [ key, a press on the scrim closes it, picking a photo closes
// it, and nothing sticks out of the window.
import { box, expect, test } from "./studio";

test.use({ viewport: { width: 390, height: 844 } });

const wide = (page: import("@playwright/test").Page) =>
	page.evaluate(() => document.documentElement.scrollWidth > innerWidth);

test("test_the_drawer_starts_closed_opens_over_the_stage_and_closes_again", async ({
	studio,
}) => {
	const { page } = studio;
	const files = page.getByTestId("files");
	await expect(files).toHaveAttribute("data-collapsed", "true");
	await studio.openSynthetic(480, 640, "one.png");
	await expect(files).toHaveAttribute("data-collapsed", "true");
	// the stage has the whole window
	const stage = await page.getByTestId("stage").boundingBox();
	expect(stage?.width).toBeCloseTo(390, 0);
	await expect(page.getByTestId("panel-scrim")).toHaveCount(0);

	// the edge handle opens the drawer; it overlays the stage and is at most 88% wide
	await page.getByTestId("files-expand").click();
	await expect(files).toHaveAttribute("data-collapsed", "false");
	const drawer = await files.boundingBox();
	if (!drawer) throw new Error("no drawer");
	expect(drawer.x).toBeCloseTo(0, 0);
	expect(drawer.width).toBeLessThanOrEqual(390 * 0.88 + 1);
	expect((await page.getByTestId("stage").boundingBox())?.width).toBeCloseTo(
		390,
		0,
	);
	// the logo and the four icon buttons fit inside the drawer, in one row
	for (const id of [
		"logo",
		"photo-add",
		"photo-search-toggle",
		"photo-sort",
		"photo-layout",
	]) {
		const b = await box(page, id);
		expect(b.x + b.width).toBeLessThanOrEqual(drawer.width + 0.5);
	}
	// the cards fit the drawer without sideways scroll
	expect(await files.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
		true,
	);
	expect(await wide(page)).toBe(false);

	// a press on the scrim closes it
	await page.mouse.click(380, 400);
	await expect(files).toHaveAttribute("data-collapsed", "true");
	// the [ key opens it, and picking a photo closes it so the photo shows
	await page.keyboard.press("[");
	await expect(files).toHaveAttribute("data-collapsed", "false");
	await page.getByTestId("photo-open").click();
	await expect(files).toHaveAttribute("data-collapsed", "true");
});

test("test_every_control_is_inside_the_phone_window_and_the_tools_open_as_sheets", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "one.png");
	await page.getByTestId("files-expand").click();
	// a press on the scrim closes the drawer; the tools are in the bar and open as bottom sheets
	await page.mouse.click(380, 400);
	await expect(page.getByTestId("files")).toHaveAttribute(
		"data-collapsed",
		"true",
	);
	await studio.base("values");
	await expect(page.getByTestId("layer-canvas-base")).toBeVisible();
	const sheet = await page.getByTestId("tool-popup").boundingBox();
	if (!sheet) throw new Error("no sheet");
	expect(sheet.x).toBeCloseTo(0, 0);
	expect(sheet.width).toBeCloseTo(390, 0);
	expect(sheet.y + sheet.height).toBeCloseTo(844, 0);
	await studio.layer("edges", true);
	// Esc closes the sheet
	await page.keyboard.press("Escape");
	await expect(page.getByTestId("tool-popup")).toHaveCount(0);
	// the bar fits the window
	const bar = await page.getByTestId("stage-bar").boundingBox();
	if (!bar) throw new Error("no bar");
	expect(bar.x).toBeGreaterThanOrEqual(0);
	expect(bar.x + bar.width).toBeLessThanOrEqual(390);
	await page.getByTestId("files-expand").click();
	// every button inside the drawer is fully inside the window
	const boxes = await page
		.getByTestId("files")
		.locator("button:visible")
		.evaluateAll((els) =>
			els.map((e) => {
				const r = e.getBoundingClientRect();
				return {
					right: r.right,
					left: r.left,
					name: e.getAttribute("aria-label") ?? e.textContent,
				};
			}),
		);
	for (const b of boxes) {
		expect(b.left, String(b.name)).toBeGreaterThanOrEqual(0);
		expect(b.right, String(b.name)).toBeLessThanOrEqual(390);
	}
	expect(await wide(page)).toBe(false);
});
