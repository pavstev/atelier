// The real size: the Real size item of the zoom menu (a toggle) and the switch of the Paper card lock
// the zoom to the photo width on the paper. The photo takes the paper width in cm on screen, the
// wheel and a pinch leave the size, a drag still moves it, and the item again sets it free. With no
// screen width yet, the item opens the Paper card, which asks for it. Also: the order of the bar.
import { box, expect, MAIN_PHOTO, test } from "./studio";

test("test_bar_order", async ({ studio }) => {
	const { page } = studio;
	await studio.open(MAIN_PHOTO);
	const labels = await page
		.locator("[data-testid=photo-hold], [data-bar-button]")
		.evaluateAll((els) =>
			els
				.map((e) => e.getAttribute("aria-label") ?? "")
				.filter((l) => l && !l.endsWith(" options")),
		);
	expect(labels.slice(0, 7)).toEqual([
		"See photo",
		"Base",
		"Edges",
		"Grid",
		"Paper",
		"Zoom",
		"Color picker",
	]);
});

test("test_lock_zoom", async ({ studio }) => {
	const { page } = studio;
	await studio.open(MAIN_PHOTO);
	const photo = () => box(page, "photo-canvas");
	const s = await box(page, "stage");
	const center = () => page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);

	// zoom_real_toggle: the item locks the zoom; with no screen width it opens the Paper card
	await expect(page.getByTestId("zoom-menu")).toHaveAttribute(
		"data-locked",
		"false",
	);
	await studio.zoom("real");
	await expect(page.getByTestId("zoom-menu")).toHaveAttribute(
		"data-locked",
		"true",
	);
	await expect(
		page.locator("[data-testid=tool-popup][data-tool=size]"),
	).toBeVisible();
	await expect(page.getByTestId("paper-real").locator("input")).toBeChecked();
	// a wheel turn and a trackpad pinch (a wheel with Ctrl) do nothing, before any width is typed
	await center();
	const fixed = (await photo()).width;
	await page.mouse.wheel(0, -400);
	await page.keyboard.down("Control");
	await page.mouse.wheel(0, -200);
	await page.keyboard.up("Control");
	await page.waitForTimeout(100);
	expect((await photo()).width).toBeCloseTo(fixed, 0);

	// the paper: cut to a 10 cm wide Custom paper; the screen is 30 cm wide
	await page.getByTestId("size-fit").getByRole("radio").nth(1).click();
	await page.getByTestId("size-width").locator("input").fill("10");
	await page.getByTestId("screen-width").locator("input").fill("30");
	const screenPx = await page.evaluate(() => window.screen.width);
	const want = (10 * screenPx) / 30;
	await expect.poll(async () => (await photo()).width).toBeCloseTo(want, 0);

	// The wheel and a pinch do not change the size.
	await center();
	await page.mouse.wheel(0, -400);
	await page.keyboard.down("Control");
	await page.mouse.wheel(0, 300);
	await page.keyboard.up("Control");
	await page.waitForTimeout(100);
	expect((await photo()).width).toBeCloseTo(want, 0);

	// A drag moves the picture and keeps the size (Esc closes the card first).
	await page.keyboard.press("Escape");
	await expect(page.getByTestId("tool-popup")).toHaveCount(0);
	await center();
	const before = await photo();
	await page.mouse.down();
	await page.mouse.move(s.x + s.width / 2 + 60, s.y + s.height / 2 + 30, {
		steps: 4,
	});
	await page.mouse.up();
	const after = await photo();
	expect(after.x - before.x).toBeCloseTo(60, 0);
	expect(after.width).toBeCloseTo(want, 0);

	// The item again turns the lock off. The photo fits the stage again.
	await studio.zoom("real");
	await expect(page.getByTestId("zoom-menu")).toHaveAttribute(
		"data-locked",
		"false",
	);
	await expect.poll(async () => (await photo()).width).not.toBeCloseTo(want, 0);

	// the old Unlock item still works while the lock is on
	await studio.zoom("real");
	await studio.zoom("unlock");
	await expect(page.getByTestId("zoom-menu")).toHaveAttribute(
		"data-locked",
		"false",
	);
});

test.describe("on a MacBook Pro 14-inch screen", () => {
	test.use({ screen: { width: 1512, height: 982 }, deviceScaleFactor: 2 });

	test("test_lock_zoom_finds_the_screen", async ({ studio }) => {
		const { page } = studio;
		await studio.open(MAIN_PHOTO);
		// the screen is known, so the item does not open the Paper card
		await studio.zoom("real");
		await expect(page.getByTestId("zoom-menu")).toHaveAttribute(
			"data-locked",
			"true",
		);
		await expect(page.getByTestId("tool-popup")).toHaveCount(0);
		await page.getByTestId("tool-size").click();
		await expect(page.getByTestId("screen-width").locator("input")).toHaveValue(
			"30.25",
		);
		await expect(page.getByTestId("screen-found")).toContainText(
			"MacBook Pro 14-inch",
		);
		await page.getByTestId("size-fit").getByRole("radio").nth(1).click();
		await page.getByTestId("size-width").locator("input").fill("18");
		await expect
			.poll(
				async () =>
					(await page.getByTestId("photo-canvas").boundingBox())?.width,
			)
			.toBeCloseTo((18 * 1512) / 30.25, 0);
	});
});
