// The bottom bar is fixed at the bottom center of the free stage, with no grip, and stays inside the
// stage when the window gets narrow. The Grid toggle of the bar and the cards that stay open while a
// drag pans the photo are checked here too.
import { box, expect, ONE_PX, test } from "./studio";

test("test_the_bar_is_fixed_at_the_bottom_center_and_has_no_grip", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "one.png");
	await expect(page.getByTestId("bar-handle")).toHaveCount(0);
	const stage = await box(page, "stage");
	// the free stage: right of the open panel and its gap, to the window edge
	const panel = await box(page, "files");
	const freeLeft = panel.x + panel.width + 12;
	const bar = await box(page, "stage-bar");
	expect(bar.x + bar.width / 2).toBeCloseTo(
		(freeLeft + stage.x + stage.width) / 2,
		ONE_PX,
	);
	// a drag on the bar's right end does not move it
	const y = bar.y + bar.height / 2;
	const x = bar.x + bar.width - 6;
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(x - 200, y, { steps: 6 });
	await page.mouse.up();
	const after = await box(page, "stage-bar");
	expect(after.x).toBeCloseTo(bar.x, ONE_PX);
	// nothing is saved for a place
	expect(
		await page.evaluate(() => localStorage.getItem("atelier-web-bar")),
	).toBe(null);
});

test("test_the_bar_left_and_right_edges_are_whole_pixels", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "one.png");
	const whole = (v: number) => Math.abs(v - Math.round(v));
	for (const width of [1280, 1111, 900]) {
		await page.setViewportSize({ width, height: 800 });
		await expect
			.poll(async () => {
				const b = await box(page, "stage-bar");
				return Math.max(whole(b.x), whole(b.x + b.width));
			})
			.toBeLessThan(0.01);
	}
});

test("test_the_bar_stays_inside_the_stage_when_the_window_gets_narrow", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "one.png");
	await page.setViewportSize({ width: 900, height: 700 });
	const b = await box(page, "stage-bar");
	expect(b.x + b.width).toBeLessThanOrEqual(900 - 8 + 1.5);
	expect(b.x).toBeGreaterThanOrEqual(0);
});

test("test_on_a_phone_the_bar_stays_in_the_middle", async ({ studio }) => {
	const { page } = studio;
	await page.setViewportSize({ width: 390, height: 800 });
	await studio.openSynthetic(480, 640, "one.png");
	const b = await box(page, "stage-bar");
	expect(b.x + b.width / 2).toBeCloseTo(195, ONE_PX);
});

test("test_bar_toggle_turns_grid_on_and_off_and_opens_no_card", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "one.png");
	// a split button: the main part toggles, the chevron opens the card
	for (const id of ["grid"] as const) {
		const toggle = page.getByTestId(`toggle-${id}`);
		const layer = page.getByTestId(`layer-canvas-${id}`);
		await expect(toggle).toBeVisible();
		await expect(toggle).toHaveAttribute("aria-pressed", "false");
		await studio.drawn(() => studio.toggle(id));
		await expect(layer).toBeVisible();
		await expect(toggle).toHaveAttribute("aria-pressed", "true");
		await expect(page.getByTestId("tool-popup")).toHaveCount(0);
		expect((await studio.saved())[id].on).toBe(true);
		await studio.toggle(id);
		await expect(layer).toHaveCount(0);
		await expect(toggle).toHaveAttribute("aria-pressed", "false");
		await expect(page.getByTestId("tool-popup")).toHaveCount(0);
		expect((await studio.saved())[id].on).toBe(false);
	}
	// the chevron opens the card; the bar part and the card switch then agree, and the card stays
	await page.getByTestId("tool-grid").click();
	const card = page.locator("[data-testid=tool-popup][data-tool=grid]");
	await expect(card).toBeVisible();
	const sw = page.locator("[data-testid=layer-grid] input");
	await expect(sw).not.toBeChecked();
	await studio.drawn(() => studio.toggle("grid"));
	await expect(sw).toBeChecked();
	await expect(card).toBeVisible();
});

test("test_a_card_stays_open_when_a_drag_pans_the_photo_and_a_still_press_closes_it", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "one.png");
	const popup = page.getByTestId("tool-popup");
	const s = await box(page, "stage");
	const x = s.x + s.width / 2;
	const y = s.y + 80;
	const press = async (dx: number) => {
		await page.mouse.move(x, y);
		await page.mouse.down();
		await page.mouse.move(x + dx, y, { steps: 6 });
		await page.mouse.up();
	};
	for (const [i, id] of ["base", "grid", "size"].entries()) {
		await page.getByTestId(`tool-${id}`).click();
		await expect(popup).toBeVisible();
		// A drag pans the photo and keeps the card. The photo may only leave the middle by so much,
		// so the drags go left, right, left.
		const dir = i % 2 === 0 ? -1 : 1;
		const before = await box(page, "photo-canvas");
		await press(40 * dir);
		await expect(popup).toBeVisible();
		await expect
			.poll(async () => (await box(page, "photo-canvas")).x)
			.toBeCloseTo(before.x + 40 * dir, ONE_PX);
		// a press that moves 7 px is still a drag (the limit of a still press is 6 px)
		await press(7 * dir);
		await expect(popup).toBeVisible();
		// a press that moves 4 px is still, even though it pans the photo a little: it closes
		await press(4 * dir);
		await expect(popup).toHaveCount(0);
	}
});
