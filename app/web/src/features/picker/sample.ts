// The color the stage shows at one photo pixel: the photo (or white Paper), then the base, Edges and
// Grid layers over it in order, each by its own see-through and opacity. It follows `Stage.tsx`, so
// the picker reads what the eye sees, in any base. While the photo button is held it is the bare photo.
import { PAPER, STAGE_IDS, type StageId } from "@/features/tools/settings";
import type { Rgb } from "./mix";
import { encodeOf, linearOf } from "./spectral";

type Layers = Record<StageId, { image: ImageData; opacity: number } | null>;

const PAPER_RGB: Rgb = [
	Number.parseInt(PAPER.slice(1, 3), 16),
	Number.parseInt(PAPER.slice(3, 5), 16),
	Number.parseInt(PAPER.slice(5, 7), 16),
];

/** The shown color at photo pixel (x, y), or null when the point is off the photo. */
export function colorAt(
	photo: ImageData,
	layers: Layers,
	paper: boolean,
	hold: boolean,
	x: number,
	y: number,
): Rgb | null {
	if (!(x >= 0 && y >= 0 && x < photo.width && y < photo.height)) return null;
	const px = Math.floor(x);
	const py = Math.floor(y);
	let c: number[];
	if (paper && !hold) c = [...PAPER_RGB];
	else {
		const i = (py * photo.width + px) * 4;
		c = [photo.data[i] ?? 0, photo.data[i + 1] ?? 0, photo.data[i + 2] ?? 0];
	}
	if (hold) return [c[0] as number, c[1] as number, c[2] as number];
	for (const id of STAGE_IDS) {
		const l = layers[id];
		if (!l) continue;
		// a layer may be drawn at another size; the stage stretches it over the photo
		const lx = Math.min(
			l.image.width - 1,
			Math.floor((x / photo.width) * l.image.width),
		);
		const ly = Math.min(
			l.image.height - 1,
			Math.floor((y / photo.height) * l.image.height),
		);
		const i = (ly * l.image.width + lx) * 4;
		const a = ((l.image.data[i + 3] ?? 0) / 255) * (l.opacity / 100);
		for (let k = 0; k < 3; k++)
			c[k] = (c[k] as number) * (1 - a) + (l.image.data[i + k] ?? 0) * a;
	}
	return [
		Math.round(c[0] as number),
		Math.round(c[1] as number),
		Math.round(c[2] as number),
	];
}

/** The average color of a disk of radius `r` photo pixels around (x, y), judged as a painter does
 * (a patch, not one speck of grain). The average is taken in linear light, where light adds up.
 * Off the photo at the center it is null; a radius under 1 pixel is the pixel itself. */
export function colorAround(
	photo: ImageData,
	layers: Layers,
	paper: boolean,
	hold: boolean,
	x: number,
	y: number,
	r: number,
): Rgb | null {
	const center = colorAt(photo, layers, paper, hold, x, y);
	if (!center || r < 1) return center;
	// at most 9 by 9 samples across the disk
	const step = Math.max(1, r / 4);
	let n = 0;
	const sum = [0, 0, 0];
	for (let dy = -r; dy <= r + 1e-9; dy += step)
		for (let dx = -r; dx <= r + 1e-9; dx += step) {
			if (dx * dx + dy * dy > r * r + 1e-9) continue;
			const c = colorAt(photo, layers, paper, hold, x + dx, y + dy);
			if (!c) continue;
			for (let k = 0; k < 3; k++)
				sum[k] = (sum[k] as number) + linearOf(c[k] as number);
			n++;
		}
	if (n === 0) return center;
	const e = (v: number) =>
		Math.round(Math.min(255, Math.max(0, encodeOf(v / n))));
	return [e(sum[0] as number), e(sum[1] as number), e(sum[2] as number)];
}
