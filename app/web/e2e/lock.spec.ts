// Lock zoom ("Real size (cm)..." in the zoom menu): the menu item alone fixes the zoom, the photo
// takes the asked cm on screen, the wheel and a pinch leave the size, a drag still moves it, and
// Unlock in the menu sets it free.
import { expect, MAIN_PHOTO, test } from "./studio";

test("test_lock_zoom", async ({ studio }) => {
	const { page } = studio;
	await studio.open(MAIN_PHOTO);
	const canvas = page.getByTestId("photo-canvas");
	const box = async () => {
		const b = await canvas.boundingBox();
		if (!b) throw new Error("no photo canvas");
		return b;
	};
	const stage = page.getByTestId("stage");
	const s = await stage.boundingBox();
	if (!s) throw new Error("no stage");
	await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);

	// The menu item alone locks the zoom: a wheel turn and a trackpad pinch (a wheel with Ctrl) do
	// nothing, before any width is typed.
	await studio.zoom("real");
	await page.getByTestId("screen-width").locator("input").fill("");
	await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
	const fixed = (await box()).width;
	await page.mouse.wheel(0, -400);
	await page.keyboard.down("Control");
	await page.mouse.wheel(0, -200);
	await page.keyboard.up("Control");
	await page.waitForTimeout(100);
	expect((await box()).width).toBeCloseTo(fixed, 0);

	await page.getByTestId("lock-width").locator("input").fill("10");
	await page.getByTestId("screen-width").locator("input").fill("30");
	const screenPx = await page.evaluate(() => window.screen.width);
	const want = (10 * screenPx) / 30;
	await expect.poll(async () => (await box()).width).toBeCloseTo(want, 0);

	// The wheel and a pinch do not change the size.
	await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
	await page.mouse.wheel(0, -400);
	await page.keyboard.down("Control");
	await page.mouse.wheel(0, 300);
	await page.keyboard.up("Control");
	await page.waitForTimeout(100);
	expect((await box()).width).toBeCloseTo(want, 0);

	// A drag moves the picture and keeps the size.
	const before = await box();
	await page.mouse.down();
	await page.mouse.move(s.x + s.width / 2 + 60, s.y + s.height / 2 + 30, {
		steps: 4,
	});
	await page.mouse.up();
	const after = await box();
	expect(after.x - before.x).toBeCloseTo(60, 0);
	expect(after.width).toBeCloseTo(want, 0);

	// The drag was a press outside the card, so the card is closed: "Real size (cm)..." opens it
	// again, and Unlock turns the lock off. The photo fits the stage again.
	await expect(page.getByTestId("lock-card")).toHaveCount(0);
	await studio.zoom("real");
	await expect(page.getByTestId("lock-card")).toBeVisible();
	await studio.zoom("unlock");
	await expect.poll(async () => (await box()).width).not.toBeCloseTo(want, 0);
});

test.describe("on a MacBook Pro 14-inch screen", () => {
	test.use({ screen: { width: 1512, height: 982 }, deviceScaleFactor: 2 });

	test("test_lock_zoom_finds_the_screen", async ({ studio }) => {
		const { page } = studio;
		await studio.open(MAIN_PHOTO);
		await studio.zoom("real");
		await expect(page.getByTestId("screen-width").locator("input")).toHaveValue(
			"30.25",
		);
		await expect(page.getByTestId("screen-found")).toContainText(
			"MacBook Pro 14-inch",
		);
		await page.getByTestId("lock-width").locator("input").fill("18");
		const b = await page.getByTestId("photo-canvas").boundingBox();
		expect(b?.width).toBeCloseTo((18 * 1512) / 30.25, 0);
	});
});
