// An installed app with Window Controls Overlay draws its own translucent title bar: the logo and the
// photo list buttons sit in it, the side panel starts under it, and the buttons go back into the panel
// when the native title bar is shown again. Headless Chromium has no installed app and no way to set
// the display mode, so the test stands in for it: `window.__wco(true|false)` makes the page's
// `matchMedia` report the mode, fires the change event and switches the `display-mode` media rules of
// the style sheets on or off. The env() title bar values are then missing, so the CSS falls back to
// a 2.5 rem bar.
import type { Page } from "@playwright/test";
import { box, expect, test } from "./studio";

const STAND_IN = () => {
	const orig = window.matchMedia.bind(window);
	const WCO = "(display-mode: window-controls-overlay)";
	const lists: Set<(e: unknown) => void>[] = [];
	let on = false;
	window.matchMedia = (q: string) => {
		if (!q.includes(WCO)) return orig(q);
		const listeners = new Set<(e: unknown) => void>();
		lists.push(listeners);
		return {
			media: q,
			get matches() {
				return on && orig(q.replace(WCO, "all")).matches;
			},
			addEventListener: (_: string, f: (e: unknown) => void) =>
				listeners.add(f),
			removeEventListener: (_: string, f: (e: unknown) => void) =>
				listeners.delete(f),
		} as unknown as MediaQueryList;
	};
	const rules = () =>
		[...document.styleSheets].flatMap((sheet) =>
			[...sheet.cssRules].filter(
				(r): r is CSSMediaRule =>
					r instanceof CSSMediaRule &&
					r.media.mediaText.includes("display-mode"),
			),
		);
	// the rules are found once: while they are on their media text is "all"
	const found = new Map<CSSMediaRule, string>();
	(window as unknown as Record<string, unknown>).__wco = (v: boolean) => {
		on = v;
		if (found.size === 0)
			for (const r of rules()) found.set(r, r.media.mediaText);
		for (const [r, text] of found) r.media.mediaText = v ? "all" : text;
		for (const set of lists) for (const f of set) f({});
	};
};

async function overlay(page: Page, on: boolean) {
	await page.evaluate((v) => {
		(window as unknown as { __wco: (v: boolean) => void }).__wco(v);
	}, on);
}

const BUTTONS = [
	"photo-add",
	"photo-search-toggle",
	"photo-sort",
	"photo-layout",
];

test("test_the_photo_buttons_move_into_the_title_bar_and_back", async ({
	studio,
}) => {
	const { page } = studio;
	await page.addInitScript(STAND_IN);
	await page.setViewportSize({ width: 1200, height: 800 });
	await page.reload();
	// a normal tab: the buttons are in the panel and the slot is hidden
	await expect(page.getByTestId("titlebar-tools")).toBeHidden();
	for (const id of BUTTONS)
		await expect(page.getByTestId("files").getByTestId(id)).toBeVisible();

	await overlay(page, true);
	const slot = page.getByTestId("titlebar-tools");
	for (const id of BUTTONS) await expect(slot.getByTestId(id)).toBeVisible();
	await expect(page.getByTestId("files").getByTestId("photo-add")).toHaveCount(
		0,
	);

	// one row in the bar: level with the logo, inside the bar height, the panel under it
	const logo = await box(page, "logo");
	const files = await box(page, "files");
	const add = await box(page, "photo-add");
	const layout = await box(page, "photo-layout");
	expect(add.y + add.height / 2).toBeCloseTo(logo.y + logo.height / 2, 0);
	expect(add.x).toBeGreaterThan(logo.x + logo.width);
	expect(layout.y + layout.height).toBeLessThanOrEqual(files.y);
	expect(files.y).toBeGreaterThan(logo.y + logo.height);
	// the last button ends at the panel's right edge
	expect(files.x + files.width - (layout.x + layout.width)).toBeLessThan(20);

	// the buttons still work from the bar
	await page.getByTestId("photo-search-toggle").click();
	await expect(page.getByTestId("photo-search")).toBeVisible();

	// the native title bar shown again: the buttons go back into the panel
	await overlay(page, false);
	for (const id of BUTTONS)
		await expect(page.getByTestId("files").getByTestId(id)).toBeVisible();
	await expect(page.getByTestId("titlebar-tools")).toBeHidden();
});
