// The photo list: several photos, one in the layers worker, and the list and the photo on screen
// come back after a reload (the files are kept in IndexedDB on this device).
import type { Page } from "@playwright/test";
import { expect, KEYS, stored, test } from "./studio";

const row = (page: Page) => page.getByTestId("photo-row");
const photoWidth = (page: Page) =>
	page.getByTestId("photo-canvas").getAttribute("width");

test("test_the_left_panel_is_the_photo_list_only_and_fills_its_height", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "one.png");
	const files = page.getByTestId("files");
	// no tools block in the panel
	await expect(files.getByTestId("dock")).toHaveCount(0);
	await expect(files.getByTestId("tools")).toHaveCount(0);
	// the list takes the room down to the bottom of the panel
	const panel = await files.boundingBox();
	const list = await page.getByTestId("photo-scroll").boundingBox();
	if (!panel || !list) throw new Error("no box");
	expect(panel.y + panel.height - (list.y + list.height)).toBeLessThan(24);
});

test("test_two_photos_switch_and_delete", async ({ studio }) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "one.png");
	await studio.openSynthetic(320, 480, "two.png");
	await expect(row(page)).toHaveText([/two\.png/, /one\.png/]);
	await expect(row(page).nth(0)).toHaveAttribute("data-active", "true");
	await expect(page.getByTestId("facts")).toContainText("two.png");
	await expect(page.getByTestId("photo-canvas")).toHaveAttribute(
		"width",
		"320",
	);

	// each photo shows itself
	await row(page).nth(1).getByTestId("photo-open").click();
	await expect(page.getByTestId("facts")).toContainText("one.png");
	await expect(page.getByTestId("photo-canvas")).toHaveAttribute(
		"width",
		"480",
	);
	await expect(row(page).nth(1)).toHaveAttribute("data-active", "true");

	// deleting the one on screen shows the other
	await row(page).nth(1).hover();
	await row(page).nth(1).getByTestId("photo-delete").click();
	await expect(row(page)).toHaveCount(1);
	await expect(page.getByTestId("facts")).toContainText("two.png");
	await expect(page.getByTestId("photo-canvas")).toHaveAttribute(
		"width",
		"320",
	);

	// deleting the last one empties the stage
	await row(page).nth(0).hover();
	await row(page).nth(0).getByTestId("photo-delete").click();
	await expect(row(page)).toHaveCount(0);
	await expect(page.getByTestId("photo-canvas")).toHaveCount(0);
});

test("test_list_and_photo_on_screen_come_back_after_reload", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "one.png");
	await studio.openSynthetic(320, 480, "two.png");
	await row(page).nth(1).getByTestId("photo-open").click();
	await expect(page.getByTestId("facts")).toContainText("one.png");
	await expect
		.poll(() => stored(page, KEYS.docs))
		.toMatchObject([{ name: "two.png" }, { name: "one.png" }]);
	await page.reload();
	await expect(row(page)).toHaveText([/two\.png/, /one\.png/]);
	await expect(page.getByTestId("facts")).toContainText("one.png", {
		timeout: 30_000,
	});
	expect(await photoWidth(page)).toBe("480");
	await expect(row(page).nth(1)).toHaveAttribute("data-active", "true");
	await row(page).nth(0).getByTestId("photo-open").click();
	await expect(page.getByTestId("facts")).toContainText("two.png");
	await expect(page.getByTestId("photo-canvas")).toHaveAttribute(
		"width",
		"320",
	);
});

test("test_five_big_photos_keep_one_photo_in_the_worker", async ({
	studio,
}) => {
	test.setTimeout(300_000);
	const { page } = studio;
	await studio.openSynthetic(3840, 5723, "big1.png");
	await studio.layer("edges", true);
	for (let i = 2; i <= 5; i++) {
		await studio.openSynthetic(3840, 5723, `big${i}.png`);
		await expect(page.getByTestId("layer-canvas-edges")).toBeVisible({
			timeout: 60_000,
		});
		// only the photo on screen is in the layers worker
		await expect(page.getByTestId("facts")).toHaveAttribute("data-held", "1");
	}
	await expect(row(page)).toHaveCount(5);

	// the list is newest first: big5 is on top, big1 at the bottom
	const show = async (i: number, name: string) => {
		const t0 = Date.now();
		await row(page).nth(i).getByTestId("photo-open").click();
		await expect(page.getByTestId("facts")).toContainText(name);
		await expect(page.getByTestId("layer-canvas-edges")).toBeVisible({
			timeout: 60_000,
		});
		await expect(page.getByTestId("facts")).toHaveAttribute("data-held", "1");
		return Date.now() - t0;
	};
	// the first photo was decoded again from its file; the last one is still cached
	const cold = await show(4, "big1.png");
	const warm = await show(0, "big5.png");
	console.log(`SWITCH cold=${cold} ms warm=${warm} ms`);
	expect(warm).toBeLessThan(1000);
	expect(await photoWidth(page)).toBe("3840");
});
