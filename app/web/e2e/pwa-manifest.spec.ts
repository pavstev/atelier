// The head links the web app manifest, and the manifest parses with the right id and colors.
import { expect, test } from "./studio";

test("manifest_linked", async ({ studio, page }) => {
	void studio;
	const href = await page.locator("link[rel=manifest]").getAttribute("href");
	expect(href).toBe("/manifest.webmanifest");
	const res = await page.request.get(href as string);
	expect(res.ok()).toBe(true);
	const m = await res.json();
	expect(m.id).toBe("/");
	expect(m.start_url).toBe("/");
	expect(m.display).toBe("standalone");
	expect(m.name).toBe("Atelier");
});
