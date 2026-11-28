// The reach of the stage and the side panel: the pan limit (500 px of empty stage at most), the
// double click and the pinch, the one thin scrollbar, no page bounce, the whole-photo list previews
// and their quiet rebuild for photos saved by an earlier version, and the list as rows only.
import type { Page } from "@playwright/test";
import { box, dragBy, expect, KEYS, store, stored, test } from "./studio";

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
	// pull the photo far to the right and down, then far to the left and up
	for (const [dx, dy] of [
		[300, 200],
		[300, 200],
		[300, 200],
		[-300, -200],
	] as const) {
		await dragBy(page, "stage", dx, dy, 3);
	}
	let b = await boxes(page);
	expect(b.photo.x - b.stage.x).toBeLessThanOrEqual(500.5);
	expect(b.photo.y - b.stage.y).toBeLessThanOrEqual(500.5);
	for (let i = 0; i < 6; i++) await dragBy(page, "stage", -300, -200, 3);
	b = await boxes(page);
	expect(
		b.stage.x + b.stage.width - (b.photo.x + b.photo.width),
	).toBeLessThanOrEqual(500.5);
	expect(
		b.stage.y + b.stage.height - (b.photo.y + b.photo.height),
	).toBeLessThanOrEqual(500.5);
});

test("test_a_double_click_toggles_fit_and_100_percent", async ({ studio }) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "dbl.png");
	const fit = await percent(page);
	expect(fit).not.toBe(100);
	const stage = page.getByTestId("stage");
	await stage.dblclick({ position: { x: 700, y: 250 } });
	await expect(page.getByTestId("zoom-percent")).toHaveText("100%");
	await stage.dblclick({ position: { x: 700, y: 250 } });
	await expect(page.getByTestId("zoom-percent")).toHaveText(`${fit}%`);
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

test("test_list_previews_show_the_whole_photo_and_old_ones_are_made_again", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "tall.png");
	await studio.openSynthetic(640, 320, "wide.png");
	const docs = () => stored(page, KEYS.docs, []);
	await expect
		.poll(async () => (await docs()).every((d: { tile: boolean }) => d.tile))
		.toBe(true);
	// the preview box is square and the picture inside keeps the photo's shape
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

test("test_the_list_has_rows_only_and_an_old_tiles_choice_is_ignored", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "one.png");
	await studio.openSynthetic(640, 320, "two.png");
	await expect(page.getByTestId("photo-layout")).toHaveCount(0);
	const rowH = (await page.getByTestId("photo-row").first().boundingBox())
		?.height;
	expect(rowH).toBeLessThan(48);
	// a saved "tiles" layout of an earlier version still gives rows
	await store(page, KEYS.list, { sort: "newest", layout: "tiles" });
	await page.reload();
	await expect(page.getByTestId("photo-row")).toHaveCount(2);
	await expect(page.getByTestId("photo-layout")).toHaveCount(0);
	expect(
		(await page.getByTestId("photo-row").first().boundingBox())?.height,
	).toBeCloseTo(rowH ?? 0, 0);
	// the open button still shows the photo
	await page.getByTestId("photo-row").nth(1).getByTestId("photo-open").click();
	await expect(page.getByTestId("facts")).toContainText("one.png");
});
