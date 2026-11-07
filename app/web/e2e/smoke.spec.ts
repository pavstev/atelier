// A short pass over the app: open a photo, switch every layer on. It runs on the dev
// server, on the built app (PREVIEW=1, with the Cloudflare headers) and on the live site
// (URL=...). The fixture fails on any console error, so a blocked wasm or worker shows up here.
import { expect, MAIN_PHOTO, test } from "./studio";

test("test_open_and_every_layer_draws", async ({ studio }) => {
	const { page } = studio;
	await studio.open(MAIN_PHOTO);
	for (const kind of ["values", "shapes"] as const) {
		await studio.base(kind);
		await expect(page.getByTestId("layer-canvas-base")).toBeVisible();
		await expect(page.getByTestId("error")).toHaveCount(0);
	}
	for (const id of ["edges", "grid"] as const) {
		await studio.layer(id, true);
		await expect(page.getByTestId(`layer-canvas-${id}`)).toBeVisible();
		await expect(page.getByTestId("error")).toHaveCount(0);
	}
	// Walk the new controls once: Values tint and legend, Edges mode and amount.
	await studio.base("values");
	await studio.knob("values-tint", 1);
	await expect(page.getByTestId("legend")).toBeVisible();
	// The start amount 67 shows as 67, not as the nearest step of 5. Its card is open first.
	await studio.tool("edges");
	await expect(
		page.locator("[data-testid=edges-amount] input[type=range]"),
	).toHaveValue("67");
	await studio.knob("edges-mode", 1);
	await studio.knob("edges-amount", 50);
});

test("the icons and the share images are served", async ({ page }) => {
	for (const [path, type] of [
		["/favicon.ico", /icon/],
		["/favicon.svg", /svg/],
		["/og.png", /png/],
		["/og-square.png", /png/],
	] as const) {
		const res = await page.request.get(path);
		expect(res.ok(), `${path} status ${res.status()}`).toBe(true);
		expect(res.headers()["content-type"], path).toMatch(type);
	}
});
