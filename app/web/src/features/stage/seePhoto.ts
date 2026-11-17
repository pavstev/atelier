// The See photo state: a quick tap keeps the bare photo on until the next tap, a press longer than
// HOLD_MS shows it only while pressed. The button and the Space key share one controller.
import { useCallback, useEffect, useRef, useState } from "react";

/** A press shorter than this (ms) is a tap that keeps the photo on. */
export const HOLD_MS = 300;

export type SeeState = { on: boolean; latched: boolean };

export function createSeePhoto(set: (s: SeeState) => void) {
	let down = false;
	let latched = false;
	let t0 = 0;
	const show = (on: boolean) => set({ on, latched });
	return {
		/** The button or Space goes down. A key repeat counts once. */
		press(now: number) {
			if (down) return;
			down = true;
			t0 = now;
			show(true);
		},
		/**
		 * The button or Space comes up. `completed` is false when the press was cancelled or the
		 * pointer left the button: that only ends the peek, a kept-on photo stays as it was.
		 */
		release(now: number, completed = true) {
			if (!down) return;
			down = false;
			if (!completed) {
				show(latched);
			} else if (latched) {
				latched = false;
				show(false);
			} else if (now - t0 < HOLD_MS) {
				latched = true;
				show(true);
			} else {
				show(false);
			}
		},
		/** Back to off, for a lost focus. */
		reset() {
			down = false;
			latched = false;
			show(false);
		},
	};
}

export function useSeePhoto() {
	const [state, setState] = useState<SeeState>({ on: false, latched: false });
	const ctl = useRef<ReturnType<typeof createSeePhoto> | null>(null);
	if (!ctl.current) ctl.current = createSeePhoto(setState);
	const c = ctl.current;
	useEffect(() => {
		const off = () => c.reset();
		window.addEventListener("blur", off);
		return () => window.removeEventListener("blur", off);
	}, [c]);
	const press = useCallback((now: number) => c.press(now), [c]);
	const release = useCallback(
		(now: number, completed?: boolean) => c.release(now, completed),
		[c],
	);
	const reset = useCallback(() => c.reset(), [c]);
	return { ...state, press, release, reset };
}
