// Zoom and pan of the stage. The zoom is screen pixels per photo pixel, so 100% is actual pixels.
// While `fitted` is true the picture follows the window size; a wheel turn, a drag, a pinch or a
// double tap ends that. The picture never goes more than 500 px past an edge of the stage.
// The view of each photo is saved (`views.ts`) as a share of the fit zoom and of the stage, so a
// reload, even in a window of another size, shows the photo where it was left.
// While `locked` is true the zoom is fixed: the wheel, a pinch and a double tap do nothing; a drag
// still moves the picture. With `lockWidth` set too the photo is that many CSS pixels wide; without
// it the zoom stays where it was. The sums are in `viewMath.ts`, the hand in `useGestures.ts`, the
// size of the box in `useRoom.ts`.
import { useEffect, useRef, useState } from "react";
import { useGestures } from "./useGestures";
import { useRoom } from "./useRoom";
import {
	centered,
	clampZoom,
	fitZoomOf,
	fromSaved,
	keepNear,
	type Size,
	toSaved,
	type View,
	zoomAround,
} from "./viewMath";
import { forgetAllViews, keepView, savedView } from "./views";

/** The views of this visit that stay in memory (the saved ones are kept by `views.ts`). */
const KEEP_FREES = 50;

export function useViewport(
	photo: Size | null,
	key: string | null,
	locked = false,
	lockWidth: number | null = null,
) {
	const { box, room } = useRoom();
	// The view of each tab (by key), kept while the page is open; a tab never seen starts fitted.
	const [frees, setFrees] = useState<Record<string, View | null>>({});
	const at = key ?? "";

	// A new lock width starts every tab centered. A tab not seen before starts centered anyway.
	const lastLock = useRef(lockWidth);
	useEffect(() => {
		if (lastLock.current === lockWidth) return;
		lastLock.current = lockWidth;
		forgetAllViews();
		setFrees({});
	}, [lockWidth]);

	const ready = photo !== null && room.w > 0;
	const fit = fitZoomOf(photo, room);
	const lockZoom = photo && lockWidth ? lockWidth / photo.width : null;
	const near = (v: View): View =>
		photo && ready ? keepNear(v, photo, room) : v;

	// A view the user set wins; "fitted" (null) is a view too; a photo not touched this visit uses its save.
	const saved = savedView(at);
	const free: View | null =
		at in frees
			? (frees[at] ?? null)
			: saved && photo && ready
				? fromSaved(saved, photo, room, fit, lockZoom)
				: null;
	const view: View = free
		? near(free)
		: photo
			? centered(photo, room, lockZoom ?? fit)
			: { zoom: 1, x: 0, y: 0 };

	/** Sets the view the user made (null: fitted again). It is kept near the stage and saved. */
	const put = (v: View | null) => {
		const next = v ? near(v) : null;
		setFrees((m) => {
			// the newest views stay: a photo set again moves to the end
			const { [at]: _old, ...rest } = m;
			const all = { ...rest, [at]: next };
			const keys = Object.keys(all);
			if (keys.length > KEEP_FREES) delete all[keys[0] as string];
			return all;
		});
		if (at)
			keepView(
				at,
				next && photo && ready ? toSaved(next, photo, room, fit) : null,
			);
	};

	const middle = { x: room.w / 2, y: room.h / 2 };
	/** Zooms by a factor around a point of the box (default: its center). */
	const zoomBy = (factor: number, px = middle.x, py = middle.y) =>
		put(zoomAround(view, clampZoom(view.zoom * factor, fit), px, py));
	/** Zooms to a zoom around the center of the box (the menu: 100%, 200%). */
	const zoomTo = (zoom: number) =>
		put(zoomAround(view, zoom, middle.x, middle.y));
	/** Moves the picture by a few pixels (the arrow keys); the zoom stays. */
	const pan = (dx: number, dy: number) =>
		put({ zoom: view.zoom, x: view.x + dx, y: view.y + dy });

	const pointer = useGestures({ box, view, fit, locked, put });

	return {
		box,
		view,
		fit: () => put(null),
		pan,
		zoomTo,
		zoomBy,
		pointer,
		fitted: free === null,
		locked,
	};
}
