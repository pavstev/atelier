// The color picker: the paint mix math and the pixel sampler as plain functions, then the page:
// the bar toggle, the hover card, a click that pins it and Esc that lets it go.
import { type Mix, mixFor, PAINTS, type Rgb } from "../src/features/picker/mix";
import { colorAt } from "../src/features/picker/sample";
import { box, expect, readCanvas, test } from "./studio";

const share = (m: Mix, id: string) =>
	m.weights[PAINTS.findIndex((p) => p.id === id)] as number;

test("test_mix_a_tube_color_is_that_tube", () => {
	for (const paint of PAINTS) {
		const m = mixFor(paint.rgb);
		expect(share(m, paint.id)).toBeGreaterThan(0.9);
		expect(m.error).toBeLessThan(3);
	}
});

test("test_mix_shares_add_up_to_one_and_parts_are_whole_numbers", () => {
	for (const c of [
		[128, 128, 128],
		[90, 120, 60],
		[200, 140, 110],
		[10, 10, 10],
	] as Rgb[]) {
		const m = mixFor(c);
		expect(m.weights.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 6);
		for (const n of m.parts) expect(Number.isInteger(n) && n >= 0).toBe(true);
		for (const x of m.weights) expect(x === 0 || x >= 0.02).toBe(true);
	}
});

test("test_mix_gray_is_white_and_black_and_green_is_yellow_and_blue", () => {
	const gray = mixFor([128, 128, 128]);
	expect(share(gray, "white")).toBeGreaterThan(0.2);
	expect(share(gray, "black")).toBeGreaterThan(0.01);
	expect(
		share(gray, "yellow") + share(gray, "red") + share(gray, "blue"),
	).toBeLessThan(0.3);
	const green = mixFor([90, 120, 60]);
	expect(share(green, "yellow")).toBeGreaterThan(0);
	expect(share(green, "blue")).toBeGreaterThan(0);
	expect(share(green, "red")).toBeLessThan(0.2);
});

test("test_mix_gives_the_same_answer_twice", () => {
	expect(mixFor([77, 66, 55])).toEqual(mixFor([77, 66, 55]));
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
	for (const id of ["white", "yellow", "red", "blue", "black"]) {
		const row = page.getByTestId(`picker-${id}`);
		await expect(row).toBeVisible();
		total += Number(await row.getAttribute("data-share"));
	}
	expect(total).toBeCloseTo(1, 2);

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
