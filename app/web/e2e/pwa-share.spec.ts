// A photo shared to the installed app (POST /share, as the Android share sheet does) lands on "/"
// as one more photo. `vite preview` has no /share route, so the worker answers it.
// Run with `PREVIEW=1` (the built app with the Cloudflare headers).
import { readFileSync } from "node:fs";
import { expect, MAIN_PHOTO, test } from "./studio";

test.use({ serviceWorkers: "allow" });

test("share_post_adds", async ({ studio, page }) => {
	void studio;
	test.skip(process.env.PREVIEW !== "1", "needs the built app (PREVIEW=1)");
	// the first claim reloads the page once (controllerchange); wait for it to settle
	await expect
		.poll(() =>
			page
				.evaluate(() => !!navigator.serviceWorker.controller)
				.catch(() => false),
		)
		.toBe(true);
	await page.locator("[data-testid=file]").waitFor({ state: "attached" });
	const count = async () => {
		const facts = page.locator("[data-testid=facts]");
		if ((await facts.count()) === 0) return 0;
		return Number((await facts.getAttribute("data-photos")) ?? 0);
	};
	const before = await count();
	const b64 = readFileSync(MAIN_PHOTO).toString("base64");
	await Promise.all([
		page.waitForURL(/\/\?shared=1|\/$/),
		page.evaluate((data) => {
			const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
			const dt = new DataTransfer();
			dt.items.add(new File([bytes], "shared.jpg", { type: "image/jpeg" }));
			const form = document.createElement("form");
			form.method = "POST";
			form.action = "/share";
			form.enctype = "multipart/form-data";
			const input = document.createElement("input");
			input.type = "file";
			input.name = "photos";
			input.files = dt.files;
			form.append(input);
			document.body.append(form);
			form.submit();
		}, b64),
	]);
	await expect.poll(count, { timeout: 60_000 }).toBe(before + 1);
	expect(new URL(page.url()).search).toBe("");
});
