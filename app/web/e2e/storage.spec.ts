// What the page keeps on this device and how it survives trouble: an unreadable file store must not
// empty the photo list, stored files without an owner are swept, a full localStorage is reported,
// and two tabs add photos to one list instead of overwriting each other.
import {
	blockSetItem,
	expect,
	photoFileIds as fileIds,
	KEYS,
	docNames as names,
	photosDb,
	Studio,
	store,
	stored,
	test,
} from "./studio";

test("test_an_unreadable_store_does_not_empty_the_photo_list", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "one.png");
	await expect.poll(() => names(page)).toEqual(["one.png"]);
	// from now on listing the stored files fails, as it does in a blocked or broken database
	await page.addInitScript(() => {
		IDBObjectStore.prototype.getAllKeys = () => {
			throw new Error("the store cannot be read");
		};
	});
	await page.reload();
	await expect(page.getByTestId("photo-row")).toHaveCount(1);
	await expect(page.getByTestId("facts")).toContainText("one.png", {
		timeout: 30_000,
	});
	await page.waitForTimeout(600);
	expect(await names(page)).toEqual(["one.png"]);
});

test("test_stored_files_without_an_owner_are_swept_after_a_while", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "one.png");
	await expect.poll(() => names(page)).toEqual(["one.png"]);
	// two files nobody owns: one first seen long ago, one that nobody has seen yet
	await photosDb(page, "readwrite", (photos) => {
		photos.put(new Blob(["x"]), "ghost-old");
		photos.put(new Blob(["y"]), "ghost-new");
		return undefined;
	});
	await store(page, KEYS.orphans, { "ghost-old": Date.now() - 11 * 60_000 });
	await page.reload();
	await expect
		.poll(async () => (await fileIds(page)).includes("ghost-old"))
		.toBe(false);
	// the new one is only remembered; the photo of the list stays
	const ids = await fileIds(page);
	expect(ids).toContain("ghost-new");
	expect(ids).toHaveLength(2);
	const seen = async () =>
		Object.keys(await stored(page, KEYS.orphans, {})).sort();
	expect(await seen()).toContain("ghost-new");
	// a file that is gone is forgotten at the next visit
	await page.reload();
	await expect(page.getByTestId("photo-row")).toHaveCount(1);
	await expect.poll(seen).toEqual(["ghost-new"]);
});

test("test_a_full_storage_is_reported_not_silent", async ({ studio }) => {
	const { page } = studio;
	await blockSetItem(page, KEYS.docs);
	await studio.openSynthetic(480, 640, "one.png");
	await expect(page.getByTestId("error")).toContainText(
		"photo list could not be kept",
		{ timeout: 5000 },
	);
});

test("test_two_tabs_add_photos_to_one_list", async ({ studio }) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "a.png");
	await expect.poll(() => names(page)).toEqual(["a.png"]);
	const other = await page.context().newPage();
	await other.goto("/");
	await expect(other.getByTestId("photo-row")).toHaveCount(1);
	// a photo added in the first tab shows up in the second at once
	await studio.openSynthetic(320, 480, "b.png");
	await expect(other.getByTestId("photo-row")).toHaveCount(2);
	// and one added in the second joins the list of the first; nothing is overwritten
	await new Studio(other).openSynthetic(240, 320, "c.png");
	await expect(page.getByTestId("photo-row")).toHaveCount(3);
	await expect.poll(() => names(page)).toEqual(["a.png", "b.png", "c.png"]);
	await expect.poll(() => names(other)).toEqual(["a.png", "b.png", "c.png"]);
	await other.close();
});

test("test_two_different_photos_with_one_name_and_size_both_stay", async ({
	studio,
}) => {
	const { page } = studio;
	// two jpegs that decode the same and differ only in bytes after the end of the picture: same
	// name, same size, different content
	await page.evaluate(async () => {
		const c = document.createElement("canvas");
		c.width = 64;
		c.height = 48;
		const g = c.getContext("2d");
		if (!g) throw new Error("no 2d canvas");
		g.fillStyle = "#668";
		g.fillRect(0, 0, 64, 48);
		const jpeg = new Uint8Array(
			await (
				await new Promise<Blob>((ok) =>
					c.toBlob((b) => ok(b as Blob), "image/jpeg", 0.9),
				)
			).arrayBuffer(),
		);
		const twin = (tail: number) => {
			const bytes = new Uint8Array(jpeg.length + 3);
			bytes.set(jpeg);
			bytes.fill(tail, jpeg.length);
			return new File([bytes], "twin.jpg", { type: "image/jpeg" });
		};
		const dt = new DataTransfer();
		dt.items.add(twin(1));
		dt.items.add(twin(2));
		const input = document.querySelector<HTMLInputElement>("input[type=file]");
		if (!input) throw new Error("no file input");
		input.files = dt.files;
		input.dispatchEvent(new Event("change", { bubbles: true }));
	});
	await expect(page.getByTestId("photo-row")).toHaveCount(2);
	await expect.poll(() => names(page)).toEqual(["twin.jpg", "twin.jpg"]);
	// the same bytes again replace, they do not add
	await page.reload();
	await expect(page.getByTestId("photo-row")).toHaveCount(2);
});

test("test_messages_of_different_sources_show_together_and_one_click_clears_them", async ({
	studio,
}) => {
	const { page } = studio;
	await blockSetItem(page, KEYS.docs);
	await studio.openSynthetic(480, 640, "one.png");
	await expect(page.getByTestId("error")).toContainText(
		"photo list could not be kept",
		{ timeout: 5000 },
	);
	// a file that does not open adds its own message; the save message stays
	await page.getByTestId("file").setInputFiles({
		name: "bad.png",
		mimeType: "image/png",
		buffer: Buffer.from("nope"),
	});
	await expect(page.getByTestId("error")).toContainText("bad.png");
	await expect(page.getByTestId("error")).toContainText(
		"photo list could not be kept",
	);
	await page.getByRole("button", { name: "Dismiss the message" }).click();
	await expect(page.getByTestId("error")).toHaveCount(0);
});
