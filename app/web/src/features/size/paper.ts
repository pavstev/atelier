// The Size tool's numbers: the table of papers and canvases, the cm of a choice, the crop rectangle of a
// photo for a paper shape, the preview rectangles, the one-line fact and the cleaning of a save. No React
// and no DOM, so a node test can load it. The choice is kept per photo (`useSize.ts`).
import { isRecord } from "../../lib/clean.ts";

/** One paper or canvas, in cm, short side first (portrait). */
export type Paper = {
	id: string;
	label: string;
	/** The short side in cm. */
	w: number;
	/** The long side in cm. */
	h: number;
	kind: "paper" | "canvas";
};

/** The chips of the card, in order: the A sizes, then the canvases (30 x 40 is the owner's, so it comes first). */
export const PAPERS: readonly Paper[] = [
	{ id: "a5", label: "A5", w: 14.8, h: 21, kind: "paper" },
	{ id: "a4", label: "A4", w: 21, h: 29.7, kind: "paper" },
	{ id: "a3", label: "A3", w: 29.7, h: 42, kind: "paper" },
	{ id: "a2", label: "A2", w: 42, h: 59.4, kind: "paper" },
	{ id: "30x40", label: "30 × 40", w: 30, h: 40, kind: "canvas" },
	{ id: "18x24", label: "18 × 24", w: 18, h: 24, kind: "canvas" },
	{ id: "24x30", label: "24 × 30", w: 24, h: 30, kind: "canvas" },
	{ id: "40x50", label: "40 × 50", w: 40, h: 50, kind: "canvas" },
	{ id: "50x70", label: "50 × 70", w: 50, h: 70, kind: "canvas" },
];

/** The id of the Custom chip. */
export const CUSTOM = "custom";

/** The least and the most a paper side can be, in cm. */
export const CM_MIN = 1;
export const CM_MAX = 300;

/** Portrait, landscape, or the shape the photo has. */
export type Orient = "auto" | "portrait" | "landscape";
export const ORIENTS: readonly Orient[] = ["auto", "portrait", "landscape"];

/** What is kept for one photo. `w` and `h` are the Custom sides (kept even when a preset is on). */
export type Choice = {
	/** A preset id from `PAPERS`, or `CUSTOM`. */
	paper: string;
	w: number;
	h: number;
	orient: Orient;
	/** Fit to paper: the photo is cut to the paper shape. False is Whole photo. */
	fit: boolean;
};

export const SIZE_START: Choice = {
	paper: "30x40",
	w: 30,
	h: 40,
	orient: "auto",
	fit: false,
};

/** A side in cm kept between `CM_MIN` and `CM_MAX`; a number that is not finite gives `fallback`. */
export function clampCm(n: unknown, fallback = CM_MIN): number {
	const x = typeof n === "number" && Number.isFinite(n) ? n : fallback;
	return Math.min(CM_MAX, Math.max(CM_MIN, x));
}

const isStart = (c: Choice) =>
	c.paper === SIZE_START.paper &&
	c.w === SIZE_START.w &&
	c.h === SIZE_START.h &&
	c.orient === SIZE_START.orient &&
	c.fit === SIZE_START.fit;

/** True when `c` is the start choice (nothing to keep for the photo). */
export const isStartChoice = isStart;

/** The preset with this id, or undefined. */
export const paperOf = (id: string): Paper | undefined =>
	PAPERS.find((p) => p.id === id);

/** The paper in cm, width and height, for a photo of `photoW` x `photoH` px. A preset follows the
 * orientation (Like photo: landscape for a wide photo, else portrait); Custom is as typed. */
export function paperCm(
	c: Choice,
	photoW: number,
	photoH: number,
): { w: number; h: number } {
	const preset = c.paper === CUSTOM ? undefined : paperOf(c.paper);
	// an empty or bad Custom box (0 or less) gives the start side, so typing never flashes a sliver
	if (!preset)
		return {
			w: c.w > 0 ? clampCm(c.w) : SIZE_START.w,
			h: c.h > 0 ? clampCm(c.h) : SIZE_START.h,
		};
	const wide =
		c.orient === "landscape" || (c.orient === "auto" && photoW > photoH);
	return wide ? { w: preset.h, h: preset.w } : { w: preset.w, h: preset.h };
}

/** A rectangle in px. */
export type Rect = { x: number; y: number; w: number; h: number };

/**
 * The part of a `photoW` x `photoH` photo that has the shape `ratio` (width over height), as large as
 * it can be. `at` is where it sits: 0.5 is the middle, 0 the start, 1 the end of each axis. Whole
 * pixels, never empty, always inside the photo.
 */
export function cropRect(
	photoW: number,
	photoH: number,
	ratio: number,
	at: { x: number; y: number } = { x: 0.5, y: 0.5 },
): Rect {
	const pw = Math.max(1, Math.round(photoW));
	const ph = Math.max(1, Math.round(photoH));
	const r = Number.isFinite(ratio) && ratio > 0 ? ratio : pw / ph;
	let w = pw;
	let h = ph;
	if (pw / ph > r) w = Math.min(pw, Math.max(1, Math.round(ph * r)));
	else h = Math.min(ph, Math.max(1, Math.round(pw / r)));
	const share = (v: number) =>
		Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0.5));
	return {
		x: Math.round((pw - w) * share(at.x)),
		y: Math.round((ph - h) * share(at.y)),
		w,
		h,
	};
}

/** The crop of a photo for this choice, or null when the photo is shown whole (Whole photo, or the
 * photo already has the paper shape). */
export function cropFor(
	c: Choice,
	photoW: number,
	photoH: number,
): Rect | null {
	if (!c.fit) return null;
	const cm = paperCm(c, photoW, photoH);
	const r = cropRect(photoW, photoH, cm.w / cm.h);
	return r.w === photoW && r.h === photoH ? null : r;
}

/** The width in cm the picture on show has on the paper: the paper width when it is cut to the paper,
 * else the photo with its long side as long as the paper's long side. */
export function shownWidthCm(
	c: Choice,
	photoW: number,
	photoH: number,
): number {
	const cm = paperCm(c, photoW, photoH);
	if (c.fit) return cm.w;
	const long = Math.max(cm.w, cm.h);
	return (photoW / Math.max(photoW, photoH, 1)) * long;
}

/** The side of one Grid cell in cm: the long side of the paper over the cells across it. */
export const cellCm = (paperLongCm: number, cells: number): number =>
	paperLongCm / Math.max(1, cells);

/** A number of cm for the eye: one decimal at most, no trailing zero (21, 29.7, 6.7). */
export const fmtCm = (n: number): string => String(Math.round(n * 10) / 10);

/**
 * The one line under the chips. It names the paper, and the Grid cell when a Grid with cells is on
 * (`cells` is null otherwise). With Whole photo the cell is "about", because the photo and the paper
 * need not have the same shape.
 */
export function factText(
	c: Choice,
	photoW: number,
	photoH: number,
	cells: number | null,
): string {
	const cm = paperCm(c, photoW, photoH);
	const head = `${fmtCm(cm.w)} × ${fmtCm(cm.h)} cm.`;
	if (cells === null) return head;
	const cell = fmtCm(cellCm(Math.max(cm.w, cm.h), cells));
	return `${head} Grid cell: ${c.fit ? "" : "about "}${cell} cm.`;
}

/**
 * The shapes of the little picture at the top of the card, inside a `boxW` x `boxH` box. The photo
 * and the paper are both centered. Fit to paper: the photo at its own shape, the paper cut out of it
 * (the part that stays). Whole photo: the two with the same long side (the photo is not cut).
 */
export function previewRects(
	c: Choice,
	photoW: number,
	photoH: number,
	boxW: number,
	boxH: number,
): { photo: Rect; paper: Rect } {
	const cm = paperCm(c, photoW, photoH);
	const ratio = cm.w / cm.h;
	const side = (r: number) => (r >= 1 ? { w: 1, h: 1 / r } : { w: r, h: 1 });
	let photo: { w: number; h: number };
	let paper: { w: number; h: number };
	if (c.fit) {
		const crop = cropRect(photoW, photoH, ratio);
		photo = { w: photoW, h: photoH };
		paper = { w: crop.w, h: crop.h };
	} else {
		photo = side(photoW / Math.max(1, photoH));
		paper = side(ratio);
	}
	const scale = Math.min(
		boxW / Math.max(photo.w, paper.w),
		boxH / Math.max(photo.h, paper.h),
	);
	const place = (s: { w: number; h: number }): Rect => ({
		x: (boxW - s.w * scale) / 2,
		y: (boxH - s.h * scale) / 2,
		w: s.w * scale,
		h: s.h * scale,
	});
	return { photo: place(photo), paper: place(paper) };
}

/** One choice read back from a save; any wrong part gives its start value. */
export function cleanChoice(raw: unknown): Choice {
	const r = isRecord(raw) ? raw : {};
	const paper =
		typeof r.paper === "string" &&
		(r.paper === CUSTOM || paperOf(r.paper) !== undefined)
			? r.paper
			: SIZE_START.paper;
	return {
		paper,
		// a 0 or negative side (an empty Custom box) takes the start side, like `paperCm` does
		w: clampCm(
			typeof r.w === "number" && r.w <= 0 ? undefined : r.w,
			SIZE_START.w,
		),
		h: clampCm(
			typeof r.h === "number" && r.h <= 0 ? undefined : r.h,
			SIZE_START.h,
		),
		orient: ORIENTS.find((o) => o === r.orient) ?? SIZE_START.orient,
		fit: r.fit === true,
	};
}

/** The most photos a save keeps a choice for (the newest). */
const MAX_KEPT = 300;

/** The saved map photo id -> choice, cleaned: a bad save gives an empty map, a bad entry is dropped,
 * and a start choice is not kept. */
export function cleanSizes(raw: unknown): Record<string, Choice> {
	const out: Record<string, Choice> = {};
	if (!isRecord(raw)) return out;
	for (const [id, v] of Object.entries(raw).slice(-MAX_KEPT)) {
		if (!isRecord(v)) continue;
		const c = cleanChoice(v);
		if (!isStart(c)) out[id] = c;
	}
	return out;
}
