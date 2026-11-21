// A lazy chunk that fails to load (offline, or an old tab after a deploy) shows one short message and
// a Reload button in the tool card, not a blank page. On the built app the page first reloads once
// by itself (`pwa/reloadOnce.ts`); the chunk stays blocked, so the message shows after that.
import { expect, type Page, test } from "@playwright/test";
import { Studio } from "./studio";

test("test_a_blocked_tool_card_chunk_shows_the_message_and_a_reload_button", async ({
	page,
}) => {
	// on the built app the page reloads by itself and the photo list is back, but the card is not
	// open: the PREVIEW tests below cover that run
	test.skip(!!process.env.PREVIEW, "the built app reloads first");
	// the aborted request logs a console error of its own, so this test does not use the studio fixture
	await page.route("**/PanelCard*", (route) => route.abort());
	await page.goto("/");
	const studio = new Studio(page);
	await studio.openSynthetic(480, 640, "one.png");
	await page.getByTestId("tool-base").click();
	await expect(page.getByTestId("load-error")).toBeVisible({ timeout: 15_000 });
	await expect(page.getByTestId("load-reload")).toBeVisible();
	// the rest of the page still stands
	await expect(page.getByTestId("stage-bar")).toBeVisible();
});

// The `vite:preloadError` event fires only on the built app, never on the dev server. These two
// tests need it (`PREVIEW=1`). The service worker is blocked, so the page's own requests are the
// ones the test aborts or cuts off.
test.describe("the built app", () => {
	test.skip(!process.env.PREVIEW, "needs the built app");
	test.use({ serviceWorkers: "block" });

	const RELOAD_FLAG = "atelier-chunk-reload";
	const LOADS = "e2e-page-loads";

	// counts the loads of the page in sessionStorage, which a reload keeps
	async function countLoads(page: Page) {
		await page.addInitScript((key) => {
			sessionStorage.setItem(
				key,
				String(Number(sessionStorage.getItem(key) ?? "0") + 1),
			);
		}, LOADS);
	}

	const loads = (page: Page) =>
		page.evaluate((key) => Number(sessionStorage.getItem(key)), LOADS);

	test("test_a_failed_chunk_reloads_the_page_once_then_shows_the_message", async ({
		page,
	}) => {
		await countLoads(page);
		await page.route("**/PanelCard*", (route) => route.abort());
		await page.goto("/");
		const studio = new Studio(page);
		await studio.openSynthetic(480, 640, "one.png");
		expect(await loads(page)).toBe(1);

		await page.getByTestId("tool-base").click();
		// the guard reloads the page by itself
		await expect.poll(() => loads(page), { timeout: 15_000 }).toBe(2);
		expect(
			await page.evaluate(
				(k) => Number(sessionStorage.getItem(k)),
				RELOAD_FLAG,
			),
		).toBeGreaterThan(0);

		// the chunk is still blocked: a second failure inside the minute does not reload
		await page.getByTestId("tool-base").click();
		await expect(page.getByTestId("load-error")).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.getByTestId("load-reload")).toBeVisible();
		await page.waitForTimeout(1500);
		expect(await loads(page)).toBe(2);
		await expect(page.getByTestId("load-error")).toBeVisible();
	});

	test("test_a_failed_chunk_offline_does_not_reload_and_shows_the_message", async ({
		page,
		context,
	}) => {
		await countLoads(page);
		await page.goto("/");
		const studio = new Studio(page);
		await studio.openSynthetic(480, 640, "one.png");
		await context.setOffline(true);

		await page.getByTestId("tool-base").click();
		await expect(page.getByTestId("load-error")).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.getByTestId("load-reload")).toBeVisible();
		await page.waitForTimeout(1500);
		expect(await loads(page)).toBe(1);
		expect(
			await page.evaluate((k) => sessionStorage.getItem(k), RELOAD_FLAG),
		).toBeNull();
	});
});
