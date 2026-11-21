// Folders in the photo list: make one from the plus menu, nest, move photos and folders (menu and
// drag), the counts, open state, delete with a question, search and the tiles layout. Photos are
// small synthetic ones, and one real photo for the restore after a reload.
import type { Locator, Page } from "@playwright/test";
import { expect, KEYS, MAIN_PHOTO, stored, test } from "./studio";

type Saved = { id: string; name: string; parent: string }[];

/** The row of a folder, by its exact name. */
const folder = (page: Page, name: string) =>
	page.getByTestId("folder-row").filter({
		has: page.getByTestId("folder-label").getByText(name, { exact: true }),
	});
/** The box around a folder row and everything inside it. */
const box = (row: Locator) => row.locator("xpath=..");
const photo = (page: Page, name: string) =>
	page.getByTestId("photo-row").filter({ hasText: name });
const saved = (page: Page): Promise<Saved> => stored(page, KEYS.folders, []);

/** A new folder at the top from the plus menu, named and kept with Enter. */
async function newFolder(page: Page, name: string) {
	await page.getByTestId("photo-add").click();
	await page.getByTestId("folder-new").click();
	const input = page.getByTestId("folder-name");
	await input.fill(name);
	await input.press("Enter");
	await expect(folder(page, name)).toBeVisible();
}

/** A new folder inside another one, by the hover button of the outer row. */
async function newInside(page: Page, outer: string, name: string) {
	const row = folder(page, outer);
	await row.hover();
	await row.getByTestId("folder-new-inside").click();
	const input = page.getByTestId("folder-name");
	await expect(input).toBeFocused();
	await input.fill(name);
	await input.press("Enter");
	await expect(folder(page, name)).toBeVisible();
}

/** Picks a target of a Move menu (`photo-move` or `folder-move`) of a row. */
async function moveTo(row: Locator, button: string, target: string) {
	const page = row.page();
	await row.hover();
	await row.getByTestId(button).click();
	await page
		.getByTestId("move-target")
		.filter({ hasText: new RegExp(`^${target}$`) })
		.click();
}

/** The texts of the targets a Move menu offers. */
async function targets(row: Locator, button: string) {
	const page = row.page();
	await row.hover();
	await row.getByTestId(button).click();
	const items = page.getByTestId("move-target");
	await expect(items.first()).toBeVisible();
	const out = (await items.allInnerTexts()).map((t) => t.trim());
	await page.keyboard.press("Escape");
	await expect(items.first()).toBeHidden();
	return out;
}

// The closing plus menu gives the focus back to the plus; the folder is made after that, so the
// name box keeps the focus.
test("test_the_name_box_of_a_new_folder_from_the_plus_menu_is_focused", async ({
	studio,
}) => {
	const { page } = studio;
	await page.getByTestId("photo-add").click();
	await page.getByTestId("folder-new").click();
	await expect(page.getByTestId("folder-name")).toBeFocused({ timeout: 2000 });
});

test("test_new_folder_from_the_plus_menu_starts_in_rename_mode", async ({
	studio,
}) => {
	const { page } = studio;
	await page.getByTestId("photo-add").click();
	await expect(page.getByTestId("photo-add-files")).toBeVisible();
	await page.getByTestId("folder-new").click();
	const input = page.getByTestId("folder-name");
	await expect(input).toBeVisible();
	await expect(input).toHaveValue("New folder");
	// Enter keeps the typed name
	await input.fill("Sketches");
	await input.press("Enter");
	await expect(input).toHaveCount(0);
	await expect(folder(page, "Sketches")).toBeVisible();
	await expect(folder(page, "Sketches").getByTestId("folder-count")).toHaveText(
		"0",
	);
	await expect
		.poll(() => saved(page))
		.toMatchObject([{ name: "Sketches", parent: "" }]);
});

test("test_enter_keeps_the_first_name_and_rename_changes_it", async ({
	studio,
}) => {
	const { page } = studio;
	await page.getByTestId("photo-add").click();
	await page.getByTestId("folder-new").click();
	await page.getByTestId("folder-name").press("Enter");
	await expect(folder(page, "New folder")).toBeVisible();
	// the pen opens the name again; an empty name keeps the old one
	const row = folder(page, "New folder");
	await row.hover();
	await row.getByTestId("folder-rename").click();
	const input = page.getByTestId("folder-name");
	await input.fill("   ");
	await input.press("Enter");
	await expect(folder(page, "New folder")).toBeVisible();
	await folder(page, "New folder").hover();
	await folder(page, "New folder").getByTestId("folder-rename").click();
	await page.getByTestId("folder-name").fill("Faces");
	await page.getByTestId("folder-name").press("Enter");
	await expect(folder(page, "Faces")).toBeVisible();
	await expect(folder(page, "New folder")).toHaveCount(0);
});

test("test_a_folder_inside_a_folder_opens_the_outer_one", async ({
	studio,
}) => {
	const { page } = studio;
	await newFolder(page, "Art");
	await expect(folder(page, "Art")).toHaveAttribute("data-open", "false");
	await newInside(page, "Art", "Faces");
	await expect(folder(page, "Art")).toHaveAttribute("data-open", "true");
	await expect(
		box(folder(page, "Art"))
			.getByTestId("folder-children")
			.getByTestId("folder-label"),
	).toHaveText(["Faces"]);
	await expect
		.poll(async () => {
			const list = await saved(page);
			const art = list.find((f) => f.name === "Art");
			return list.find((f) => f.name === "Faces")?.parent === art?.id;
		})
		.toBe(true);
});

test("test_a_photo_moves_by_the_menu_and_the_count_follows", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(120, 160, "one.png");
	await studio.openSynthetic(120, 160, "two.png");
	await newFolder(page, "Art");
	await moveTo(photo(page, "one.png"), "photo-move", "Art");
	await expect(folder(page, "Art")).toHaveAttribute("data-open", "true");
	await expect(folder(page, "Art").getByTestId("folder-count")).toHaveText("1");
	await expect(
		page.getByTestId("folder-photos").getByTestId("photo-row"),
	).toHaveText([/one\.png/]);
	await expect(page.getByTestId("photos").getByTestId("photo-row")).toHaveText([
		/two\.png/,
	]);
	// the place it is in now cannot be picked again, and the top is open to it
	const inside = photo(page, "one.png");
	await inside.hover();
	await inside.getByTestId("photo-move").click();
	await expect(
		page.getByTestId("move-target").filter({ hasText: /^Art$/ }),
	).toHaveAttribute("aria-disabled", "true");
	await page
		.getByTestId("move-target")
		.filter({ hasText: /^Top level$/ })
		.click();
	await expect(folder(page, "Art").getByTestId("folder-count")).toHaveText("0");
	await expect(page.getByTestId("folder-empty")).toBeVisible();
	await expect(page.getByTestId("photos").getByTestId("photo-row")).toHaveCount(
		2,
	);
	await expect
		.poll(async () =>
			(await stored(page, KEYS.docs, [])).map(
				(d: { folder: string }) => d.folder,
			),
		)
		.toEqual(["", ""]);
});

test("test_a_photo_and_a_folder_move_by_drag_and_drop", async ({ studio }) => {
	const { page } = studio;
	await studio.openSynthetic(120, 160, "one.png");
	await newFolder(page, "Art");
	await newFolder(page, "Work");
	// a photo dropped on a closed folder goes in, and the folder opens
	await photo(page, "one.png").dragTo(folder(page, "Art"));
	await expect(folder(page, "Art")).toHaveAttribute("data-open", "true");
	await expect(folder(page, "Art").getByTestId("folder-count")).toHaveText("1");
	await expect(photo(page, "one.png")).toHaveCount(1);
	await expect(
		box(folder(page, "Art")).getByTestId("folder-photos"),
	).toContainText("one.png");
	// a folder dropped on another folder goes inside it
	await folder(page, "Work").dragTo(folder(page, "Art"));
	await expect(
		box(folder(page, "Art"))
			.getByTestId("folder-children")
			.getByTestId("folder-label"),
	).toHaveText(["Work"]);
	await expect
		.poll(async () => {
			const list = await saved(page);
			const art = list.find((f) => f.name === "Art");
			return list.find((f) => f.name === "Work")?.parent === art?.id;
		})
		.toBe(true);
	// a photo dropped on the empty part of the list goes back to the top
	const scroll = page.getByTestId("photo-scroll");
	const b = await scroll.boundingBox();
	if (!b) throw new Error("no box for the list");
	await photo(page, "one.png").dragTo(scroll, {
		targetPosition: { x: b.width / 2, y: b.height - 8 },
	});
	await expect(page.getByTestId("photos").getByTestId("photo-row")).toHaveText([
		/one\.png/,
	]);
	await expect(folder(page, "Art").getByTestId("folder-count")).toHaveText("0");
});

test("test_a_folder_moves_by_the_menu_and_the_menu_skips_its_own_folders", async ({
	studio,
}) => {
	const { page } = studio;
	await newFolder(page, "Art");
	await newFolder(page, "Work");
	await newInside(page, "Art", "Faces");
	// Art cannot go into itself or into Faces
	expect(await targets(folder(page, "Art"), "folder-move")).toEqual([
		"Top level",
		"Work",
	]);
	// Faces can go anywhere but where it is (the top level and its own parent are listed)
	expect(await targets(folder(page, "Faces"), "folder-move")).toEqual([
		"Top level",
		"Art",
		"Work",
	]);
	await moveTo(folder(page, "Art"), "folder-move", "Work");
	await expect(folder(page, "Work")).toHaveAttribute("data-open", "true");
	await expect(
		box(folder(page, "Work"))
			.getByTestId("folder-children")
			.getByTestId("folder-label")
			.first(),
	).toHaveText("Art");
	await expect
		.poll(async () => {
			const list = await saved(page);
			const work = list.find((f) => f.name === "Work");
			return list.find((f) => f.name === "Art")?.parent === work?.id;
		})
		.toBe(true);
	// back to the top
	await moveTo(folder(page, "Art"), "folder-move", "Top level");
	await expect
		.poll(async () => (await saved(page)).map((f) => f.parent === ""))
		.toEqual([true, true, false]);
});

test("test_the_count_of_a_folder_includes_the_folders_inside_it", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(120, 160, "one.png");
	await studio.openSynthetic(120, 160, "two.png");
	await newFolder(page, "Art");
	await newInside(page, "Art", "Faces");
	await moveTo(photo(page, "one.png"), "photo-move", "Faces");
	await expect(folder(page, "Faces").getByTestId("folder-count")).toHaveText(
		"1",
	);
	await expect(folder(page, "Art").getByTestId("folder-count")).toHaveText("1");
	await moveTo(photo(page, "two.png"), "photo-move", "Art");
	await expect(folder(page, "Art").getByTestId("folder-count")).toHaveText("2");
	await expect(folder(page, "Faces").getByTestId("folder-count")).toHaveText(
		"1",
	);
});

test("test_open_and_closed_state_survives_a_reload", async ({ studio }) => {
	const { page } = studio;
	await newFolder(page, "Art");
	await newFolder(page, "Work");
	await folder(page, "Art").getByTestId("folder-toggle").click();
	await expect(folder(page, "Art")).toHaveAttribute("data-open", "true");
	await expect(
		folder(page, "Art").getByTestId("folder-toggle"),
	).toHaveAttribute("aria-expanded", "true");
	// an open empty folder says so
	await expect(page.getByTestId("folder-empty")).toBeVisible();
	await expect.poll(() => stored(page, KEYS.open, [])).toHaveLength(1);
	await page.reload();
	await expect(folder(page, "Art")).toHaveAttribute("data-open", "true");
	await expect(folder(page, "Work")).toHaveAttribute("data-open", "false");
	// close it again
	await folder(page, "Art").getByTestId("folder-toggle").click();
	await expect(folder(page, "Art")).toHaveAttribute("data-open", "false");
	await expect(page.getByTestId("folder-children")).toHaveCount(0);
	await expect.poll(() => stored(page, KEYS.open, [])).toEqual([]);
	await page.reload();
	await expect(folder(page, "Art")).toHaveAttribute("data-open", "false");
});

test("test_a_folder_with_photos_asks_before_it_is_deleted", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(120, 160, "one.png");
	await studio.openSynthetic(120, 160, "two.png");
	await studio.openSynthetic(120, 160, "three.png");
	await newFolder(page, "Art");
	await newInside(page, "Art", "Faces");
	await moveTo(photo(page, "one.png"), "photo-move", "Art");
	await moveTo(photo(page, "two.png"), "photo-move", "Faces");
	const dialog = page.getByTestId("folder-delete-dialog");

	// Cancel keeps everything
	const art = folder(page, "Art");
	await art.hover();
	await art.getByTestId("folder-delete").click();
	await expect(dialog).toBeVisible();
	await expect(dialog).toContainText("Delete “Art”?");
	await expect(dialog).toContainText("It holds 2 photos and 1 folder.");
	await page.getByTestId("folder-delete-cancel").click();
	await expect(dialog).toBeHidden();
	await expect(folder(page, "Art")).toBeVisible();
	await expect(folder(page, "Faces")).toBeVisible();
	await expect(page.getByTestId("photo-row")).toHaveCount(3);

	// Delete removes the folder, the folder inside and their photos, and the top photo stays
	await art.hover();
	await art.getByTestId("folder-delete").click();
	await page.getByTestId("folder-delete-confirm").click();
	await expect(dialog).toBeHidden();
	await expect(page.getByTestId("folder-row")).toHaveCount(0);
	await expect(page.getByTestId("photo-row")).toHaveText([/three\.png/]);
	await expect
		.poll(async () =>
			(await stored(page, KEYS.docs, [])).map((d: { name: string }) => d.name),
		)
		.toEqual(["three.png"]);
	await expect.poll(() => saved(page)).toEqual([]);
	await page.reload();
	await expect(page.getByTestId("photo-row")).toHaveText([/three\.png/]);
	await expect(page.getByTestId("folder-row")).toHaveCount(0);
});

test("test_an_empty_folder_is_deleted_at_once", async ({ studio }) => {
	const { page } = studio;
	await newFolder(page, "Art");
	await newFolder(page, "Work");
	const row = folder(page, "Art");
	await row.hover();
	await row.getByTestId("folder-delete").click();
	await expect(page.getByTestId("folder-delete-dialog")).toHaveCount(0);
	await expect(folder(page, "Art")).toHaveCount(0);
	await expect(folder(page, "Work")).toBeVisible();
});

test("test_search_shows_a_flat_list_with_the_folder_path", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(120, 160, "one.png");
	await studio.openSynthetic(120, 160, "two.png");
	await newFolder(page, "Art");
	await newInside(page, "Art", "Faces");
	await moveTo(photo(page, "one.png"), "photo-move", "Faces");
	await page.getByTestId("photo-search-toggle").click();
	await page.getByTestId("photo-search").fill("png");
	// no folder rows, one flat list of both photos, the path only under the one in a folder
	await expect(page.getByTestId("folder-row")).toHaveCount(0);
	await expect(page.getByTestId("photos").getByTestId("photo-row")).toHaveCount(
		2,
	);
	await expect(page.getByTestId("photo-where")).toHaveText(["Art / Faces"]);
	await expect(photo(page, "one.png").getByTestId("photo-where")).toHaveText(
		"Art / Faces",
	);
	// closing the box brings the tree back
	await page.getByTestId("photo-search-toggle").click();
	await expect(page.getByTestId("photo-where")).toHaveCount(0);
	await expect(folder(page, "Art")).toBeVisible();
});

test("test_a_photo_in_a_closed_folder_opens_the_folders_around_it_after_a_reload", async ({
	studio,
}) => {
	test.setTimeout(120_000);
	const { page } = studio;
	await studio.open(MAIN_PHOTO);
	await newFolder(page, "Art");
	await newInside(page, "Art", "Faces");
	await moveTo(photo(page, "mona-lisa-2400.jpg"), "photo-move", "Faces");
	// close both folders: the photo on screen is hidden
	await folder(page, "Faces").getByTestId("folder-toggle").click();
	await folder(page, "Art").getByTestId("folder-toggle").click();
	await expect(page.getByTestId("photo-row")).toHaveCount(0);
	await expect.poll(() => stored(page, KEYS.open, [])).toEqual([]);
	await expect
		.poll(async () => (await stored(page, KEYS.docs, []))[0]?.folder)
		.not.toBe("");
	await page.reload();
	// the active photo is restored, so its two folders open
	await expect(folder(page, "Art")).toHaveAttribute("data-open", "true");
	await expect(folder(page, "Faces")).toHaveAttribute("data-open", "true");
	await expect(photo(page, "mona-lisa-2400.jpg")).toHaveAttribute(
		"data-active",
		"true",
	);
	await expect(page.getByTestId("facts")).toContainText("mona-lisa-2400.jpg", {
		timeout: 30_000,
	});
});

test("test_tiles_show_a_grid_under_an_open_folder", async ({ studio }) => {
	const { page } = studio;
	await studio.openSynthetic(120, 160, "one.png");
	await studio.openSynthetic(120, 160, "two.png");
	await newFolder(page, "Art");
	await moveTo(photo(page, "one.png"), "photo-move", "Art");
	const inside = page.getByTestId("folder-photos");
	await expect(inside).toHaveAttribute("data-layout", "list");
	await expect(inside).toHaveCSS("display", "flex");
	await page.getByTestId("photo-layout").click();
	await expect(inside).toHaveAttribute("data-layout", "tiles");
	await expect(inside).toHaveCSS("display", "grid");
	await expect(page.getByTestId("photos")).toHaveCSS("display", "grid");
	// a tile still carries its hover buttons
	await photo(page, "one.png").hover();
	await expect(photo(page, "one.png").getByTestId("photo-move")).toBeVisible();
});
