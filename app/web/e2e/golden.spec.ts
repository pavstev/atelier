// The golden pictures: a synthetic photo (drawn in the page, not a real photo) goes through every
// layer and every preset or mode. Each layer picture is put on white, scaled to 128 px on the
// long side and compared with e2e/golden/<layer>-<option>.png: the same size, and a mean
// difference of at most 3.0 (the rule of `cargo xtask refs`). A missing golden fails.
// `mise run web:golden:bless` writes them again; say in the commit why they moved.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { type BaseKind, expect, type LayerId, test } from "./studio";

const GOLDEN_DIR = join(process.cwd(), "e2e/golden");
const BLESS = process.env.GOLDEN_BLESS === "1";
const MAX_MEAN_DIFF = 3.0;
const GOLDEN_LONG_SIDE = 128;

/** The start value of every knob the cases touch. Setting a knob to its start value draws nothing. */
const START: Record<string, number> = {
	"values-preset": 1,
	"values-tint": 0,
	"shapes-step": 3,
	"edges-mode": 0,
	"edges-amount": 67,
	"grid-mode": 2,
};

type Step = { name: string; set: [string, number][] };

/** Every case: the layer that is drawn, how to turn it on, and the pictures to compare. */
const CASES: {
	layer: LayerId;
	on: BaseKind | "edges" | "grid";
	steps: Step[];
}[] = [
	{
		layer: "base",
		on: "values",
		steps: [
			...[0, 1, 2, 3, 4, 5].map((i) => ({
				name: `values-${i}`,
				set: [["values-preset", i]] as [string, number][],
			})),
			// Tint 0 is the start; the preset goes back to the start value first.
			{ name: "values-tint-0", set: [["values-preset", 1]] },
			{ name: "values-tint-1", set: [["values-tint", 1]] },
		],
	},
	{
		layer: "base",
		on: "shapes",
		steps: [0, 1, 2, 3].map((i) => ({
			name: `shapes-step-${i}`,
			set: [["shapes-step", i]] as [string, number][],
		})),
	},
	{
		layer: "edges",
		on: "edges",
		steps: [
			...[0, 1, 2].map((m) => ({
				name: `edges-mode-${m}`,
				set: [
					["edges-mode", m],
					["edges-amount", 67],
				] as [string, number][],
			})),
			...[0, 33, 100].map((a) => ({
				name: `edges-amount-${a}`,
				set: [
					["edges-mode", 0],
					["edges-amount", a],
				] as [string, number][],
			})),
		],
	},
	{
		layer: "grid",
		on: "grid",
		steps: [0, 1, 2].map((i) => ({
			name: `grid-${i}`,
			set: [["grid-mode", i]] as [string, number][],
		})),
	},
];

/** The layer canvas on white, scaled to the golden size, as PNG bytes. */
function snapshot(page: Page, layer: LayerId): Promise<string> {
	return page.evaluate(
		([id, long]) => {
			const src = document.querySelector<HTMLCanvasElement>(
				`[data-testid=layer-canvas-${id}]`,
			);
			if (!src) throw new Error("no canvas");
			const r = Number(long) / Math.max(src.width, src.height);
			const c = document.createElement("canvas");
			c.width = Math.max(1, Math.round(src.width * r));
			c.height = Math.max(1, Math.round(src.height * r));
			const g = c.getContext("2d");
			if (!g) throw new Error("no 2d canvas");
			g.fillStyle = "#fff";
			g.fillRect(0, 0, c.width, c.height);
			g.imageSmoothingQuality = "high";
			g.drawImage(src, 0, 0, c.width, c.height);
			return c.toDataURL("image/png").split(",")[1];
		},
		[layer, GOLDEN_LONG_SIDE] as const,
	);
}

/** The mean difference of two PNGs of the same size, or the sizes when they differ. */
function meanDiff(page: Page, a: string, b: string) {
	return page.evaluate(
		async ([x, y]) => {
			const load = async (b64: string) => {
				const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
				const bmp = await createImageBitmap(new Blob([bytes]));
				const c = new OffscreenCanvas(bmp.width, bmp.height);
				const g = c.getContext("2d");
				if (!g) throw new Error("no 2d canvas");
				g.drawImage(bmp, 0, 0);
				return g.getImageData(0, 0, bmp.width, bmp.height);
			};
			const [p, q] = [await load(x), await load(y)];
			if (p.width !== q.width || p.height !== q.height) {
				return {
					same: false,
					mean: 255,
					size: `${p.width}x${p.height} vs ${q.width}x${q.height}`,
				};
			}
			let sum = 0;
			for (let i = 0; i < p.data.length; i++) {
				if (i % 4 !== 3) sum += Math.abs(p.data[i] - q.data[i]);
			}
			return { same: true, mean: sum / ((p.data.length / 4) * 3), size: "" };
		},
		[a, b] as const,
	);
}

async function check(page: Page, layer: LayerId, name: string) {
	const actual = await snapshot(page, layer);
	const file = join(GOLDEN_DIR, `${name}.png`);
	if (BLESS) {
		mkdirSync(GOLDEN_DIR, { recursive: true });
		writeFileSync(file, Buffer.from(actual, "base64"));
		return;
	}
	expect(
		existsSync(file),
		`golden ${name}.png is missing (mise run web:golden:bless)`,
	).toBe(true);
	const d = await meanDiff(page, actual, readFileSync(file).toString("base64"));
	expect(d.same, `${name}: size ${d.size}`).toBe(true);
	expect(d.mean, `${name}: mean difference`).toBeLessThanOrEqual(MAX_MEAN_DIFF);
}

for (const c of CASES) {
	test(`golden pictures: ${c.steps[0].name.replace(/-\d+$/, "")}`, async ({
		studio,
	}) => {
		const { page } = studio;
		await studio.openSynthetic();
		if (c.on === "edges" || c.on === "grid") await studio.layer(c.on, true);
		else await studio.base(c.on);
		const now = { ...START };
		for (const step of c.steps) {
			for (const [knob, value] of step.set) {
				if (now[knob] === value) continue;
				await studio.knob(knob, value);
				now[knob] = value;
			}
			await page.waitForTimeout(300);
			await expect(page.getByTestId("error")).toHaveCount(0);
			await check(page, c.layer, step.name);
		}
	});
}
