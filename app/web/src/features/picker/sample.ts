// The color the stage shows at one photo pixel: the photo (or white Paper), then the base, Edges and
// Grid layers over it in order, each by its own see-through and opacity. It follows `Stage.tsx`, so
// the picker reads what the eye sees, in any base. While the photo button is held it is the bare photo.
import { PAPER, STAGE_IDS, type StageId } from "@/features/tools/settings";
import type { Rgb } from "./mix";

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
