// The small keyboard set (Space, arrows, [), the lock card that closes on an outside press,
// Fit and 100% that stay off while the lock is on, the single top row of icon buttons with tips, the
// logo outline, the hover card, the saved zoom and the list that fills the panel.
import type { Page } from "@playwright/test";
import { box, expect, KEYS, stored, test } from "./studio";

const canvasX = (page: Page) => box(page, "photo-canvas");

test("test_the_logo_and_the_four_icon_buttons_share_one_row_and_each_has_a_tip", async ({
	studio,
}) => {
	const { page } = studio;
	const rows = [
		"photo-add",
		"photo-search-toggle",
		"photo-sort",
		"photo-layout",
	];
	const logo = await box(page, "logo");
	let right = 0;
	for (const id of rows) {
		const b = await box(page, id);
		// one row: the buttons are centered on the logo, right of it, and in the order given
		expect(b.y + b.height / 2).toBeCloseTo(logo.y + logo.height / 2, 0);
		expect(b.x).toBeGreaterThan(logo.x + logo.width);
		expect(b.x).toBeGreaterThan(right);
		right = b.x;
	}
	// the buttons sit at the right edge of the panel
	const files = await box(page, "files");
	const layoutBtn = await box(page, "photo-layout");
	expect(files.x + files.width - (layoutBtn.x + layoutBtn.width)).toBeLessThan(
		20,
	);
	// each icon-only button has a tip (text on hover) and no visible label
	for (const [id, tip] of [
		["photo-add", "Add photos"],
		["photo-search-toggle", "Search photos"],
		["photo-sort", "Sort photos"],
		["photo-layout", "Show as tiles"],
	]) {
		await expect(page.getByTestId(id)).toHaveText("");
		// the pointer comes from inside the page, as a real one does (a jump from the corner of
		// a fresh page does not count as a hover for the first button)
		await page.mouse.move(600, 400);
		await page.getByTestId(id).hover();
		await expect(page.getByRole("tooltip", { name: tip })).toBeVisible();
		await page.mouse.move(600, 400);
		await expect(page.getByRole("tooltip")).toHaveCount(0);
	}
	// the Sort tip does not stop the menu from opening
	await page.getByTestId("photo-sort").click();
	await expect(page.getByRole("menuitemradio").first()).toBeVisible();
	await page.keyboard.press("Escape");
});

test("test_rename_and_delete_show_a_tip_below_them", async ({ studio }) => {
	const { page } = studio;
	await studio.openSynthetic(120, 160, "one.png");
	const row = page.getByTestId("photo-row");
	await row.hover();
	const del = row.getByTestId("photo-delete");
	await del.hover();
	const tip = page.getByRole("tooltip", { name: "Delete" });
	await expect(tip).toBeVisible();
	const t = await tip.boundingBox();
	const d = await del.boundingBox();
	if (!t || !d) throw new Error("no boxes");
	expect(t.y).toBeGreaterThan(d.y + d.height - 1);
});

test("test_space_holds_the_bare_photo_arrows_move_it_and_the_bracket_hides_the_panel", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "one.png");
	await studio.base("values");
	const layer = page.getByTestId("layer-canvas-base");
	await expect(layer).toBeVisible();
	await page.mouse.click(5, 5);
	await page.keyboard.down("Space");
	await expect(layer).toBeHidden();
	await page.keyboard.up("Space");
	await expect(layer).toBeVisible();

	const before = await canvasX(page);
	await page.keyboard.press("ArrowRight");
	await expect
		.poll(async () => (await canvasX(page)).x - before.x)
		.toBeCloseTo(10, 0);
	await page.keyboard.press("Shift+ArrowDown");
	await expect
		.poll(async () => (await canvasX(page)).y - before.y)
		.toBeCloseTo(100, 0);

	await page.keyboard.press("[");
	await expect(page.getByTestId("files")).toHaveAttribute(
		"data-collapsed",
		"true",
	);
	await page.keyboard.press("[");
	await expect(page.getByTestId("files")).toHaveAttribute(
		"data-collapsed",
		"false",
	);
});

test("test_keys_are_left_to_the_search_box", async ({ studio }) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "one.png");
	await page.getByTestId("photo-search-toggle").click();
	const input = page.getByTestId("photo-search");
	await input.focus();
	const before = await canvasX(page);
	await page.keyboard.type("a b [ ");
	await page.keyboard.press("ArrowLeft");
	await expect(input).toHaveValue("a b [ ");
	await expect(page.getByTestId("files")).toHaveAttribute(
		"data-collapsed",
		"false",
	);
	expect((await canvasX(page)).x).toBeCloseTo(before.x, 0);
});

test("test_the_lock_card_closes_on_an_outside_press_and_fit_is_off_while_locked", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "one.png");
	// the menu items are there while the zoom is free
	await page.getByTestId("zoom-menu").click();
	await expect(page.getByTestId("zoom-fit")).toBeEnabled();
	await expect(page.getByTestId("zoom-unlock")).toHaveCount(0);
	await page.getByTestId("zoom-real").click();
	const card = page.getByTestId("lock-card");
	await expect(card).toBeVisible();
	// locked: the button shows a lock, Fit, 100% and 200% are off, the menu has Unlock
	await expect(page.getByTestId("zoom-menu")).toHaveAttribute(
		"data-locked",
		"true",
	);
	await page.getByTestId("zoom-menu").click();
	await expect(page.getByTestId("zoom-fit")).toBeDisabled();
	await expect(page.getByTestId("zoom-actual")).toBeDisabled();
	await expect(page.getByTestId("zoom-200")).toBeDisabled();
	await expect(page.getByTestId("zoom-unlock")).toBeVisible();
	await page.keyboard.press("Escape");
	// a press inside the card keeps it
	await expect(card).toBeVisible();
	await card.click({ position: { x: 4, y: 4 } });
	await expect(card).toBeVisible();
	// a press outside closes it; the lock stays on
	await page.getByTestId("files").click({ position: { x: 20, y: 400 } });
	await expect(card).toHaveCount(0);
	await expect(page.getByTestId("zoom-menu")).toHaveAttribute(
		"data-locked",
		"true",
	);
	// Esc closes it too
	await studio.zoom("real");
	await expect(card).toBeVisible();
	// the menu has left (it takes the first Esc while it is still closing)
	await expect(page.getByRole("menu")).toHaveCount(0);
	await page.keyboard.press("Escape");
	await expect(card).toHaveCount(0);
	// Unlock turns the lock off
	await studio.zoom("unlock");
	await expect(card).toHaveCount(0);
	await expect(page.getByTestId("zoom-menu")).toHaveAttribute(
		"data-locked",
		"false",
	);
	await page.getByTestId("zoom-menu").click();
	await expect(page.getByTestId("zoom-fit")).toBeEnabled();
});

test("test_the_logo_gets_a_thin_outline_only_with_the_left_panel_hidden", async ({
	studio,
}) => {
	const { page } = studio;
	const outline = page.getByTestId("logo-outline");
	await expect(outline).toHaveCSS("opacity", "0");
	await page.getByTestId("files-fold").click({ force: true });
	await expect(page.getByTestId("files")).toHaveAttribute(
		"data-collapsed",
		"true",
	);
	await expect(outline).toHaveCSS("opacity", "0.55");
	await expect(page.getByTestId("logo-shade")).toHaveCount(0);
	// the outline color is the opposite tone of the letters: light in the light theme, dark in the dark
	const tone = () => outline.evaluate((e) => getComputedStyle(e).stroke);
	const light = await tone();
	await page.emulateMedia({ colorScheme: "dark" });
	await expect.poll(tone).not.toBe(light);
});

test("test_hover_card_shows_a_bigger_preview_with_the_facts_and_they_survive_a_reload", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "card.png");
	// a row is only the small preview and the name
	const row = page.getByTestId("photo-row");
	await expect(row).not.toContainText("KB");
	await expect(page.getByTestId("photo-open")).toHaveCSS("cursor", "pointer");
	const show = async () => {
		await page.mouse.move(700, 500);
		await page.getByTestId("photo-open").hover();
		const card = page.getByTestId("photo-card");
		await expect(card).toBeVisible();
		await expect(card).toContainText("card.png");
		await expect(card).toContainText("480 × 640");
		await expect(card).toContainText(/\d+ KB/);
		// the added date is formatted with a time
		await expect(card).toContainText(/20\d\d.*\d{1,2}:\d\d/);
		// the card opens to the right of the panel row, and the bigger preview has loaded
		const c = await card.boundingBox();
		const r = await row.boundingBox();
		if (!c || !r) throw new Error("no boxes");
		expect(c.x).toBeGreaterThan(r.x + r.width - 1);
		const img = page.getByTestId("photo-card-image");
		await expect
			.poll(() => img.evaluate((e) => (e as HTMLImageElement).naturalWidth))
			.toBeGreaterThan(80);
	};
	await show();
	// the pixel size and the preview are saved in the list
	await expect
		.poll(async () => {
			const kept = await stored(page, KEYS.docs, []);
			return [kept[0]?.width, kept[0]?.height, kept[0]?.preview];
		})
		.toEqual([480, 640, true]);
	await page.reload();
	await expect(page.getByTestId("photo-row")).toHaveCount(1);
	await show();
});

test("test_zoom_and_position_of_a_photo_survive_a_reload", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "view.png");
	await studio.zoom("actual");
	await expect(page.getByTestId("zoom-percent")).toHaveText("100%");
	const stage = await page.getByTestId("stage").boundingBox();
	if (!stage) throw new Error("no stage");
	await page.mouse.move(stage.x + 300, stage.y + 300);
	await page.mouse.down();
	await page.mouse.move(stage.x + 340, stage.y + 280, { steps: 4 });
	await page.mouse.up();
	const before = await canvasX(page);
	await expect
		.poll(async () => Object.keys(await stored(page, KEYS.views, {})))
		.toHaveLength(1);
	await page.reload();
	await expect(page.getByTestId("photo-canvas")).toBeVisible();
	await expect(page.getByTestId("zoom-percent")).toHaveText("100%");
	const after = await canvasX(page);
	expect(after.x).toBeCloseTo(before.x, 0);
	expect(after.y).toBeCloseTo(before.y, 0);
	// Fit forgets the saved view
	await studio.zoom("fit");
	await expect(page.getByTestId("zoom-percent")).not.toHaveText("100%");
	await expect
		.poll(async () => Object.keys(await stored(page, KEYS.views, {})))
		.toHaveLength(0);
});

test("test_a_deleted_photo_forgets_its_saved_view", async ({ studio }) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "gone.png");
	await studio.zoom("actual");
	const views = async () => Object.keys(await stored(page, KEYS.views, {}));
	await expect.poll(views).toHaveLength(1);
	await page.getByTestId("photo-row").first().hover();
	await page.getByTestId("photo-delete").first().click();
	await expect(page.getByTestId("photo-row")).toHaveCount(0);
	await expect.poll(views).toHaveLength(0);
});

test("test_nothing_in_the_panel_is_resizable_and_the_list_fills_it", async ({
	studio,
}) => {
	const { page } = studio;
	await page.setViewportSize({ width: 1280, height: 900 });
	await studio.openSynthetic(480, 640, "one.png");
	// no handle and no sized box: the list cannot be dragged, and no tools block sits under it
	for (const id of [
		"list-resize",
		"dock",
		"dock-scroll",
		"photos-box",
		"tools",
	])
		await expect(page.getByTestId(id)).toHaveCount(0);
	// the list takes the panel's full height, less the panel's own spacing
	const files = await page.getByTestId("files").boundingBox();
	const list = await page.getByTestId("photo-scroll").boundingBox();
	if (!files || !list) throw new Error("no boxes");
	expect(files.y + files.height - (list.y + list.height)).toBeLessThanOrEqual(
		24,
	);
	// the layout holds only the panel and its width
	expect(Object.keys(await studio.layout()).sort()).toEqual([
		"panels",
		"widths",
	]);
});

test("test_icon_buttons_of_the_stage_have_tips", async ({ studio }) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "one.png");
	for (const [id, tip] of [
		["zoom-menu", /Zoom/],
		["photo-hold", /Hold to see/],
	] as const) {
		await page.mouse.move(700, 300);
		await page.getByTestId(id).hover();
		await expect(page.getByRole("tooltip", { name: tip })).toBeVisible();
	}
	await page.mouse.move(700, 300);
	await page.getByTestId("files-fold").hover({ force: true });
	await expect(
		page.getByRole("tooltip", { name: "Hide the side panel" }),
	).toBeVisible();
});
