// A smooth copy of a picture for the stage while it is shown small. A big canvas scaled down by a
// CSS transform is sampled with few taps, so fine detail turns to specks (a photo) or rings (the
// lines of a Hatch). Below `SMOOTH_BELOW` of its own size the stage shows a copy that is halved step
// by step down to the shown size instead. `smoothTarget` says if and how big; `downscale` draws it.
// The full-size canvas stays: it is the data (the picker reads `ImageData`, not this copy).

type Size = { width: number; height: number };

/** The copy is used while the picture is shown below this share of its own pixels. */
export const SMOOTH_BELOW = 0.5;
/** The copy's size moves in steps of a quarter octave, so a small zoom change or a pan keeps it. */
const STEPS_PER_OCTAVE = 4;

/**
 * The size of the smooth copy of a picture of size `src` that is shown `shownWidth` CSS pixels wide
 * on a screen of `dpr` device pixels per CSS pixel; null when the full picture should be shown
 * (it is shown at half its size or more). The size is rounded up to its step, so it is never
 * smaller than what the screen needs.
 */
export function smoothTarget(
	src: Size,
	shownWidth: number,
	dpr: number,
): Size | null {
	if (src.width <= 0 || src.height <= 0) return null;
	const scale = (shownWidth * dpr) / src.width;
	if (!(scale > 0) || scale >= SMOOTH_BELOW) return null;
	const step = Math.ceil(Math.log2(scale) * STEPS_PER_OCTAVE - 1e-9);
	const s = Math.min(SMOOTH_BELOW, 2 ** (step / STEPS_PER_OCTAVE));
	return {
		width: Math.max(1, Math.round(src.width * s)),
		height: Math.max(1, Math.round(src.height * s)),
	};
}

/** Draws `src` into `out` at w x h: halved while the next half is still at least as big, then one
 * last smooth draw. Each half is a box average, so a line 3 px apart does not alias. */
export function downscale(
	src: HTMLCanvasElement,
	out: HTMLCanvasElement,
	w: number,
	h: number,
): void {
	let cur = src;
	let temp: HTMLCanvasElement | null = null;
	while (Math.ceil(cur.width / 2) >= w && Math.ceil(cur.height / 2) >= h) {
		const half = document.createElement("canvas");
		half.width = Math.ceil(cur.width / 2);
		half.height = Math.ceil(cur.height / 2);
		const g = half.getContext("2d");
		if (!g) break;
		g.imageSmoothingEnabled = true;
		g.imageSmoothingQuality = "high";
		g.drawImage(cur, 0, 0, half.width, half.height);
		if (temp) {
			temp.width = 0;
			temp.height = 0;
		}
		temp = half;
		cur = half;
	}
	out.width = w;
	out.height = h;
	const g = out.getContext("2d");
	if (g) {
		g.imageSmoothingEnabled = true;
		g.imageSmoothingQuality = "high";
		g.drawImage(cur, 0, 0, w, h);
	}
	if (temp) {
		temp.width = 0;
		temp.height = 0;
	}
}
