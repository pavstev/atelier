// The bottom bar can be dragged along the stage by its grip at the right end. The place is saved,
// the bar stays inside the stage, a double click puts it back in the middle, and a phone keeps it
// in the middle with no grip.
import { box, expect, KEYS, stored, test } from "./studio";

test("test_the_bar_drags_by_its_grip_stays_inside_the_stage_and_keeps_its_place", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "one.png");
	const stage = await box(page, "stage");
	// the free stage: right of the open panel and its gap, to the window edge; the bar centers on it
	const panel = await box(page, "files");
	const freeLeft = panel.x + panel.width + 12;
	const freeMiddle = (freeLeft + stage.x + stage.width) / 2;
	const center = async () => {
		const b = await box(page, "stage-bar");
		return b.x + b.width / 2;
	};
	const drag = async (dx: number) => {
		const g = await box(page, "bar-handle");
		const x = g.x + g.width / 2;
		const y = g.y + g.height / 2;
		await page.mouse.move(x, y);
		await page.mouse.down();
		await page.mouse.move(x + dx, y, { steps: 8 });
		await page.mouse.up();
	};
	// at the start it is in the middle of the free stage
	expect(await center()).toBeCloseTo(freeMiddle, 0);
	// an open card closes when the drag begins
	await page.getByTestId("tool-base").click();
	await expect(page.getByTestId("tool-popup")).toBeVisible();
	const start = await center();
	await drag(-200);
	await expect(page.getByTestId("tool-popup")).toHaveCount(0);
	await expect.poll(center).toBeCloseTo(start - 200, 0);
	// it moves along the stage only: the height does not change
	const y = (await box(page, "stage-bar")).y;
	// it stops at the panel edge on the left and the stage edge on the right, 8 px of room
	await drag(-5000);
	const left = await box(page, "stage-bar");
	expect(left.x).toBeCloseTo(freeLeft + 8, 0);
	expect(left.y).toBeCloseTo(y, 0);
	await drag(5000);
	const right = await box(page, "stage-bar");
	expect(right.x + right.width).toBeCloseTo(stage.x + stage.width - 8, 0);
	// the place is saved as a share of the stage width and survives a reload
	await drag(-300);
	const x = (await stored(page, KEYS.bar)) as { x: number };
	expect(x.x).toBeGreaterThan(0);
	expect(x.x).toBeLessThan(1);
	const before = await center();
	await page.reload();
	await expect.poll(center).toBeCloseTo(before, 0);
	// a double click on the grip puts the bar in the middle again
	const g = await box(page, "bar-handle");
	await page.mouse.dblclick(g.x + g.width / 2, g.y + g.height / 2);
	await expect.poll(center).toBeCloseTo(freeMiddle, 0);
	// a bad save gives the middle
	await page.evaluate(
		(k) => localStorage.setItem(k, JSON.stringify({ x: "left" })),
		KEYS.bar,
	);
	await page.reload();
	await expect.poll(center).toBeCloseTo(freeMiddle, 0);
});

test("test_the_bar_stays_inside_the_stage_when_the_window_gets_narrow", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "one.png");
	const g = await box(page, "bar-handle");
	await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
	await page.mouse.down();
	await page.mouse.move(g.x + 5000, g.y + g.height / 2, { steps: 4 });
	await page.mouse.up();
	await page.setViewportSize({ width: 900, height: 700 });
	const b = await box(page, "stage-bar");
	expect(b.x + b.width).toBeLessThanOrEqual(900 - 8 + 1);
	expect(b.x).toBeGreaterThanOrEqual(0);
});

test("test_on_a_phone_the_bar_has_no_grip_and_stays_in_the_middle", async ({
	studio,
}) => {
	const { page } = studio;
	await page.setViewportSize({ width: 390, height: 800 });
	await studio.openSynthetic(480, 640, "one.png");
	await expect(page.getByTestId("bar-handle")).toBeHidden();
	const b = await box(page, "stage-bar");
	expect(b.x + b.width / 2).toBeCloseTo(195, 0);
});

test("test_bar_toggle_turns_edges_and_grid_on_and_off_and_opens_no_card", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "one.png");
	// a split button: the main part toggles, the chevron opens the card
	for (const id of ["edges", "grid"] as const) {
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
	await page.getByTestId("tool-edges").click();
	const card = page.locator("[data-testid=tool-popup][data-tool=edges]");
	await expect(card).toBeVisible();
	const sw = page.locator("[data-testid=layer-edges] input");
	await expect(sw).not.toBeChecked();
	await studio.drawn(() => studio.toggle("edges"));
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
	for (const [i, id] of ["base", "edges", "size"].entries()) {
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
			.toBeCloseTo(before.x + 40 * dir, 0);
		// a press that moves 7 px is still a drag (the limit of a still press is 6 px)
		await press(7 * dir);
		await expect(popup).toBeVisible();
		// a press that moves 4 px is still, even though it pans the photo a little: it closes
		await press(4 * dir);
		await expect(popup).toHaveCount(0);
	}
});
