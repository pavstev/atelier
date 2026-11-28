// One horizontal drag on a handle, used by the side panel edge. The hook owns the
// pointer capture, the grabbing cursor and the listeners; the caller gets the distance from the
// start (`onMove`, `onEnd`) or a cancel (`onCancel`, which means restore, never end). A move is
// handed on once per frame, so the caller can paint without a React render.
import { useRef } from "react";

/** The distance from `startX` to `x`; null for a cancelled drag. */
export const dragStep = (
	startX: number,
	x: number,
	cancelled = false,
): number | null => (cancelled ? null : x - startX);

/** The end of a drag: the last move is flushed first, so a flick that ends before a frame still lands. */
export const finishDrag = (
	startX: number,
	x: number,
	onMove: (dx: number) => void,
	onEnd: (dx: number) => void,
): void => {
	const dx = dragStep(startX, x) ?? 0;
	onMove(dx);
	onEnd(dx);
};

export function useFrameDrag(opts: {
	onMove: (dx: number) => void;
	onEnd: (dx: number) => void;
	onCancel: () => void;
}) {
	// the newest callbacks, so a drag in flight never calls an old closure
	const latest = useRef(opts);
	latest.current = opts;

	const onPointerDown = (e: React.PointerEvent) => {
		const el = e.currentTarget as HTMLElement;
		const id = e.pointerId;
		const startX = e.clientX;
		let lastX = startX;
		let frame = 0;
		el.setPointerCapture(id);
		document.body.style.cursor = "grabbing";
		e.preventDefault();

		const flush = () => {
			frame = 0;
			latest.current.onMove(dragStep(startX, lastX) ?? 0);
		};
		const stop = () => {
			if (frame) cancelAnimationFrame(frame);
			frame = 0;
			document.body.style.cursor = "";
			el.removeEventListener("pointermove", move);
			el.removeEventListener("pointerup", up);
			el.removeEventListener("pointercancel", cancel);
			if (el.hasPointerCapture(id)) el.releasePointerCapture(id);
		};
		const move = (ev: PointerEvent) => {
			lastX = ev.clientX;
			if (!frame) frame = requestAnimationFrame(flush);
		};
		const up = (ev: PointerEvent) => {
			stop();
			finishDrag(
				startX,
				ev.clientX,
				latest.current.onMove,
				latest.current.onEnd,
			);
		};
		const cancel = () => {
			stop();
			latest.current.onCancel();
		};
		el.addEventListener("pointermove", move);
		el.addEventListener("pointerup", up);
		el.addEventListener("pointercancel", cancel);
	};

	return { onPointerDown };
}
