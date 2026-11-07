// The sums of the stage view, with no React in them. A view is the zoom (screen pixels per photo
// pixel, so 1 is actual pixels) and where the photo's top left sits in the stage box. The zoom
// around a point is written once, in `zoomAround`; the wheel, the pinch, the buttons and the double
// tap all use it.

import type { Saved } from "./views";

export type Size = { width: number; height: number };
export type Room = { w: number; h: number };
export type View = { zoom: number; x: number; y: number };

export const MAX_ZOOM = 16;
/** The least zoom is this share of the fit zoom. */
const MIN_OF_FIT = 0.25;
/** Space kept around the photo when it is fitted, in px. */
const PAD = 24;
/** The most empty stage, in px, that may show beyond any edge of the photo. */
const SLACK = 500;

/** The zoom that fits the whole photo in the stage; 1 before the stage has a size. */
export function fitZoomOf(photo: Size | null, room: Room): number {
	if (!photo || room.w <= 0) return 1;
	return Math.min((room.w - PAD) / photo.width, (room.h - PAD) / photo.height);
}

/** A zoom held between a quarter of the fit zoom and the most. */
export const clampZoom = (zoom: number, fit: number) =>
	Math.min(MAX_ZOOM, Math.max(fit * MIN_OF_FIT, zoom));

/**
 * The view at `zoom` that keeps the photo point now under (ax, ay) fixed. `toX` and `toY` say where
 * that point should end up; they default to (ax, ay) itself (a pinch moves it to the fingers' middle).
 */
export function zoomAround(
	v: View,
	zoom: number,
	ax: number,
	ay: number,
	toX = ax,
	toY = ay,
): View {
	const k = zoom / v.zoom;
	return { zoom, x: toX - (ax - v.x) * k, y: toY - (ay - v.y) * k };
}

/** The view that shows the photo centered at `zoom`. */
export const centered = (photo: Size, room: Room, zoom: number): View => ({
	zoom,
	x: (room.w - photo.width * zoom) / 2,
	y: (room.h - photo.height * zoom) / 2,
});

/** Keeps at most SLACK px of empty stage beyond each edge; a photo smaller than that stays centered. */
export function keepNear(v: View, photo: Size, room: Room): View {
	const lim = (pos: number, space: number, size: number) => {
		const mid = (space - size) / 2;
		return Math.min(
			Math.max(mid, SLACK),
			Math.max(Math.min(mid, space - SLACK - size), pos),
		);
	};
	return {
		zoom: v.zoom,
		x: lim(v.x, room.w, photo.width * v.zoom),
		y: lim(v.y, room.h, photo.height * v.zoom),
	};
}

/** A view as a save, so a reload in a window of another size shows the photo where it was left. */
export function toSaved(v: View, photo: Size, room: Room, fit: number): Saved {
	return {
		k: v.zoom / fit,
		cx: (v.x + (photo.width * v.zoom) / 2) / room.w,
		cy: (v.y + (photo.height * v.zoom) / 2) / room.h,
	};
}

/** The view from a save. `lockZoom` (the zoom a cm lock asks for) wins over the saved zoom. */
export function fromSaved(
	s: Saved,
	photo: Size,
	room: Room,
	fit: number,
	lockZoom: number | null,
): View {
	const zoom = Math.min(MAX_ZOOM, lockZoom ?? fit * s.k);
	return {
		zoom,
		x: s.cx * room.w - (photo.width * zoom) / 2,
		y: s.cy * room.h - (photo.height * zoom) / 2,
	};
}
