// Small pointer and key rules the stage and the color picker share.

/** The arrow keys as a step of one: left and up are negative. */
export const ARROWS: Record<string, readonly [number, number]> = {
	ArrowLeft: [-1, 0],
	ArrowRight: [1, 0],
	ArrowUp: [0, -1],
	ArrowDown: [0, 1],
};

/** A press that moves more than this, in px, is a drag and not a tap. */
export const TAP_SLOP = 8;

/**
 * The two pointer listeners of a tap: `press` marks a left press, `lift` calls `onTap` when the
 * pointer comes up within `TAP_SLOP` of where it went down.
 */
export function tapListeners(onTap: (e: PointerEvent) => void) {
	let down: { x: number; y: number } | null = null;
	return {
		press: (e: PointerEvent) => {
			down = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
		},
		lift: (e: PointerEvent) => {
			if (!down) return;
			const far = Math.hypot(e.clientX - down.x, e.clientY - down.y) > TAP_SLOP;
			down = null;
			if (!far) onTap(e);
		},
	};
}
