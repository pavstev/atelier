// The Pencil base: it draws its five looks, it turns Edges off and leaves Grid, its legend has one
// row per pencil of the set and Paper, the last pencil cannot be switched off, the picker card names
// a grade, every knob changes the picture and comes back after a reload, old and bad saves load with
// the start values, Reset, Auto, Suggest pencils, By pencil (the legend marks the step) and the phone
// sheet. Headless Chromium, on the synthetic photo (no real photo).
import { GRADES, pressureWords } from "../src/features/pencil/grades";
import { box, expect, KEYS, readCanvas, store, test } from "./studio";

/** The mask with every pencil on, and the card selectors of one pencil. */
const ALL = 255;
const grade = (id: string) => `[data-testid=pencil-grade][data-grade="${id}"]`;

type Page = import("@playwright/test").Page;

/** The five looks, in the order of the select (the look number is the index). */
const LOOK = { tone: 0, drawing: 1, zones: 2, hatch: 3, byPencil: 4 };
const LOOK_NAMES = ["Tone", "Drawing", "Zones", "Hatch", "By pencil"];

/** The start of every Pencil setting, spelled out here on purpose: a change of a start value in the
 * app must show up as a failing test, not move this table with it. */
const START = {
	look: 0,
	mask: 255,
	detail: 50,
	key: 50,
	contrast: 50,
	highlights: 1,
	darks: 20,
	local: 0,
	grain: 50,
	paper: 1,
	angle: 45,
	density: 50,
	step: 1,
};

/** One knob: the look it is shown in, its test id, its key in the save and the value to set (for the
 * paper row, the index of its button). */
type Knob = {
	look: number;
	id: string;
	key: keyof typeof START;
	value: number;
};

/** Every knob once, set to a value that is not its start and draws a different picture. Deep darks
 * goes down: the start (20) may already cover the accent pencils completely. */
const KNOBS: Knob[] = [
	{ look: LOOK.tone, id: "pencil-key", key: "key", value: 70 },
	{ look: LOOK.tone, id: "pencil-contrast", key: "contrast", value: 70 },
	{ look: LOOK.tone, id: "pencil-highlights", key: "highlights", value: 10 },
	{ look: LOOK.tone, id: "pencil-darks", key: "darks", value: 0 },
	{ look: LOOK.tone, id: "pencil-local", key: "local", value: 60 },
	{ look: LOOK.tone, id: "pencil-detail", key: "detail", value: 90 },
	{ look: LOOK.drawing, id: "pencil-grain", key: "grain", value: 90 },
	{ look: LOOK.drawing, id: "pencil-paper", key: "paper", value: 2 },
	{ look: LOOK.drawing, id: "pencil-hatch-angle", key: "angle", value: 120 },
	{ look: LOOK.hatch, id: "pencil-hatch-density", key: "density", value: 90 },
	{ look: LOOK.byPencil, id: "pencil-step", key: "step", value: 4 },
];

/** The hash of the base picture. */
const pictureOf = async (studio: {
	stats: (id: string) => Promise<{ hash: number }>;
}) => (await studio.stats("layer-canvas-base")).hash;

/** The value a slider shows. */
const sliderValue = (page: Page, id: string) =>
	page.locator(`[data-testid=${id}] input[type=range]`).inputValue();

/** The pencils of a mask, darkest first (bit 0 is the 9B). */
const pencilsOf = (mask: number) =>
	GRADES.filter((_, bit) => mask & (1 << bit)).map((g) => g.id);

/** The grades of the legend rows, top to bottom. */
const legendGrades = (page: Page) =>
	page
		.getByTestId("legend-swatch")
		.evaluateAll((rows) =>
			rows.map((r) => String((r as HTMLElement).dataset.grade)),
		);

/** How many different colors the base canvas holds (a flat map has one per level). */
const colors = (page: import("@playwright/test").Page) =>
	readCanvas(page, "layer-canvas-base", (img) => {
		const seen = new Set<number>();
		const d = img.data;
		for (let i = 0; i < d.length; i += 4)
			seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
		return seen.size;
	});

/** A spot of the synthetic photo, as a share of its width and height, in page px. */
async function spot(
	page: import("@playwright/test").Page,
	fx: number,
	fy: number,
) {
	const b = await box(page, "photo-canvas");
	return { x: b.x + b.width * fx, y: b.y + b.height * fy };
}

test("test_pencil_base_draws_a_map_and_a_drawing", async ({ studio }) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "pencil-draws.png");
	await studio.tool("base");
	await expect(page.getByTestId("base").getByRole("radio")).toHaveText([
		"Photo",
		"Values",
		"Shapes",
		"Paper",
		"Pencil",
	]);
	// the controls of Pencil are there only while it is the base
	await expect(page.getByTestId("pencil-look")).toHaveCount(0);
	await studio.base("pencil");
	await expect(page.getByTestId("layer-canvas-base")).toBeVisible();
	// the look is a select with five options
	await page.getByTestId("pencil-look").locator("button").first().click();
	await expect(page.getByRole("option")).toHaveText(LOOK_NAMES);
	await page.keyboard.press("Escape");
	await expect(page.getByRole("option")).toHaveCount(0);
	await expect(page.getByTestId("pencil-detail")).toBeVisible();
	await expect(page.locator("[data-testid=pencil-grade]")).toHaveCount(8);
	// the start look is Tone, a smooth gray picture: many colors
	expect((await studio.saved()).pencil.look).toBe(LOOK.tone);
	expect(await colors(page)).toBeGreaterThan(30);
	// Zones are flat: one color per level, nine at most (eight pencils and paper)
	await studio.knob("pencil-look", 2);
	expect(await colors(page)).toBeLessThanOrEqual(9);
	const flat = await studio.stats("layer-canvas-base");
	// the picture is opaque, like Values
	expect(flat.min).toBeGreaterThanOrEqual(0);
	await studio.knob("pencil-detail", 90);
	await studio.knob("pencil-look", 1);
	expect(await colors(page)).toBeGreaterThan(30);
	await expect(page.getByTestId("error")).toHaveCount(0);
	// opacity is there as for the other bases
	await studio.opacity("base", 50);
	await expect(page.getByTestId("layer-canvas-base")).toHaveCSS(
		"opacity",
		"0.5",
	);
});

test("test_pencil_turns_edges_off_keeps_grid_and_photo_brings_edges_back", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "pencil-edges.png");
	await studio.layer("edges", true);
	await expect(page.getByTestId("layer-canvas-edges")).toBeVisible();
	await studio.base("pencil");
	// Edges is gone from the picture and its button is off, with a tip that says why
	await expect(page.getByTestId("layer-canvas-edges")).toHaveCount(0);
	const edges = page.getByTestId("tool-edges");
	await expect(edges).toBeDisabled();
	// the tip says why
	await edges.hover();
	await expect(
		page.getByRole("tooltip").filter({ hasText: "Off in Pencil mode" }),
	).toBeVisible();
	// a real mouse press on it opens nothing (Playwright's own click refuses a disabled button)
	const at = await box(page, "tool-edges");
	await page.mouse.click(at.x + at.width / 2, at.y + at.height / 2);
	await expect(
		page.locator("[data-testid=tool-popup][data-tool=edges]"),
	).toHaveCount(0);
	// the saved switch is kept
	expect((await studio.saved()).edges.on).toBe(true);
	// Grid is fully usable on Pencil, and its Contrast lines are the dark ones of Paper
	await studio.layer("grid", true);
	await expect(page.getByTestId("layer-canvas-grid")).toBeVisible();
	await studio.knob("grid-cells", 3);
	await expect(page.getByTestId("tool-grid")).toBeEnabled();
	await studio.layer("grid", false);
	await expect(page.getByTestId("layer-canvas-grid")).toHaveCount(0);
	// back to Photo: Edges comes back with its old switch
	await studio.base("photo");
	await expect(page.getByTestId("tool-edges")).toBeEnabled();
	await expect(page.getByTestId("layer-canvas-edges")).toBeVisible({
		timeout: 30_000,
	});
	expect(await studio.isOn("layer-edges")).toBe(true);
});

test("test_pencil_legend_has_a_row_per_pencil_and_paper", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "pencil-legend.png");
	await studio.base("pencil");
	const rows = page.getByTestId("legend-swatch");
	await expect(page.getByLabel("Pencil legend")).toBeVisible();
	await expect(rows).toHaveCount(9);
	// darkest first: the pencils in order, then Paper
	const names = GRADES.map((g) => g.id);
	expect(await rows.evaluateAll((l) => l.map((e) => e.dataset.grade))).toEqual([
		...names,
		"Paper",
	]);
	// each row has its grade, its hint and a share (or "not used"); a swatch is not a button
	for (const g of [
		...GRADES,
		{ id: "Paper", hint: "leave white or lift out" },
	]) {
		const row = page.locator(
			`[data-testid=legend-swatch][data-grade="${g.id}"]`,
		);
		await expect(row).toContainText(g.id);
		await expect(row).toContainText(g.hint);
		await expect(row).toContainText(/\d+%|not used/);
	}
	await expect(rows.getByRole("button")).toHaveCount(0);
	// the shares of the levels add up to about 100
	const shares = await rows.evaluateAll((l) =>
		l.map((e) => Number((e as HTMLElement).dataset.share)),
	);
	const total = shares.reduce((a, b) => a + b, 0);
	expect(total).toBeGreaterThanOrEqual(95);
	expect(total).toBeLessThanOrEqual(105);
	// the legend swatches run from dark to light
	const lum = (i: number) =>
		rows
			.nth(i)
			.locator("span")
			.first()
			.evaluate((el) => {
				const [r, g, b] = (
					getComputedStyle(el).backgroundColor.match(/\d+/g) ?? []
				).map(Number);
				return r + g + b;
			});
	expect(await lum(0)).toBeLessThan(await lum(8));
	// seven pencils, eight rows: the 9B is gone from the legend
	await studio.drawn(() => page.locator(grade("9B")).click());
	await expect(rows).toHaveCount(8);
	await expect(
		page.locator('[data-testid=legend-swatch][data-grade="9B"]'),
	).toHaveCount(0);
	await expect(page.locator(grade("9B"))).toHaveAttribute(
		"aria-pressed",
		"false",
	);
});

test("test_the_last_pencil_cannot_be_switched_off", async ({ studio }) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "pencil-last.png");
	await studio.base("pencil");
	// every pencil starts on and says so
	for (const g of GRADES)
		await expect(page.locator(grade(g.id))).toHaveAttribute(
			"aria-pressed",
			"true",
		);
	// switch off all but the HB
	await studio.drawn(async () => {
		for (const g of GRADES)
			if (g.id !== "HB") await page.locator(grade(g.id)).click();
	});
	await expect(page.getByTestId("legend-swatch")).toHaveCount(2);
	const hb = page.locator(grade("HB"));
	await expect(hb).toHaveAttribute("aria-pressed", "true");
	await hb.click();
	await expect(hb).toHaveAttribute("aria-pressed", "true");
	await expect(page.getByTestId("legend-swatch")).toHaveCount(2);
	// the HB is bit 4 of the mask
	expect((await studio.saved()).pencil.mask).toBe(1 << 4);
	// switching one back on works
	await studio.drawn(() => page.locator(grade("2B")).click());
	await expect(page.getByTestId("legend-swatch")).toHaveCount(3);
	expect((await studio.saved()).pencil.mask).toBe((1 << 4) | (1 << 3));
});

test("test_the_picker_card_names_a_pencil_grade", async ({
	studio,
	context,
}) => {
	const { page } = studio;
	await context.grantPermissions(["clipboard-read", "clipboard-write"]);
	await studio.openSynthetic(480, 640, "pencil-picker.png");
	await studio.base("pencil");
	const order = (
		await page
			.getByTestId("legend-swatch")
			.evaluateAll((l) => l.map((e) => e.dataset.grade))
	).map(String);
	await page.getByTestId("tool-picker").click();

	// the dark sky and the bright moon: the moon is the lighter level
	const sky = await spot(page, 0.1, 0.05);
	await page.mouse.move(sky.x, sky.y);
	const card = page.getByTestId("picker-card");
	await expect(card).toBeVisible();
	const darkId = await page
		.getByTestId("picker-grade")
		.getAttribute("data-grade");
	expect(order).toContain(darkId);
	await expect(page.getByTestId("picker-grade")).toHaveText(String(darkId));
	await page.mouse.click(sky.x, sky.y);
	await expect(card).toHaveAttribute("data-pinned", "true");
	await page.keyboard.press("Escape");
	const moon = await spot(page, 340 / 480, 150 / 640);
	await page.mouse.move(moon.x, moon.y);
	await expect(card).toHaveAttribute("data-pinned", "false");
	await page.mouse.click(moon.x, moon.y);
	await expect(card).toHaveAttribute("data-pinned", "true");
	const lightId = String(
		await page.getByTestId("picker-grade").getAttribute("data-grade"),
	);
	expect(order).toContain(lightId);
	expect(order.indexOf(lightId)).toBeGreaterThan(order.indexOf(String(darkId)));

	// the card is a pencil card: a grade, a hint and the pressure; no paint, skin or dry hint
	const words = (id: string) =>
		id === "Paper"
			? "Paper, no pressure"
			: `${id}, ${pressureWords(GRADES.find((g) => g.id === id) ?? GRADES[0])}`;
	await expect(page.getByTestId("picker-hint")).not.toBeEmpty();
	await expect(page.getByTestId("picker-pressure")).toHaveText(
		/(light|medium|firm|no) pressure/,
	);
	for (const id of ["white", "yellow", "red", "lake", "phthalo", "black"])
		await expect(page.getByTestId(`picker-${id}`)).toHaveCount(0);
	await expect(page.getByTestId("picker-dry")).toHaveCount(0);
	await expect(page.getByTestId("picker-skin")).toHaveCount(0);
	await expect(page.getByTestId("picker-parts")).toHaveCount(0);

	// the area is never smaller than Small here
	const area = page.getByTestId("picker-area");
	await expect(area.getByRole("radio", { name: "Small" })).toBeChecked();
	await expect(area.getByRole("radio", { name: "Point" })).toHaveCount(0);

	// copy says the grade and the pressure; a screen reader hears the same
	await page.getByTestId("picker-copy").click();
	await expect(page.getByTestId("picker-copied")).toHaveText("Copied");
	const text = await page.evaluate(() => navigator.clipboard.readText());
	expect(text).toBe(words(lightId));
	await expect(
		page.getByRole("status").filter({ hasText: words(lightId) }),
	).toBeVisible();
	await page.getByTestId("picker-close").click();
	await expect(page.getByTestId("picker-mark")).toHaveCount(0);
});

test("test_pencil_settings_come_back_after_reload", async ({ studio }) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "pencil-reload.png");
	await studio.base("pencil");
	await studio.knob("pencil-look", 2);
	await studio.knob("pencil-detail", 80);
	await studio.drawn(() => page.locator(grade("4H")).click());
	const saved = await studio.saved();
	expect(saved.base.kind).toBe("pencil");
	expect(saved.pencil).toEqual({
		...START,
		look: 2,
		mask: ALL & ~(1 << 7),
		detail: 80,
	});
	await page.reload();
	await studio.openSynthetic(480, 640, "pencil-reload.png");
	await expect(page.getByTestId("layer-canvas-base")).toBeVisible({
		timeout: 60_000,
	});
	await studio.tool("base");
	// Zones is back: it shows the three knobs it uses and not the Tone or Texture groups
	expect((await studio.saved()).pencil.look).toBe(LOOK.zones);
	expect(await sliderValue(page, "pencil-detail")).toBe("80");
	await expect(page.locator(grade("4H"))).toHaveAttribute(
		"aria-pressed",
		"false",
	);
	await expect(page.locator(grade("9B"))).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await expect(page.getByTestId("legend-swatch")).toHaveCount(8);
});

test("test_an_old_save_without_pencil_and_a_bad_pencil_save_load_with_start_values", async ({
	studio,
}) => {
	const { page } = studio;
	// let the page finish its own first save, or it would write over the save set below
	await studio.saved();
	await store(page, KEYS.state, {
		base: { kind: "pencil", opacity: 100 },
		pencil: { look: 5, mask: 0, detail: 500 },
	});
	await page.reload();
	await studio.openSynthetic(480, 640, "pencil-old.png");
	await expect(page.getByTestId("layer-canvas-base")).toBeVisible({
		timeout: 60_000,
	});
	const bad = await studio.saved();
	expect(bad.pencil).toEqual(START);
	// a save from before Pencil has no `pencil` part at all
	await store(page, KEYS.state, { base: { kind: "values", opacity: 100 } });
	await page.reload();
	await studio.openSynthetic(480, 640, "pencil-old.png");
	await expect(page.getByTestId("layer-canvas-base")).toBeVisible({
		timeout: 60_000,
	});
	expect((await studio.saved()).pencil).toEqual(START);
	await expect(page.getByTestId("error")).toHaveCount(0);
});

test("test_a_save_from_before_the_knobs_and_a_half_bad_save_keep_what_is_good", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.saved();
	// a Pencil save from before the knobs: look, pencils and detail only
	await store(page, KEYS.state, {
		base: { kind: "pencil", opacity: 100 },
		pencil: { look: 2, mask: 7, detail: 80 },
	});
	await page.reload();
	await studio.openSynthetic(480, 640, "pencil-half.png");
	await expect(page.getByTestId("layer-canvas-base")).toBeVisible({
		timeout: 60_000,
	});
	expect((await studio.saved()).pencil).toEqual({
		...START,
		look: 2,
		mask: 7,
		detail: 80,
	});
	// a save with good and bad numbers: each bad one falls back alone
	await store(page, KEYS.state, {
		base: { kind: "pencil", opacity: 100 },
		pencil: {
			look: 4,
			mask: 0,
			key: 70,
			contrast: 101,
			highlights: 1.5,
			darks: "many",
			local: null,
			grain: 30,
			paper: 3,
			angle: -1,
			density: 60,
			step: 9,
		},
	});
	await page.reload();
	await studio.openSynthetic(480, 640, "pencil-half.png");
	await expect(page.getByTestId("layer-canvas-base")).toBeVisible({
		timeout: 60_000,
	});
	expect((await studio.saved()).pencil).toEqual({
		...START,
		look: 4,
		key: 70,
		grain: 30,
		density: 60,
	});
	await expect(page.getByTestId("error")).toHaveCount(0);
});

test("test_every_look_draws_and_edges_stays_off", async ({ studio }) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "pencil-looks.png");
	await studio.base("pencil");
	const pictures = new Set<number>();
	for (const [i, name] of LOOK_NAMES.entries()) {
		if (i !== LOOK.tone) await studio.knob("pencil-look", i);
		await expect(page.getByTestId("layer-canvas-base"), name).toBeVisible();
		await expect(page.getByTestId("error"), name).toHaveCount(0);
		pictures.add(await pictureOf(studio));
		expect((await studio.saved()).pencil.look, name).toBe(i);
		// Edges stays off and disabled in every look; the legend keeps eight pencils and Paper
		await expect(page.getByTestId("tool-edges"), name).toBeDisabled();
		await expect(page.getByTestId("layer-canvas-edges"), name).toHaveCount(0);
		await expect(page.getByTestId("legend-swatch"), name).toHaveCount(9);
	}
	// five looks, five different pictures
	expect(pictures.size).toBe(5);
});

/** The controls each look shows: every id of the card, with the looks that show it. */
const SHOWN_IN: Record<string, number[]> = {
	"pencil-tone-group": [0, 1, 2, 3, 4],
	"pencil-detail": [0, 1, 2, 3, 4],
	"pencil-highlights": [0, 1, 2, 3, 4],
	"pencil-darks": [0, 1, 2, 3, 4],
	"pencil-key": [0, 1, 3, 4],
	"pencil-contrast": [0, 1, 3, 4],
	"pencil-local": [0, 1, 3, 4],
	"pencil-texture-group": [1, 3],
	"pencil-grain": [1, 3],
	"pencil-paper": [1, 3],
	"pencil-hatch-angle": [1, 3],
	"pencil-hatch-density": [3],
	"pencil-step": [4],
	"pencil-auto": [0, 1, 3, 4],
	"pencil-suggest-count": [0, 1, 2, 3, 4],
	"pencil-suggest": [0, 1, 2, 3, 4],
	"pencil-reset": [0, 1, 2, 3, 4],
	"pencil-grades": [0, 1, 2, 3, 4],
};

test("test_each_look_shows_only_the_controls_it_uses", async ({ studio }) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "pencil-shown.png");
	await studio.base("pencil");
	for (const [i, name] of LOOK_NAMES.entries()) {
		if (i !== LOOK.tone) await studio.knob("pencil-look", i);
		for (const [id, looks] of Object.entries(SHOWN_IN))
			await expect(page.getByTestId(id), `${name}: ${id}`).toHaveCount(
				looks.includes(i) ? 1 : 0,
			);
	}
	// Zones: the three knobs it has change its picture
	await studio.knob("pencil-look", LOOK.zones);
	for (const [id, value] of [
		["pencil-detail", 90],
		["pencil-highlights", 10],
		["pencil-darks", 0],
	] as const) {
		const before = await pictureOf(studio);
		await studio.knob(id, value);
		expect(await pictureOf(studio), id).not.toBe(before);
	}
});

test("test_each_knob_changes_the_picture_and_is_saved", async ({ studio }) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "pencil-knobs.png");
	await studio.base("pencil");
	let look = LOOK.tone;
	for (const k of KNOBS) {
		if (k.look !== look) {
			await studio.knob("pencil-look", k.look);
			look = k.look;
		}
		const before = await pictureOf(studio);
		await studio.knob(k.id, k.value);
		expect(await pictureOf(studio), k.id).not.toBe(before);
		expect((await studio.saved()).pencil[k.key], k.id).toBe(k.value);
		await expect(page.getByTestId("error")).toHaveCount(0);
	}
});

test("test_the_knobs_come_back_after_a_reload", async ({ studio }) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "pencil-knobs-reload.png");
	await studio.base("pencil");
	let look = LOOK.tone;
	for (const k of KNOBS) {
		if (k.look !== look) {
			await studio.knob("pencil-look", k.look);
			look = k.look;
		}
		await studio.knob(k.id, k.value);
	}
	const want = { ...START, look: LOOK.byPencil };
	for (const k of KNOBS) want[k.key] = k.value;
	expect((await studio.saved()).pencil).toEqual(want);
	await page.reload();
	await studio.openSynthetic(480, 640, "pencil-knobs-reload.png");
	await expect(page.getByTestId("layer-canvas-base")).toBeVisible({
		timeout: 60_000,
	});
	await studio.tool("base");
	// By pencil is back, with its step
	expect(await sliderValue(page, "pencil-step")).toBe("4");
	// the other knobs show in Hatch, which has them all
	await studio.knob("pencil-look", LOOK.hatch);
	for (const k of KNOBS) {
		if (k.id === "pencil-step") continue;
		if (k.id === "pencil-paper") {
			await expect(
				page.getByTestId(k.id).getByRole("radio").nth(k.value),
			).toBeChecked();
			continue;
		}
		expect(await sliderValue(page, k.id), k.id).toBe(String(k.value));
	}
	expect((await studio.saved()).pencil).toEqual({ ...want, look: LOOK.hatch });
});

test("test_reset_puts_every_knob_back_but_keeps_the_look_and_the_pencils", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "pencil-reset.png");
	await studio.base("pencil");
	await studio.knob("pencil-look", LOOK.drawing);
	await studio.drawn(() => page.locator(grade("4H")).click());
	const start = await pictureOf(studio);
	await studio.knob("pencil-key", 70);
	await studio.knob("pencil-contrast", 70);
	await studio.knob("pencil-grain", 90);
	await studio.knob("pencil-paper", 2);
	expect(await pictureOf(studio)).not.toBe(start);
	await studio.drawn(() => page.getByTestId("pencil-reset").click());
	// the same picture as before the knobs, and the saved start values
	expect(await pictureOf(studio)).toBe(start);
	expect((await studio.saved()).pencil).toEqual({
		...START,
		look: LOOK.drawing,
		mask: ALL & ~(1 << 7),
	});
	expect(await sliderValue(page, "pencil-key")).toBe("50");
	expect(await sliderValue(page, "pencil-grain")).toBe("50");
	await expect(
		page.getByTestId("pencil-paper").getByRole("radio").nth(1),
	).toBeChecked();
	await expect(page.locator(grade("4H"))).toHaveAttribute(
		"aria-pressed",
		"false",
	);
});

test("test_auto_sets_key_contrast_and_highlights_and_says_what_it_did", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "pencil-auto.png");
	await studio.base("pencil");
	const note = page.getByTestId("pencil-auto-note");
	await page.getByTestId("pencil-auto").click();
	await expect(note).toContainText(/photo \(middle tone L\* \d+\)/);
	await expect(note).toContainText(/percent stays bare paper/);
	await expect(note).toHaveAttribute("aria-live", "polite");
	// the three knobs are whole numbers in range, and the sliders show them
	const p = (await studio.saved()).pencil;
	for (const [key, hi] of [
		["key", 100],
		["contrast", 100],
		["highlights", 25],
	] as const) {
		expect(Number.isInteger(p[key]), key).toBe(true);
		expect(p[key], key).toBeGreaterThanOrEqual(0);
		expect(p[key], key).toBeLessThanOrEqual(hi);
		await expect(
			page.locator(`[data-testid=pencil-${key}] input[type=range]`),
		).toHaveValue(String(p[key]));
	}
	// the other knobs are untouched, and the note is not saved
	expect(p).toEqual({
		...START,
		key: p.key,
		contrast: p.contrast,
		highlights: p.highlights,
	});
	// moving one of the three by hand clears the note
	const gone = async () =>
		(await note.count()) === 0 ? "" : ((await note.textContent()) ?? "").trim();
	await studio.knob("pencil-key", p.key === 80 ? 20 : 80);
	await expect.poll(gone).toBe("");
	// Auto again brings it back, and another photo clears it
	await page.getByTestId("pencil-auto").click();
	await expect(note).toContainText(/percent stays bare paper/);
	await studio.openSynthetic(480, 640, "pencil-auto-other.png");
	await expect.poll(gone).toBe("");
});

/** The grades of the chips of a suggestion, sorted. */
const chipGrades = (page: Page) =>
	page
		.getByTestId("pencil-suggested-grade")
		.evaluateAll((l) =>
			l.map((e) => String((e as HTMLElement).dataset.grade)).sort(),
		);

test("test_suggest_pencils_gives_three_to_six_and_apply_shows_only_those", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "pencil-suggest.png");
	await studio.base("pencil");
	const count = page.getByTestId("pencil-suggest-count").getByRole("radio");
	await expect(count).toHaveText(["3", "4", "5", "6"]);
	await expect(page.getByTestId("pencil-suggested")).toHaveCount(0);
	for (const [i, n] of [3, 4, 5, 6].entries()) {
		const before = await legendGrades(page);
		await count.nth(i).click();
		await page.getByTestId("pencil-suggest").click();
		const chips = page.getByTestId("pencil-suggested");
		await expect(chips).toBeVisible();
		const mask = Number(await chips.getAttribute("data-mask"));
		expect(mask).toBeGreaterThanOrEqual(1);
		expect(mask).toBeLessThanOrEqual(255);
		expect(mask.toString(2).replaceAll("0", "").length, `count ${n}`).toBe(n);
		// one chip per suggested pencil
		expect(await chipGrades(page)).toEqual(pencilsOf(mask).sort());
		// a suggestion alone changes nothing
		expect(await legendGrades(page)).toEqual(before);
		// Apply sets the pencils: the legend shows only those, and the grade row agrees
		await studio.drawn(() => page.getByTestId("pencil-suggest-apply").click());
		expect(await legendGrades(page)).toEqual([...pencilsOf(mask), "Paper"]);
		expect((await studio.saved()).pencil.mask).toBe(mask);
		for (const [bit, g] of GRADES.entries())
			await expect(page.locator(grade(g.id))).toHaveAttribute(
				"aria-pressed",
				String((mask & (1 << bit)) !== 0),
			);
	}
});

test("test_by_pencil_marks_the_step_in_the_legend_and_the_picker_names_it", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "pencil-by.png");
	await studio.base("pencil");
	const marked = page.locator("[data-testid=legend-swatch][data-step=true]");
	// the other looks mark nothing
	await expect(marked).toHaveCount(0);
	await studio.knob("pencil-look", LOOK.byPencil);
	// step 1 is the lightest pencil, the 4H
	await expect(marked).toHaveCount(1);
	await expect(marked).toHaveAttribute("aria-current", "step");
	await expect(marked).toHaveAttribute("data-grade", "4H");
	// step 4 of 8 is the HB
	await studio.knob("pencil-step", 4);
	await expect(marked).toHaveCount(1);
	await expect(marked).toHaveAttribute("data-grade", "HB");
	await expect(page.getByTestId("pencil-step-line")).toHaveText(
		"Step 4 of 8: HB",
	);
	// without the 9B the set has seven pencils: the step slider stops at 7, the HB stays the step
	await studio.drawn(() => page.locator(grade("9B")).click());
	await expect(page.getByTestId("legend-swatch")).toHaveCount(8);
	await expect(
		page.locator("[data-testid=pencil-step] input[type=range]"),
	).toHaveAttribute("max", "7");
	await expect(marked).toHaveAttribute("data-grade", "HB");
	await studio.drawn(() => page.locator(grade("9B")).click());

	// the picker: a spot at or darker than the step is the step pencil, a lighter spot is not
	const order = await legendGrades(page);
	await page.getByTestId("tool-picker").click();
	const sky = await spot(page, 0.1, 0.05);
	await page.mouse.move(sky.x, sky.y);
	await expect(page.getByTestId("picker-card")).toBeVisible();
	await expect(page.getByTestId("picker-grade")).toHaveText("HB");
	await expect(page.getByTestId("picker-grade")).toHaveAttribute(
		"data-step",
		"true",
	);
	const moon = await spot(page, 340 / 480, 150 / 640);
	await page.mouse.move(moon.x, moon.y);
	await expect(page.getByTestId("picker-grade")).not.toHaveAttribute(
		"data-step",
		"true",
	);
	const light = String(
		await page.getByTestId("picker-grade").getAttribute("data-grade"),
	);
	expect(order.indexOf(light)).toBeGreaterThan(order.indexOf("HB"));
	await page.getByTestId("tool-picker").click();

	// back to Tone: nothing is marked
	await studio.knob("pencil-look", LOOK.tone);
	await expect(marked).toHaveCount(0);
});

test("test_the_picker_names_a_grade_of_the_legend_in_every_look", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(480, 640, "pencil-picker-looks.png");
	await studio.base("pencil");
	const picker = page.getByTestId("tool-picker");
	for (const [i, name] of LOOK_NAMES.entries()) {
		if ((await picker.getAttribute("aria-pressed")) === "true")
			await picker.click();
		if (i !== LOOK.tone) await studio.knob("pencil-look", i);
		const order = await legendGrades(page);
		await picker.click();
		const sky = await spot(page, 0.1, 0.05);
		await page.mouse.move(sky.x, sky.y);
		await expect(page.getByTestId("picker-card"), name).toBeVisible();
		const dark = String(
			await page.getByTestId("picker-grade").getAttribute("data-grade"),
		);
		const moon = await spot(page, 340 / 480, 150 / 640);
		await page.mouse.move(moon.x, moon.y);
		await expect(page.getByTestId("picker-card"), name).toBeVisible();
		const light = String(
			await page.getByTestId("picker-grade").getAttribute("data-grade"),
		);
		// both are levels of the legend, and the moon is not darker than the sky
		expect(order, `${name}: ${dark}`).toContain(dark);
		expect(order, `${name}: ${light}`).toContain(light);
		expect(order.indexOf(light), name).toBeGreaterThanOrEqual(
			order.indexOf(dark),
		);
		await expect(page.getByTestId("picker-grade"), name).toHaveText(light);
	}
});

test.describe("phone sheet", () => {
	test.use({ viewport: { width: 390, height: 844 } });

	/** Scrolls the card body just enough to bring a control into view; true when the control then
	 * sits inside the body and inside the window. */
	const reach = (page: Page, id: string) =>
		page.evaluate((testid) => {
			const body = document.querySelector<HTMLElement>("[data-testid=tools]");
			const el = document.querySelector<HTMLElement>(`[data-testid=${testid}]`);
			if (!body || !el) return false;
			const b = body.getBoundingClientRect();
			let r = el.getBoundingClientRect();
			if (r.bottom > b.bottom) body.scrollTop += r.bottom - b.bottom + 4;
			else if (r.top < b.top) body.scrollTop -= b.top - r.top + 4;
			r = el.getBoundingClientRect();
			return (
				r.top >= b.top - 1 &&
				r.bottom <= b.bottom + 1 &&
				r.left >= -1 &&
				r.right <= innerWidth + 1
			);
		}, id);

	test("test_the_pencil_card_scrolls_inside_the_sheet_and_every_control_is_reachable", async ({
		studio,
	}) => {
		const { page } = studio;
		await studio.openSynthetic(480, 640, "pencil-phone.png");
		await studio.base("pencil");
		for (const look of [LOOK.hatch, LOOK.byPencil]) {
			await studio.knob("pencil-look", look);
			// the sheet fits the window
			const sheet = await box(page, "tool-popup");
			expect(sheet.y).toBeGreaterThanOrEqual(0);
			expect(sheet.y + sheet.height).toBeLessThanOrEqual(844 + 1);
			expect(sheet.x).toBeGreaterThanOrEqual(-1);
			expect(sheet.x + sheet.width).toBeLessThanOrEqual(390 + 1);
			// the body scrolls inside the sheet, and the page does not scroll sideways
			const body = await page.getByTestId("tools").evaluate((el) => ({
				overflowY: getComputedStyle(el).overflowY,
				scrolls: el.scrollHeight > el.clientHeight,
			}));
			expect(["auto", "scroll"]).toContain(body.overflowY);
			if (look === LOOK.hatch) expect(body.scrolls).toBe(true);
			expect(
				await page.evaluate(
					() => document.documentElement.scrollWidth > innerWidth,
				),
			).toBe(false);
			// every control the look shows can be brought into view
			const ids = Object.entries(SHOWN_IN)
				.filter(([id, looks]) => looks.includes(look) && !id.endsWith("-group"))
				.map(([id]) => id);
			for (const id of ids) expect(await reach(page, id), id).toBe(true);
		}
	});
});
