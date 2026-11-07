// The helpers every spec shares: the photo folder, a `studio` fixture with the page and the calls
// the specs make (open a photo, switch a layer, set a knob, wait for a draw, read a canvas). The
// fixture fails a test on any console error or page error. It also holds the page-side helpers the
// specs share: the saved lists, the photo database, a blocked save, a range setter, a bounding box
// and the canvas pixel reader.
import { join } from "node:path";
import {
	test as base,
	expect,
	type Locator,
	type Page,
} from "@playwright/test";
import {
	BASES,
	type Layout,
	type Look,
	type StageId,
} from "../src/features/tools/settings";
import { KEYS } from "../src/lib/storage";

const PHOTOS_DIR =
	process.env.PHOTOS_DIR ?? join(process.cwd(), "../../.agents/web-photos");

/** The storage keys of the app itself, so a spec never spells one out. */
export { KEYS };

/** The JSON saved under a storage key; `fallback` when there is none. */
export function stored(
	page: Page,
	key: string,
	fallback: unknown = null,
	// biome-ignore lint/suspicious/noExplicitAny: a spec reads whatever shape it expects
): Promise<any> {
	return page.evaluate(({ k, f }) => JSON.parse(localStorage.getItem(k) ?? f), {
		k: key,
		f: JSON.stringify(fallback),
	});
}

/** Saves JSON under a storage key. */
export function store(page: Page, key: string, value: unknown) {
	return page.evaluate(({ k, v }) => localStorage.setItem(k, v), {
		k: key,
		v: JSON.stringify(value),
	});
}

/** The kept photo list (the rows the page saves under `KEYS.docs`); empty when none is saved. */
export function keptDocs(page: Page): Promise<{ name: string }[]> {
	return stored(page, KEYS.docs, []);
}

/** The names in the kept photo list, sorted. */
export async function docNames(page: Page): Promise<string[]> {
	return (await keptDocs(page)).map((d) => d.name).sort();
}

/**
 * Makes saving one localStorage key throw, like a full disk. It patches the current document, so
 * call it after the page has loaded and before the action that saves.
 */
export function blockSetItem(page: Page, key: string) {
	return page.evaluate((blocked) => {
		const real = Storage.prototype.setItem;
		Storage.prototype.setItem = function (k: string, value: string) {
			if (k === blocked) throw new Error("QuotaExceededError");
			return real.call(this, k, value);
		};
	}, key);
}

/**
 * Runs `use` in the page on the object store of the photo files, opened the way the app opens its
 * database. It resolves with the result of the request `use` returns, when the transaction ends.
 * `use` runs in the page, so it can use nothing from the spec. It is sent as text, which also
 * works under the Content-Security-Policy of the built app.
 */
export function photosDb<T = undefined>(
	page: Page,
	mode: IDBTransactionMode,
	use: (photos: IDBObjectStore) => IDBRequest<T> | undefined,
): Promise<T> {
	return page.evaluate<T>(`new Promise((ok, bad) => {
		const open = indexedDB.open("atelier", 2);
		open.onerror = () => bad(open.error);
		open.onsuccess = () => {
			const tx = open.result.transaction("photos", ${JSON.stringify(mode)});
			const last = (${String(use)})(tx.objectStore("photos"));
			tx.oncomplete = () => ok(last?.result);
			tx.onerror = () => bad(tx.error);
		};
	})`);
}

/** The ids of the stored photo files, sorted. */
export async function photoFileIds(page: Page): Promise<string[]> {
	const keys = await photosDb(page, "readonly", (photos) =>
		photos.getAllKeys(),
	);
	return keys.map(String).sort();
}

/** Sets an `<input type=range>` the way a drag would: the native setter, then input and change. */
export function setRange(range: Locator, value: string | number) {
	return range.evaluate((el, v) => {
		const input = el as HTMLInputElement;
		const set = Object.getOwnPropertyDescriptor(
			HTMLInputElement.prototype,
			"value",
		)?.set;
		set?.call(input, String(v));
		input.dispatchEvent(new Event("input", { bubbles: true }));
		input.dispatchEvent(new Event("change", { bubbles: true }));
	}, value);
}

/** The bounding box of an element (a test id); throws when it is not on the page. */
export async function box(page: Page, testid: string) {
	const b = await page.getByTestId(testid).boundingBox();
	if (!b) throw new Error(`no box for ${testid}`);
	return b;
}

/**
 * Reads a canvas (a test id) in the page and returns what `read` makes of its pixels. `read` runs
 * in the page, so it can use nothing from the spec, and only its small result comes back (a large
 * canvas is megabytes of pixels). It is sent as text, which also works under the CSP of the built app.
 */
export function readCanvas<T>(
	page: Page,
	testid: string,
	read: (img: ImageData, canvas: HTMLCanvasElement) => T,
): Promise<T> {
	return page.evaluate<T>(`((read, id) => {
		const c = document.querySelector("[data-testid=" + id + "]");
		if (!c) throw new Error("no canvas " + id);
		const img = c.getContext("2d")?.getImageData(0, 0, c.width, c.height);
		if (!img) throw new Error("no pixels");
		return read(img, c);
	})(${String(read)}, ${JSON.stringify(testid)})`);
}

/** The photo the layer specs draw. */
export const MAIN_PHOTO = join(PHOTOS_DIR, "mona-lisa-2400.jpg");

/** The stacked layers: the base (Values or Shapes), Edges and Grid. */
export type LayerId = StageId;
export type BaseKind = Look["base"]["kind"];

type Stats = { w: number; h: number; hash: number; min: number; max: number };

/** The tool whose card holds a control: Edges, Grid, or the Base card for the rest. */
function toolOf(testid: string): LayerId {
	const id = testid.replace(/^(layer|opacity)-/, "");
	if (id.startsWith("edges")) return "edges";
	if (id.startsWith("grid")) return "grid";
	return "base";
}

export class Studio {
	constructor(readonly page: Page) {}

	/** The saved look. The page saves 150 ms after the last change, so this waits for that. */
	async saved(): Promise<Look> {
		await this.page.waitForTimeout(400);
		return stored(this.page, KEYS.state);
	}

	/** The saved layout (the panel and its width), saved like the look. */
	async layout(): Promise<Layout> {
		await this.page.waitForTimeout(400);
		return stored(this.page, KEYS.layout);
	}

	/** The stamp of the last finished draw ("" before the first). */
	async stamp() {
		const facts = this.page.locator("[data-testid=facts]");
		if ((await facts.count()) === 0) return "";
		return (await facts.getAttribute("data-stamp", { timeout: 2000 })) ?? "";
	}

	/** Waits until a draw newer than `prev` has finished. */
	async waitDraw(prev = "") {
		await this.page.waitForFunction(
			(p) => {
				const el = document.querySelector<HTMLElement>("[data-testid=facts]");
				const s = el?.dataset.stamp ?? "";
				return s !== "" && s !== p;
			},
			prev,
			{ timeout: 90_000 },
		);
	}

	/** Opens a photo and waits until the page shows it. */
	async open(path: string) {
		const prev = await this.stamp();
		const name = path.split("/").pop() ?? "";
		await this.page.locator("[data-testid=file]").setInputFiles(path);
		await this.page
			.locator("[data-testid=facts] p", { hasText: name })
			.waitFor({ timeout: 60_000 });
		await this.waitDraw(prev);
	}

	/** Runs `act` and waits for the next finished draw. */
	async drawn(act: () => Promise<unknown>) {
		const prev = await this.stamp();
		await act();
		await this.waitDraw(prev);
	}

	/** Opens the card of a tool (its bar button) and waits for it; a card already open stays. */
	async tool(id: LayerId) {
		// on a phone a sheet covers the bar, so an open one is closed with Esc first
		const other = this.page.locator(
			`[data-testid=tool-popup]:not([data-tool=${id}])`,
		);
		if (
			(this.page.viewportSize()?.width ?? 1280) < 768 &&
			(await other.count())
		) {
			await this.page.keyboard.press("Escape");
			await other.waitFor({ state: "detached" });
		}
		const card = this.page.locator(`[data-testid=tool-popup][data-tool=${id}]`);
		if ((await card.count()) === 0)
			await this.page.locator(`[data-testid=tool-${id}]`).click();
		await card.waitFor();
		// A sheet slides in by scrolling. Playwright's own scroll-into-view during that slide would
		// snap it shut, so wait until it rests on the bottom edge of the window.
		const height = this.page.viewportSize()?.height ?? 900;
		if ((this.page.viewportSize()?.width ?? 1280) < 768)
			await expect
				.poll(async () => {
					const box = await card.boundingBox();
					return box ? Math.round(box.y + box.height) : -1;
				})
				.toBe(height);
	}

	/** Picks an item of the zoom menu. */
	async zoom(item: "fit" | "actual" | "200" | "real" | "unlock") {
		await this.page.locator("[data-testid=zoom-menu]").click();
		await this.page.locator(`[data-testid=zoom-${item}]`).click();
	}

	/** Is the switch of this test id on? Its card is opened first. */
	async isOn(testid: string) {
		await this.tool(toolOf(testid));
		return this.page.locator(`[data-testid=${testid}] input`).isChecked();
	}

	/** Turns Edges or Grid on or off. On waits for its picture. Does nothing if it is already so. */
	async layer(id: "edges" | "grid", on: boolean) {
		if ((await this.isOn(`layer-${id}`)) === on) return;
		const click = () => this.page.locator(`[data-testid=layer-${id}]`).click();
		if (on) {
			await this.drawn(click);
			await this.page
				.locator(`[data-testid=layer-canvas-${id}]`)
				.waitFor({ timeout: 30_000 });
		} else {
			await click();
			await this.page
				.locator(`[data-testid=layer-canvas-${id}]`)
				.waitFor({ state: "detached", timeout: 10_000 });
		}
	}

	/** Picks the base: Photo and Paper draw nothing, Values and Shapes wait for their picture. */
	async base(kind: BaseKind) {
		await this.tool("base");
		const pick = () =>
			this.page
				.locator("[data-testid=base]")
				.getByRole("radio")
				.nth(BASES.findIndex((b) => b.id === kind))
				.click();
		const canvas = this.page.locator("[data-testid=layer-canvas-base]");
		if (kind === "photo" || kind === "paper") {
			await pick();
			await canvas.waitFor({ state: "detached", timeout: 10_000 });
			return;
		}
		await this.drawn(pick);
		await canvas.waitFor({ timeout: 30_000 });
	}

	/**
	 * Sets a knob. A slider gets the value itself. A row of buttons or a list gets the index of
	 * its option.
	 * Waits for the layer to draw again.
	 */
	async knob(id: string, value: string | number) {
		await this.tool(toolOf(id));
		const root = this.page.locator(`[data-testid=${id}]`);
		const range = root.locator("input[type=range]");
		if ((await range.count()) > 0) {
			await this.drawn(() => setRange(range, value));
			return;
		}
		// a row of buttons: click the one at the index
		const radios = root.getByRole("radio");
		if ((await radios.count()) > 0) {
			await this.drawn(() => radios.nth(Number(value)).click());
			return;
		}
		// a list: open it and pick the option
		await this.drawn(async () => {
			await root.locator("button").first().click();
			await this.page.getByRole("option").nth(Number(value)).click();
		});
	}

	/** Sets an opacity slider (10 to 100). It does not draw again, so it does not wait. */
	async opacity(id: LayerId, value: number) {
		await this.tool(id);
		await setRange(
			this.page.locator(`[data-testid=opacity-${id}] input[type=range]`),
			value,
		);
	}

	/** A hash and the spread of the pixels of a canvas (a test id). */
	stats(testid: string): Promise<Stats> {
		return readCanvas(this.page, testid, (img, c) => {
			const d = img.data;
			let hash = 0;
			let min = 255;
			let max = 0;
			for (let i = 0; i < d.length; i += 4) {
				hash =
					(hash * 31 + d[i] + 7 * d[i + 1] + 13 * d[i + 2] + 5 * d[i + 3]) | 0;
				min = Math.min(min, d[i], d[i + 3]);
				max = Math.max(max, d[i], d[i + 3]);
			}
			return { w: c.width, h: c.height, hash, min, max };
		});
	}

	/**
	 * Draws a synthetic photo in the page (no real photo, no random numbers) and opens it.
	 * The scene is the same at any size.
	 */
	async openSynthetic(w = 480, h = 640, name = "synthetic.png") {
		const prev = await this.stamp();
		await this.page.evaluate(
			async ([w, h, name]) => {
				const c = document.createElement("canvas");
				c.width = Number(w);
				c.height = Number(h);
				const g = c.getContext("2d");
				if (!g) throw new Error("no 2d canvas");
				g.scale(c.width / 480, c.height / 640);
				const sky = g.createLinearGradient(0, 0, 0, 640);
				sky.addColorStop(0, "#26406b");
				sky.addColorStop(0.55, "#d9a05b");
				sky.addColorStop(1, "#3b2a1c");
				g.fillStyle = sky;
				g.fillRect(0, 0, 480, 640);
				g.fillStyle = "#f6e7b4";
				g.beginPath();
				g.arc(340, 150, 55, 0, Math.PI * 2);
				g.fill();
				g.fillStyle = "#2d4a2b";
				g.beginPath();
				g.moveTo(0, 430);
				g.bezierCurveTo(120, 330, 260, 460, 480, 380);
				g.lineTo(480, 640);
				g.lineTo(0, 640);
				g.fill();
				g.fillStyle = "#c98f6a";
				g.beginPath();
				g.ellipse(190, 340, 70, 90, 0, 0, Math.PI * 2);
				g.fill();
				g.fillStyle = "#1c1410";
				g.beginPath();
				g.ellipse(190, 290, 78, 52, 0, Math.PI, Math.PI * 2);
				g.fill();
				g.fillStyle = "#7a3b2e";
				g.fillRect(110, 440, 160, 150);
				g.strokeStyle = "#101010";
				g.lineWidth = 6;
				g.strokeRect(300, 420, 120, 160);
				for (let i = 0; i < 40; i++) {
					g.fillStyle = `rgba(255,255,255,${0.04 + (i % 5) * 0.01})`;
					g.fillRect((i * 37) % 480, (i * 53) % 640, 30 + (i % 7) * 6, 3);
				}
				const blob = await new Promise<Blob>((ok) =>
					c.toBlob((b) => ok(b as Blob), "image/png"),
				);
				const input =
					document.querySelector<HTMLInputElement>("input[type=file]");
				if (!input) throw new Error("no file input");
				const dt = new DataTransfer();
				// the name goes after the picture's last chunk (a decoder ignores it), so photos with
				// other names are other bytes, and the pixels stay the same
				dt.items.add(
					new File([blob, `|${name}`], String(name), { type: "image/png" }),
				);
				input.files = dt.files;
				input.dispatchEvent(new Event("change", { bubbles: true }));
			},
			[w, h, name] as const,
		);
		await this.page
			.locator("[data-testid=facts] p", { hasText: name })
			.waitFor({ timeout: 30_000 });
		await this.waitDraw(prev);
	}

	/** The text of the picture facts (name, size). */
	facts() {
		// biome-ignore lint/performance/useDomNodeTextContent: Playwright locator method, not the DOM property
		return this.page.locator("[data-testid=facts]").innerText();
	}
}

export const test = base.extend<{ studio: Studio }>({
	studio: async ({ page }, use) => {
		const problems: string[] = [];
		page.on("console", (m) => {
			if (m.type() === "error") problems.push(`console: ${m.text()}`);
		});
		page.on("pageerror", (e) => problems.push(`page: ${e.message}`));
		await page.goto("/");
		await use(new Studio(page));
		expect(problems).toEqual([]);
	},
});

export { expect };
