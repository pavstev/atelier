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
	await studio.layer("grid", true);
	await expect(page.getByTestId("layer-canvas-grid")).toBeVisible();
	await expect(page.getByTestId("error")).toHaveCount(0);
	// Walk the controls once: the Values legend and the Grid step.
	await studio.base("values");
	await expect(page.getByTestId("legend")).toBeVisible();
	await studio.knob("grid-step", 7);
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
