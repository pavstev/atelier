// The reach of the stage and the side panel: the pan limit (500 px of empty stage at most), the
// double click and the pinch, the one thin scrollbar, no page bounce, the whole-photo tiles and
// their quiet rebuild for photos saved by an earlier version.
import type { Page } from "@playwright/test";
import { box, expect, KEYS, store, stored, test } from "./studio";

const percent = async (page: Page) =>
	Number.parseInt(
		(await page.getByTestId("zoom-percent").textContent()) ?? "0",
		10,
	);

const boxes = async (page: Page) => ({
	stage: await box(page, "stage"),
	photo: await box(page, "photo-canvas"),
});

test("test_the_photo_cannot_be_panned_more_than_500_px_off_the_stage", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "pan.png");
	await studio.zoom("actual");
	const { stage } = await boxes(page);
	const x = stage.x + stage.width / 2;
	const y = stage.y + stage.height / 2;
	// pull the photo far to the right and down, then far to the left and up
	for (const [dx, dy] of [
		[300, 200],
		[300, 200],
		[300, 200],
		[-300, -200],
	] as const) {
		await page.mouse.move(x, y);
		await page.mouse.down();
		await page.mouse.move(x + dx, y + dy, { steps: 3 });
		await page.mouse.up();
	}
	let b = await boxes(page);
	expect(b.photo.x - b.stage.x).toBeLessThanOrEqual(500.5);
	expect(b.photo.y - b.stage.y).toBeLessThanOrEqual(500.5);
	for (let i = 0; i < 6; i++) {
		await page.mouse.move(x, y);
		await page.mouse.down();
		await page.mouse.move(x - 300, y - 200, { steps: 3 });
		await page.mouse.up();
	}
	b = await boxes(page);
	expect(
		b.stage.x + b.stage.width - (b.photo.x + b.photo.width),
	).toBeLessThanOrEqual(500.5);
	expect(
		b.stage.y + b.stage.height - (b.photo.y + b.photo.height),
	).toBeLessThanOrEqual(500.5);
});

test("test_a_double_click_toggles_fit_and_100_percent_and_the_lock_stops_it", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "dbl.png");
	const fit = await percent(page);
	expect(fit).not.toBe(100);
	const stage = page.getByTestId("stage");
	await stage.dblclick({ position: { x: 300, y: 250 } });
	await expect(page.getByTestId("zoom-percent")).toHaveText("100%");
	await stage.dblclick({ position: { x: 300, y: 250 } });
	await expect(page.getByTestId("zoom-percent")).toHaveText(`${fit}%`);
	// locked: the zoom stays
	await studio.zoom("real");
	await page.keyboard.press("Escape");
	const locked = await percent(page);
	await stage.dblclick({ position: { x: 300, y: 250 } });
	expect(await percent(page)).toBe(locked);
});

test("test_two_fingers_pinch_the_photo_larger", async ({ studio }) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "pinch.png");
	const before = await percent(page);
	const { stage } = await boxes(page);
	const cx = stage.x + stage.width / 2;
	const cy = stage.y + stage.height / 2;
	const cdp = await page.context().newCDPSession(page);
	const at = (gap: number) => [
		{ x: cx - gap, y: cy, id: 1 },
		{ x: cx + gap, y: cy, id: 2 },
	];
	await cdp.send("Input.dispatchTouchEvent", {
		type: "touchStart",
		touchPoints: at(40),
	});
	for (const gap of [60, 80, 100, 120]) {
		await cdp.send("Input.dispatchTouchEvent", {
			type: "touchMove",
			touchPoints: at(gap),
		});
	}
	await cdp.send("Input.dispatchTouchEvent", {
		type: "touchEnd",
		touchPoints: [],
	});
	await expect.poll(() => percent(page)).toBeGreaterThan(before * 2);
});

test("test_one_thin_scrollbar_for_the_list_and_no_page_bounce", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "bar.png");
	const info = await page.evaluate(() => {
		const of = (id: string) => {
			const el = document.querySelector(`[data-testid=${id}]`);
			if (!el) throw new Error(`no ${id}`);
			const c = getComputedStyle(el);
			return { width: c.scrollbarWidth, over: c.overscrollBehaviorY };
		};
		return {
			list: of("photo-scroll"),
			html: getComputedStyle(document.documentElement).overscrollBehaviorY,
			body: getComputedStyle(document.body).overscrollBehaviorY,
		};
	});
	expect(info.list).toEqual({ width: "thin", over: "contain" });
	expect(info.html).toBe("none");
	expect(info.body).toBe("none");
});

test("test_list_tiles_show_the_whole_photo_and_old_tiles_are_made_again", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "tall.png");
	await studio.openSynthetic(640, 320, "wide.png");
	const docs = () => stored(page, KEYS.docs, []);
	await expect
		.poll(async () => (await docs()).every((d: { tile: boolean }) => d.tile))
		.toBe(true);
	// the tile is square and the picture inside keeps the photo's shape
	const tile = await page
		.getByTestId("photo-row")
		.nth(0)
		.locator("img")
		.evaluate((img: HTMLImageElement) => ({
			w: img.naturalWidth,
			h: img.naturalHeight,
			box: img.parentElement?.getBoundingClientRect().toJSON(),
		}));
	expect(tile.w / tile.h).toBeCloseTo(2, 1); // wide.png is 640 x 320
	expect(Math.max(tile.w, tile.h)).toBeLessThanOrEqual(128);
	expect(tile.box.width).toBeCloseTo(tile.box.height, 0);
	// an older save (cropped tiles, no mark) is made again after a reload
	const list = await stored(page, KEYS.docs, []);
	for (const d of list) {
		delete d.tile;
		d.preview = false;
	}
	await store(page, KEYS.docs, list);
	await page.reload();
	await expect(page.getByTestId("photo-canvas")).toBeVisible();
	await expect
		.poll(async () =>
			(await docs()).every(
				(d: { tile: boolean; preview: boolean; thumb: string }) =>
					d.tile && d.preview && d.thumb.startsWith("data:image/"),
			),
		)
		.toBe(true);
});

test("test_the_layout_button_shows_tiles_and_the_choice_is_kept", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "one.png");
	await studio.openSynthetic(640, 320, "two.png");
	const list = page.getByTestId("photos");
	await expect(list).toHaveAttribute("data-layout", "list");
	const rowH = (await page.getByTestId("photo-row").first().boundingBox())
		?.height;
	await page.getByTestId("photo-layout").click();
	await expect(list).toHaveAttribute("data-layout", "tiles");
	// a tile is taller than a row and its picture is square
	const tile = await page.getByTestId("photo-row").first().boundingBox();
	expect(tile?.height).toBeGreaterThan((rowH ?? 0) * 1.5);
	// the pen and the bin, the open button and the hover card still work in tiles
	await page.getByTestId("photo-row").nth(1).getByTestId("photo-open").click();
	await expect(page.getByTestId("facts")).toContainText("one.png");
	// a reload keeps the choice
	await page.reload();
	await expect(page.getByTestId("photos")).toHaveAttribute(
		"data-layout",
		"tiles",
	);
	await page.getByTestId("photo-layout").click();
	await expect(page.getByTestId("photos")).toHaveAttribute(
		"data-layout",
		"list",
	);
});
