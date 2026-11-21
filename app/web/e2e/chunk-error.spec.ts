// A lazy chunk that fails to load (offline, or an old tab after a deploy) shows one short message and
// a Reload button in the tool card, not a blank page. On the built app the page first reloads once
// by itself (`pwa/reloadOnce.ts`); the chunk stays blocked, so the message shows after that.
import { expect, test } from "@playwright/test";
import { Studio } from "./studio";

test("test_a_blocked_tool_card_chunk_shows_the_message_and_a_reload_button", async ({
	page,
}) => {
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
