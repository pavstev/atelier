// The color picker. The first half proves the color science against published numbers and against
// the plain rules of paint mixing, with no browser: CIEDE2000 on the pairs of Sharma, Wu and Dalal
// (2005), the spectrum to sRGB path on a flat gray, the Kubelka-Munk law and its surface term, the
// hues that theory expects (yellow and blue make green, and so on) and the search that finds a
// recipe. Then the pixel sampler, then the page: the bar toggle, the hover card, a click that pins
// it and Esc that lets it go.
import {
	labOfMix,
	type Mix,
	masstone,
	mixFor,
	PAINTS,
	type Rgb,
	rgbOfMix,
} from "../src/features/picker/mix";
import { colorAt } from "../src/features/picker/sample";
import {
	BANDS,
	deltaE2000,
	inside,
	ksOf,
	kubelkaMunk,
	rgbOfXyz,
	surface,
	xyzOf,
} from "../src/features/picker/spectral";
import { box, expect, readCanvas, test } from "./studio";

const ids = PAINTS.map((p) => p.id);
/** A recipe from shares by paint id; the shares are scaled to add up to 1. */
const recipe = (o: Partial<Record<(typeof ids)[number], number>>) => {
	const t = Object.values(o).reduce((s, x) => s + (x ?? 0), 0);
	return ids.map((id) => (o[id] ?? 0) / t);
};
const share = (m: Mix, id: string) =>
	m.weights[ids.indexOf(id as never)] as number;
const hue = (l: readonly number[]) =>
	((Math.atan2(l[2] as number, l[1] as number) * 180) / Math.PI + 360) % 360;
const chroma = (l: readonly number[]) =>
	Math.hypot(l[1] as number, l[2] as number);

test("test_ciede2000_matches_the_published_pairs", () => {
	// Sharma, Wu and Dalal (2005), table of test data, pairs 1 to 3
	const ref: [number, number, number] = [50, 0, -82.7485];
	expect(deltaE2000([50, 2.6772, -79.7751], ref)).toBeCloseTo(2.0425, 3);
	expect(deltaE2000([50, 3.1571, -77.2803], ref)).toBeCloseTo(2.8615, 3);
	expect(deltaE2000([50, 2.8361, -74.02], ref)).toBeCloseTo(3.4412, 3);
	// the same color is no difference; the order does not matter
	expect(deltaE2000([60, 10, -20], [60, 10, -20])).toBe(0);
	expect(deltaE2000([60, 10, -20], [55, 0, 5])).toBeCloseTo(
		deltaE2000([55, 0, 5], [60, 10, -20]),
		6,
	);
});

test("test_a_flat_spectrum_is_a_neutral_gray_of_the_right_lightness", () => {
	const flat = (r: number) => BANDS.map(() => r);
	// a perfect white is the D65 white of the screen
	expect(rgbOfXyz(xyzOf(flat(1)))).toEqual([255, 255, 255]);
	// an 18 percent gray card is Y = 0.18, sRGB about 118
	const y = xyzOf(flat(0.18));
	expect(y[1]).toBeCloseTo(0.18, 3);
	const [r, g, b] = rgbOfXyz(y);
	for (const c of [r, g, b]) expect(Math.abs(c - 118)).toBeLessThanOrEqual(2);
	expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(2);
});

test("test_kubelka_munk_and_the_surface_term_follow_their_laws", () => {
	// no absorption gives all the light back; a lot gives almost none
	expect(kubelkaMunk(0, 1)).toBeCloseTo(1, 9);
	expect(kubelkaMunk(1e6, 1)).toBeLessThan(0.001);
	// K/S and the reflectance are each other's inverse
	for (const r of [0.04, 0.2, 0.5, 0.9]) {
		expect(kubelkaMunk(ksOf(r), 1)).toBeCloseTo(r, 9);
		expect(inside(surface(r))).toBeCloseTo(r, 9);
		// the surface term only takes light away
		expect(surface(r)).toBeLessThan(r);
	}
	// K and S add by share: two equal halves of one paint are that paint
	const half = kubelkaMunk(0.5 * 2 + 0.5 * 2, 0.5 * 3 + 0.5 * 3);
	expect(half).toBeCloseTo(kubelkaMunk(2, 3), 9);
});

test("test_the_white_paint_is_the_white_of_the_screen_and_each_tube_is_what_it_is", () => {
	expect(masstone(0)).toEqual([255, 255, 255]);
	const [wr, wg, wb] = masstone(0);
	expect(Math.max(wr, wg, wb) - Math.min(wr, wg, wb)).toBe(0);
	// the dark paints are dark, the yellow is light, the reds and blues have their hue
	const lab = (id: string) => labOfMix(recipe({ [id]: 1 }));
	expect(lab("yellow")[0]).toBeGreaterThan(75);
	expect(hue(lab("yellow"))).toBeGreaterThan(80);
	expect(hue(lab("yellow"))).toBeLessThan(105);
	expect(hue(lab("red"))).toBeGreaterThan(20);
	expect(hue(lab("red"))).toBeLessThan(45);
	expect(lab("black")[0]).toBeLessThan(15);
	expect(chroma(lab("black"))).toBeLessThan(3);
	for (const id of ["lake", "phthalo"]) {
		expect(hue(lab(id))).toBeGreaterThan(200);
		expect(hue(lab(id))).toBeLessThan(300);
	}
});

test("test_mixing_follows_the_rules_of_color_theory", () => {
	const lab = (o: Parameters<typeof recipe>[0]) => labOfMix(recipe(o));
	// yellow and a blue make a green; a phthalo green is cleaner than an ultramarine one
	const yl = lab({ yellow: 1, lake: 1 });
	const yp = lab({ yellow: 1, phthalo: 1 });
	for (const g of [yl, yp]) {
		expect(hue(g)).toBeGreaterThan(110);
		expect(hue(g)).toBeLessThan(200);
	}
	expect(chroma(yp)).toBeGreaterThan(chroma(yl));
	// yellow and red make orange
	const o = lab({ yellow: 1, red: 1 });
	expect(hue(o)).toBeGreaterThan(30);
	expect(hue(o)).toBeLessThan(70);
	// red and a blue make a dark muted violet or brown, and phthalo and red nearly a black
	expect(lab({ red: 1, lake: 1 })[0]).toBeLessThan(30);
	const rp = lab({ red: 1, phthalo: 1 });
	expect(rp[0]).toBeLessThan(25);
	expect(chroma(rp)).toBeLessThan(8);
	// black and yellow go green (the old painter's rule)
	const by = lab({ black: 1, yellow: 1 });
	expect(hue(by)).toBeGreaterThan(95);
	expect(hue(by)).toBeLessThan(140);
	// the three primaries make a brown: dark and muted
	const brown = lab({ red: 1, yellow: 1, lake: 1 });
	expect(brown[0]).toBeLessThan(40);
	expect(chroma(brown)).toBeLessThan(40);
	// black and white make a neutral gray
	expect(chroma(lab({ white: 9, black: 1 }))).toBeLessThan(3);
	// white lifts any paint and keeps its hue near
	for (const id of ["yellow", "red", "lake", "phthalo"]) {
		let last = -1;
		for (const t of [0, 0.25, 0.5, 0.75, 0.95]) {
			const l = lab({ white: t, [id]: 1 - t });
			expect(l[0]).toBeGreaterThan(last);
			last = l[0];
		}
		const tint = lab({ white: 0.5, [id]: 0.5 });
		const full = lab({ [id]: 1 });
		const d = Math.abs(hue(tint) - hue(full));
		expect(Math.min(d, 360 - d)).toBeLessThan(15);
	}
});

test("test_every_tube_color_is_found_as_that_tube", () => {
	for (let i = 0; i < PAINTS.length; i++) {
		const m = mixFor(masstone(i));
		// phthalo blue is outside the sRGB screen (its red is below zero), so its screen color is
		// clipped and a mix of the two blues may match the clipped color better
		const clipped = masstone(i).some((c) => c === 0 || c === 255);
		if (!clipped) expect(m.weights[i]).toBeGreaterThan(0.9);
		expect(m.error).toBeLessThan(5);
	}
});

test("test_a_mix_made_from_a_recipe_is_found_again", () => {
	for (const made of [
		{ white: 6, yellow: 3, red: 1 },
		{ white: 5, lake: 3, black: 1 },
		{ yellow: 5, phthalo: 1, white: 3 },
		{ red: 4, white: 5, yellow: 1, black: 1 },
		{ white: 8, red: 1, lake: 1 },
	]) {
		const color = rgbOfMix(recipe(made));
		const m = mixFor(color);
		// the search may pick another recipe, but the color must be the same to the eye
		expect(m.error).toBeLessThan(2);
	}
	// with paints that cannot stand in for each other the recipe itself comes back
	const m = mixFor(rgbOfMix(recipe({ white: 6, yellow: 3, red: 1 })));
	expect(share(m, "white")).toBeCloseTo(0.6, 1);
	expect(share(m, "yellow")).toBeCloseTo(0.3, 1);
	expect(share(m, "red")).toBeCloseTo(0.1, 1);
});

test("test_a_gray_is_white_and_black_and_never_a_color_paint", () => {
	// (a gray darker than the black paint itself, about 30, cannot be mixed)
	for (const v of [40, 60, 90, 128, 170, 210, 240]) {
		const m = mixFor([v, v, v]);
		expect(m.error).toBeLessThan(2);
		for (const id of ["yellow", "red", "lake", "phthalo"])
			expect(share(m, id)).toBeLessThan(0.02);
	}
});

test("test_mix_shares_add_up_to_one_and_parts_are_whole_numbers", () => {
	for (const c of [
		[128, 128, 128],
		[90, 120, 60],
		[200, 140, 110],
		[10, 10, 10],
		[240, 200, 60],
	] as Rgb[]) {
		const m = mixFor(c);
		expect(m.weights.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 6);
		for (const n of m.parts) expect(Number.isInteger(n) && n >= 0).toBe(true);
		for (const x of m.weights) expect(x).toBeGreaterThanOrEqual(0);
	}
	expect(mixFor([77, 66, 55])).toEqual(mixFor([77, 66, 55]));
});

test("test_the_search_is_fast_enough_to_follow_the_mouse", () => {
	const t = performance.now();
	for (let i = 0; i < 30; i++)
		mixFor([(i * 37) % 256, (i * 91 + 40) % 256, (i * 53 + 90) % 256]);
	expect((performance.now() - t) / 30).toBeLessThan(80);
});

/** A small picture, in the shape of `ImageData`. */
const picture = (w: number, h: number, px: number[][]) =>
	({
		width: w,
		height: h,
		data: Uint8ClampedArray.from(px.flat()),
	}) as unknown as ImageData;

test("test_sample_reads_the_photo_then_layers_over_it_and_stops_at_the_edge", () => {
	const photo = picture(2, 1, [
		[200, 0, 0, 255],
		[0, 200, 0, 255],
	]);
	const none = { base: null, edges: null, grid: null };
	expect(colorAt(photo, none, false, false, 0.5, 0.5)).toEqual([200, 0, 0]);
	expect(colorAt(photo, none, false, false, 1.5, 0.5)).toEqual([0, 200, 0]);
	expect(colorAt(photo, none, false, false, 2, 0.5)).toBeNull();
	expect(colorAt(photo, none, false, false, -0.1, 0.5)).toBeNull();
	// a half see-through white layer, drawn at another size, lies over the photo
	const over = {
		...none,
		edges: { image: picture(1, 1, [[255, 255, 255, 255]]), opacity: 50 },
	};
	expect(colorAt(photo, over, false, false, 0.5, 0.5)).toEqual([228, 128, 128]);
	// the held photo button hides the layers
	expect(colorAt(photo, over, false, true, 0.5, 0.5)).toEqual([200, 0, 0]);
	// Paper is white until the photo button is held
	expect(colorAt(photo, none, true, false, 0.5, 0.5)).toEqual([255, 255, 255]);
	expect(colorAt(photo, none, true, true, 0.5, 0.5)).toEqual([200, 0, 0]);
});

test("test_picker_card_follows_the_mouse_pins_on_click_and_goes_on_esc", async ({
	studio,
}) => {
	const { page } = studio;
	await studio.openSynthetic(240, 320, "picker.png");
	const toggle = page.getByTestId("tool-picker");
	await expect(toggle).toHaveAttribute("aria-pressed", "false");
	await expect(page.getByTestId("picker-card")).toHaveCount(0);
	await toggle.click();
	await expect(toggle).toHaveAttribute("aria-pressed", "true");

	// the middle of the shown photo, and the color the canvas has there
	const b = await box(page, "photo-canvas");
	const x = b.x + b.width / 2;
	const y = b.y + b.height / 2;
	const centre = await readCanvas(page, "photo-canvas", (img) => {
		const i =
			(Math.floor(img.height / 2) * img.width + Math.floor(img.width / 2)) * 4;
		return `#${[0, 1, 2]
			.map((k) => (img.data[i + k] as number).toString(16).padStart(2, "0"))
			.join("")}`;
	});
	await page.mouse.move(x, y);
	const card = page.getByTestId("picker-card");
	await expect(card).toBeVisible();
	await expect(card).toHaveAttribute("data-pinned", "false");
	await expect(card).toHaveAttribute("data-color", centre);
	// the five paints are listed, and their shares add up to 100%
	let total = 0;
	for (const id of PAINTS.map((p) => p.id)) {
		const row = page.getByTestId(`picker-${id}`);
		await expect(row).toBeVisible();
		total += Number(await row.getAttribute("data-share"));
	}
	expect(total).toBeCloseTo(1, 2);
	await expect(page.getByTestId("picker-verdict")).toHaveText(
		/same to the eye|close match|nearest mix/,
	);

	// a click pins the card; it stays when the mouse leaves
	await page.mouse.click(x, y);
	await expect(card).toHaveAttribute("data-pinned", "true");
	await page.mouse.move(x + 40, y + 40);
	await expect(card).toHaveAttribute("data-pinned", "true");
	await expect(card).toHaveAttribute("data-color", centre);
	await expect(page.getByTestId("picker-mark")).toBeVisible();

	// Esc lets it go; the toggle turns the picker off
	await page.keyboard.press("Escape");
	await expect(card).toHaveAttribute("data-pinned", "false");
	await toggle.click();
	await expect(toggle).toHaveAttribute("aria-pressed", "false");
	await expect(page.getByTestId("picker-card")).toHaveCount(0);
});
