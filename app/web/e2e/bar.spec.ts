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
	// at the start it is in the middle
	expect(await center()).toBeCloseTo(stage.x + stage.width / 2, 0);
	// an open card closes when the drag begins
	await page.getByTestId("tool-base").click();
	await expect(page.getByTestId("tool-popup")).toBeVisible();
	const start = await center();
	await drag(-200);
	await expect(page.getByTestId("tool-popup")).toHaveCount(0);
	await expect.poll(center).toBeCloseTo(start - 200, 0);
	// it moves along the stage only: the height does not change
	const y = (await box(page, "stage-bar")).y;
	// it stops at the stage edges, whole bar inside, 8 px of room
	await drag(-5000);
	const left = await box(page, "stage-bar");
	expect(left.x).toBeCloseTo(stage.x + 8, 0);
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
	await expect.poll(center).toBeCloseTo(stage.x + stage.width / 2, 0);
	// a bad save gives the middle
	await page.evaluate(
		(k) => localStorage.setItem(k, JSON.stringify({ x: "left" })),
		KEYS.bar,
	);
	await page.reload();
	await expect.poll(center).toBeCloseTo(stage.x + stage.width / 2, 0);
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

test("test_toggle_does_not_open_a_card_and_a_drag_keeps_one", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "one.png");
	// a split button: the main part toggles, the chevron opens the card
	const toggle = page.getByTestId("toggle-grid");
	if (await toggle.count()) {
		await toggle.click();
		await expect(page.getByTestId("tool-popup")).toHaveCount(0);
		await expect(toggle).toHaveAttribute("aria-pressed", "true");
	}
	// a card stays open when a drag pans the stage, and a still click outside closes it
	await page.getByTestId("tool-base").click();
	await expect(page.getByTestId("tool-popup")).toBeVisible();
	const s = await box(page, "stage");
	const x = s.x + s.width / 2;
	const y = s.y + 80;
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(x + 40, y, { steps: 6 });
	await page.mouse.up();
	await expect(page.getByTestId("tool-popup")).toBeVisible();
	await page.mouse.click(x, y);
	await expect(page.getByTestId("tool-popup")).toHaveCount(0);
});
