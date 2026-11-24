// The window layout: the side panel is an inset glass card over the stage (the stage fills the whole
// window and never moves), the panel hides and stays hidden after a reload, and it lists every photo
// where it can be searched, shown, renamed or deleted. The tools are in the bar over the stage. With SHOT=dir it also saves
// screenshots of the window (a synthetic photo) to that folder.
import {
	box,
	dragBy,
	expect,
	KEYS,
	keptDocs as kept,
	ONE_PX,
	stored,
	test,
} from "./studio";

test("test_the_panel_floats_as_glass_over_the_stage_and_the_tools_sit_in_the_bar", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "one.png");
	const files = await box(page, "files");
	const stage = await box(page, "stage");
	// the stage fills the whole window; the panel floats over it, inset by 12 px
	const view = page.viewportSize();
	expect(stage.x).toBeCloseTo(0, 1);
	expect(stage.width).toBeCloseTo(view?.width ?? 0, 1);
	expect(files.x).toBeCloseTo(12, 1);
	expect(files.y).toBeCloseTo(12, 1);
	expect(files.height).toBeCloseTo((view?.height ?? 0) - 24, 1);
	// the panel holds only the photo list; the three tools are buttons in the bar over the stage
	await expect(page.getByTestId("files").getByTestId("tool-base")).toHaveCount(
		0,
	);
	for (const id of ["base", "edges", "grid"])
		await expect(
			page.getByTestId("stage-bar").getByTestId(`tool-${id}`),
		).toBeVisible();
	// glass: a see-through tint and a blur behind the panel, the bar and a pop-up
	const glass = await page.evaluate(() => {
		const css = (id: string) =>
			getComputedStyle(
				document.querySelector(`[data-testid=${id}]`) as HTMLElement,
			);
		return ["files", "stage-bar"].map((id) => ({
			fill: css(id).backgroundColor,
			blur: css(id).backdropFilter,
		}));
	});
	for (const g of glass) {
		expect(g.blur).toContain("blur");
		// an alpha below 1 in `color(srgb r g b / a)` or `rgba(r, g, b, a)`
		expect(g.fill).toMatch(/\/ 0\.\d+\)|, 0\.\d+\)/);
	}
	await page.getByTestId("tool-base").click();
	const popup = page.getByTestId("tool-popup");
	await expect(popup).toBeVisible();
	expect(
		await popup.evaluate(
			(el) => getComputedStyle(el.closest(".popover") ?? el).backdropFilter,
		),
	).toContain("blur");

	const dir = process.env.SHOT;
	if (dir) {
		await studio.openSynthetic(640, 480, "sunset.png");
		await page.waitForTimeout(800); // the tab indicator and colors finish moving
		await page.screenshot({ path: `${dir}/layout-dark.png` });
		await page.getByTestId("files-fold").click();
		await page.waitForTimeout(800);
		await page.screenshot({ path: `${dir}/layout-folded.png` });
	}
});

test("test_the_panel_hides_and_stays_hidden_after_reload", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "one.png");
	await page.getByTestId("files-fold").click();
	await expect(page.getByTestId("files")).toHaveAttribute(
		"data-collapsed",
		"true",
	);
	// a hidden panel takes no room: the stage fills the whole window
	await expect(page.getByTestId("files")).toBeHidden();
	const stage = await box(page, "stage");
	const window = page.viewportSize();
	expect(stage.x).toBeCloseTo(0, 1);
	expect(stage.width).toBeCloseTo(window?.width ?? 0, 1);
	expect((await studio.layout()).panels).toEqual({ left: true });

	await page.reload();
	await expect(page.getByTestId("files")).toHaveAttribute(
		"data-collapsed",
		"true",
	);

	// the edge handle brings the panel back
	await page.getByTestId("files-expand").click();
	await expect(page.getByTestId("files")).toHaveAttribute(
		"data-collapsed",
		"false",
	);
	// the tools stay in the bar whether the panel shows or not
	await expect(page.getByTestId("tool-grid")).toBeVisible();
});

test("test_photo_list_shows_searches_renames_and_deletes", async ({
	studio,
}) => {
	const { page } = studio;
	const row = page.getByTestId("photo-row");
	await studio.openSynthetic(480, 640, "one.png");
	await studio.openSynthetic(320, 480, "two.png");

	// one list, newest on top, the one on screen marked
	await expect(row).toHaveCount(2);
	await expect(row.nth(0)).toContainText("two.png");
	await expect(row.nth(0)).toHaveAttribute("data-active", "true");
	await expect(row.nth(1)).toContainText("one.png");
	await expect
		.poll(() => kept(page))
		.toMatchObject([{ name: "two.png" }, { name: "one.png" }]);

	// a click shows a photo
	await row.nth(1).getByTestId("photo-open").click();
	await expect(row.nth(1)).toHaveAttribute("data-active", "true");
	await expect(page.getByTestId("photo-canvas")).toHaveAttribute(
		"width",
		"480",
	);

	// the search box filters by name
	await page.getByTestId("photo-search-toggle").click();
	await page.getByTestId("photo-search").fill("TWO");
	await expect(row).toHaveCount(1);
	await expect(row).toContainText("two.png");
	await page.getByTestId("photo-search").fill("nothing");
	await expect(row).toHaveCount(0);
	await page.getByTestId("photo-search").fill("");
	await expect(row).toHaveCount(2);
	// closing the box clears it
	await page.getByTestId("photo-search").fill("two");
	await expect(row).toHaveCount(1);
	await page.getByTestId("photo-search-toggle").click();
	await expect(page.getByTestId("photo-search")).toHaveCount(0);
	await expect(row).toHaveCount(2);

	// rename; the name stays after a reload
	await row.nth(1).hover();
	await row.nth(1).getByTestId("photo-rename").click();
	await page.getByTestId("photo-name").fill("study.png");
	await page.getByTestId("photo-name").press("Enter");
	await expect(row.nth(1)).toContainText("study.png");
	await page.reload();
	await expect(row.nth(1)).toContainText("study.png");

	// delete removes it from the list and from the device, and the other one shows
	await row.nth(1).hover();
	await row.nth(1).getByTestId("photo-delete").click();
	await expect(row).toHaveCount(1);
	await expect.poll(() => kept(page)).toMatchObject([{ name: "two.png" }]);
	await expect(page.getByTestId("photo-canvas")).toHaveAttribute(
		"width",
		"320",
	);
});

test("test_many_photos_have_no_limit", async ({ studio }) => {
	const { page } = studio;
	for (let i = 1; i <= 10; i++)
		await studio.openSynthetic(120, 160, `tiny${i}.png`);
	await expect(page.getByTestId("photo-row")).toHaveCount(10);
	await expect(page.getByTestId("photo-add")).toBeEnabled();
	await expect(page.getByTestId("error")).toHaveCount(0);
});

test("test_search_matches_words_accents_and_dates_clears_and_sorts", async ({
	studio,
}) => {
	const { page } = studio;
	const row = page.getByTestId("photo-row");
	const search = page.getByTestId("photo-search");
	await studio.openSynthetic(120, 160, "Cafe Noir.png");
	await studio.openSynthetic(120, 160, "sunset study.png");
	await studio.openSynthetic(120, 160, "plain.png");
	await page.getByTestId("photo-search-toggle").click();

	// every word must match, in any order, with no case and no accents
	await search.fill("noir cafe");
	await expect(row).toHaveCount(1);
	await search.fill("CAFÉ");
	await expect(row).toHaveCount(1);
	// the matching part of the name is marked, and the count shows
	await expect(row.locator("[class*=bg-accent]")).toHaveText("Cafe");
	await expect(page.getByTestId("photo-count")).toHaveText("1 of 3");
	// the extension and the date match too
	await search.fill("png");
	await expect(row).toHaveCount(3);
	await search.fill(new Date().toISOString().slice(0, 10));
	await expect(row).toHaveCount(3);

	// the x clears the box
	await search.fill("zzz");
	await expect(row).toHaveCount(0);
	await page.getByTestId("photo-search-clear").click();
	await expect(search).toHaveValue("");
	await expect(row).toHaveCount(3);

	// the sort menu, kept after a reload
	await page.getByTestId("photo-sort").click();
	await page.getByRole("menuitemradio", { name: "Name" }).click();
	await expect(row).toHaveText([/Cafe Noir/, /plain/, /sunset study/]);
	await page.reload();
	await expect(row).toHaveText([/Cafe Noir/, /plain/, /sunset study/]);
});

test("test_many_files_open_at_once_and_a_bad_one_does_not_stop_them", async ({
	studio,
}) => {
	const { page } = studio;
	const png = Buffer.from(
		await page.evaluate(() => {
			const c = document.createElement("canvas");
			c.width = 40;
			c.height = 30;
			const g = c.getContext("2d");
			if (g) {
				g.fillStyle = "#c98f6a";
				g.fillRect(0, 0, 40, 30);
			}
			return c.toDataURL("image/png").split(",")[1] ?? "";
		}),
		"base64",
	);
	// the same picture under other names would be one photo (same bytes), so each file ends with its name
	const named = (name: string) => ({
		name,
		mimeType: "image/png",
		buffer: Buffer.concat([png, Buffer.from(`|${name}`)]),
	});
	await page
		.locator("[data-testid=file]")
		.setInputFiles([
			named("a.png"),
			{ name: "bad.png", mimeType: "image/png", buffer: Buffer.from("nope") },
			named("b.png"),
			named("c.png"),
		]);
	// the first one shows; the others join the list under it, in the order picked
	await expect(page.getByTestId("photo-row")).toHaveText(
		[/a\.png/, /b\.png/, /c\.png/],
		{ timeout: 30_000 },
	);
	await expect(page.getByTestId("photo-row").nth(0)).toHaveAttribute(
		"data-active",
		"true",
	);
	await expect(page.getByTestId("error")).toContainText("bad.png");
});

test("test_the_bar_sits_on_the_stage_with_the_zoom_menu", async ({
	studio,
}) => {
	const { page } = studio;
	await expect(page.getByTestId("stage-bar")).toHaveCount(0);
	await studio.openSynthetic(480, 640, "one.png");
	const bar = await box(page, "stage-bar");
	const stage = await box(page, "stage");
	// the bar centers on the free stage: right of the open panel and its 12 px gap
	const panel = await box(page, "files");
	const freeMiddle = (panel.x + panel.width + 12 + stage.x + stage.width) / 2;
	expect(bar.x + bar.width / 2).toBeCloseTo(freeMiddle, ONE_PX);
	expect(bar.y + bar.height).toBeLessThan(stage.y + stage.height);
	await studio.zoom("actual");
	await expect(page.getByTestId("zoom-percent")).toHaveText("100%");
	await studio.zoom("fit");
	await expect(page.getByTestId("zoom-percent")).not.toHaveText("100%");
});

test("test_the_same_file_again_replaces_it", async ({ studio }) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "one.png");
	await studio.openSynthetic(320, 480, "two.png");
	await studio.openSynthetic(480, 640, "one.png");
	await expect(page.getByTestId("photo-row")).toHaveCount(2);
	await expect(
		page.getByTestId("photo-row").filter({ hasText: "one.png" }),
	).toHaveCount(1);
	// the replaced one is the one on screen
	await expect(page.getByTestId("photo-canvas")).toHaveAttribute(
		"width",
		"480",
	);
	await expect.poll(async () => (await kept(page)).length).toBe(2);
});

test("test_the_panel_resizes_smoothly_and_the_width_is_kept", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "one.png");
	const drag = (id: string, dx: number) => dragBy(page, id, dx);
	const start = (await box(page, "files")).width;
	await drag("files-resize", 60);
	await expect
		.poll(async () => (await box(page, "files")).width)
		.toBeCloseTo(start + 60, 0);
	// it stops at the limits
	await drag("files-resize", 2000);
	await expect
		.poll(async () => (await box(page, "files")).width)
		.toBeCloseTo(720, 0);
	await drag("files-resize", -2000);
	await expect
		.poll(async () => (await box(page, "files")).width)
		.toBeCloseTo(280, 0);
	// the stage is not moved by the panel
	const stage = await box(page, "stage");
	expect(stage.x).toBeCloseTo(0, 1);
	expect(stage.width).toBeCloseTo(page.viewportSize()?.width ?? 0, 1);
	// the width is saved and comes back
	await expect
		.poll(async () => (await stored(page, KEYS.layout)).widths)
		.toEqual({ left: 280 });
	await page.reload();
	await expect
		.poll(async () => (await box(page, "files")).width)
		.toBeCloseTo(280, 0);
	// a double click sets the start width again
	const b = await box(page, "files-resize");
	await page.mouse.dblclick(b.x + b.width / 2, b.y + 120);
	await expect
		.poll(async () => (await box(page, "files")).width)
		.toBeCloseTo(300, 0);
});

test("test_logo_sits_on_the_panel_and_moves_to_the_window_corner_when_it_is_hidden", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "one.png");
	const logo = page.getByTestId("logo");
	const open = await logo.boundingBox();
	// open, it sits on the padding of the glass panel (12 px gap + 1 px edge + 12 px padding)
	expect(open?.x).toBeCloseTo(25, 0);
	expect(open?.y).toBeCloseTo(25, 0);
	await page.getByTestId("files-fold").click();
	await expect(page.getByTestId("files")).toBeHidden();
	const hidden = await logo.boundingBox();
	// the lockup is one SVG (the A mark and the word's rest), named Atelier for screen readers, and
	// hidden, it sits in the window corner (12 px)
	await expect(logo).toContainText("Atelier");
	expect(hidden?.x).toBeCloseTo(12, 0);
	expect(hidden?.y).toBeCloseTo(12, 0);
	await expect(logo.locator("svg")).toBeVisible();
});

test("test_color_legend_is_in_the_strip_and_real_size_is_in_the_zoom_menu", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "one.png");
	await studio.base("values");
	await expect(
		page.getByTestId("legend-strip").getByTestId("legend"),
	).toBeVisible();
	await expect(
		page.getByTestId("tool-popup").getByTestId("legend"),
	).toHaveCount(0);
	// the real size is in the zoom menu; with no screen width it opens the Paper card
	await page.keyboard.press("Escape");
	await expect(page.getByTestId("tool-popup")).toHaveCount(0);
	await studio.zoom("real");
	await expect(
		page.locator("[data-testid=tool-popup][data-tool=size]"),
	).toBeVisible();
	await expect(page.getByTestId("paper-real").locator("input")).toBeChecked();
	await expect(page.getByTestId("screen-width")).toBeVisible();
	await expect(page.getByTestId("zoom-menu")).toHaveAttribute(
		"data-locked",
		"true",
	);
});

test("test_the_bar_and_the_strip_stay_inside_a_narrow_stage", async ({
	studio,
}) => {
	const { page } = studio;
	// 800 px is the narrowest window with a docked panel; under 768 px the panel is a drawer (phone.spec.ts)
	await page.setViewportSize({ width: 800, height: 700 });
	await studio.openSynthetic(480, 640, "one.png");
	await studio.base("values");
	await page.keyboard.press("Escape");
	await expect(page.getByTestId("tool-popup")).toHaveCount(0);
	const stage = await box(page, "stage");
	for (const id of ["stage-bar", "legend-strip"]) {
		const b = await box(page, id);
		expect(b.x).toBeGreaterThanOrEqual(stage.x - 0.5);
		expect(b.x + b.width).toBeLessThanOrEqual(stage.x + stage.width + 0.5);
	}
	// the panels leave the stage a fair share of the window
	expect(stage.width).toBeGreaterThan(200);
});

test("test_hold_to_see_photo_works_with_the_keyboard", async ({ studio }) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "one.png");
	await studio.base("values");
	const canvas = page.getByTestId("layer-canvas-base");
	await expect(canvas).toBeVisible();
	await page.getByTestId("photo-hold").focus();
	await page.keyboard.down("Space");
	await expect(canvas).toBeHidden();
	await page.waitForTimeout(350);
	await page.keyboard.up("Space");
	await expect(canvas).toBeVisible();
});

test("test_strip_shows_without_a_card_and_add_photo_shows_when_the_panel_is_hidden", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "one.png");
	await studio.base("values");
	await page.keyboard.press("Escape");
	await expect(page.getByTestId("tool-popup")).toHaveCount(0);
	const strip = await box(page, "legend-strip");
	const bar = await box(page, "stage-bar");
	// the strip is at the top of the stage, never over the bar
	expect(strip.y + strip.height).toBeLessThanOrEqual(bar.y + 1);
	expect(strip.y).toBeLessThan(bar.y / 2);
	// an open card does not cover the strip
	await page.getByTestId("tool-base").click();
	await expect(page.getByTestId("tool-popup")).toBeVisible();
	const card = await box(page, "tool-popup");
	expect(strip.y + strip.height).toBeLessThanOrEqual(card.y + 1);
	await page.keyboard.press("Escape");
	// the panel is shown: no add photo button on the stage
	await expect(page.getByTestId("add-photo-bar")).toHaveCount(0);
	await page.getByTestId("files-fold").click();
	const chooser = page.waitForEvent("filechooser");
	await page.getByTestId("add-photo-bar").click();
	await chooser;
});

test("test_the_empty_stage_has_an_add_photos_button_that_opens_the_chooser", async ({
	studio,
}) => {
	const { page } = studio;
	// no photo yet: the stage invites one, and the bar and the legend strip are not there
	await expect(page.getByTestId("photo-canvas")).toHaveCount(0);
	await expect(page.getByTestId("stage-bar")).toHaveCount(0);
	await expect(page.getByTestId("legend-strip")).toHaveCount(0);
	const chooser = page.waitForEvent("filechooser");
	await page.getByTestId("add-photos").click();
	await chooser;
});

test("test_segment_labels_fit_in_the_base_card", async ({ studio }) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "seg.png");
	const shot = async (name: string) => {
		const dir = process.env.SHOT_FIXED;
		if (dir) await page.screenshot({ path: `${dir}/fixed-${name}.png` });
	};
	for (const base of ["pencil", "shapes"] as const) {
		await studio.base(base);
		const radios = page.getByRole("radio");
		const n = await radios.count();
		expect(n).toBeGreaterThan(3);
		const info = await page.evaluate(() =>
			[...document.querySelectorAll("[role=radio]")].map((el) => {
				const r = el.getBoundingClientRect();
				return {
					fit: el.scrollWidth <= el.clientWidth,
					l: r.left,
					r: r.right,
					t: r.top,
				};
			}),
		);
		for (const [i, a] of info.entries()) {
			expect(a.fit, `radio ${i} of ${base} is cut`).toBe(true);
			const b = info[i + 1];
			if (b && Math.abs(b.t - a.t) < 2)
				expect(a.r).toBeLessThanOrEqual(b.l + 0.5);
		}
		await shot(base);
	}
});
