// The built app works with no network: the worker controls the page, and after an offline reload a photo still draws.
// Run with `PREVIEW=1` (the built app with the Cloudflare headers).
import { expect, MAIN_PHOTO, test } from "./studio";

test.use({ serviceWorkers: "allow" });

test("offline_reload_draws", async ({ studio, page, context }) => {
	test.skip(process.env.PREVIEW !== "1", "needs the built app (PREVIEW=1)");
	// the first claim reloads the page once, so wait for control (the wait survives a reload)
	await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, {
		timeout: 30_000,
	});
	await page.waitForLoadState("load");
	await context.setOffline(true);
	await page.reload();
	await studio.open(MAIN_PHOTO);
	await studio.layer("grid", true);
	expect((await studio.stats("layer-canvas-grid")).max).toBeGreaterThan(0);
	await context.setOffline(false);
});
