// The keyboard shortcuts, kept few: hold Space to see the bare photo, the arrow keys move the photo
// (10 px, Shift for 100 px), [ hides or shows the side panel. A key does nothing
// when the focus is in a panel, a text box, a slider, a menu or a dialog, so those keep their own
// keys.
import { useEffect, useEffectEvent } from "react";

/** Where a key belongs to the thing that has the focus. */
const OWN_KEYS =
	'input, textarea, select, aside, [contenteditable], [role="slider"], [role="radio"], [role="spinbutton"], [role="combobox"], [role="listbox"], [role="menu"], [role="menuitem"], [role="tab"], [role="separator"], [role="dialog"]';
/** Things Space presses by itself. */
const PRESSABLE = "button, a, summary";

/** How far an arrow key moves the photo, in px; with Shift the big step. */
const STEP = 10;
const BIG_STEP = 100;
const ARROWS: Record<string, [number, number]> = {
	ArrowLeft: [-1, 0],
	ArrowRight: [1, 0],
	ArrowUp: [0, -1],
	ArrowDown: [0, 1],
};

type Handlers = {
	hasPhoto: boolean;
	onHold: (down: boolean) => void;
	onPan: (dx: number, dy: number) => void;
	onPanel: () => void;
};

export function useShortcuts(p: Handlers) {
	// The listeners are set once; these two always read the latest props.
	const hold = useEffectEvent((down: boolean) => p.onHold(down));
	/** Acts on a key; true when it asks for the hold (Space). */
	const act = useEffectEvent((e: KeyboardEvent): boolean => {
		if (e.defaultPrevented) return false;
		if (e.ctrlKey || e.metaKey || e.altKey) return false;
		const t = e.target instanceof Element ? e.target : document.body;
		if (t.closest(OWN_KEYS)) return false;
		if (e.key === "[") {
			e.preventDefault();
			if (!e.repeat) p.onPanel();
		} else if (e.key in ARROWS && p.hasPhoto) {
			e.preventDefault();
			const [x, y] = ARROWS[e.key] as [number, number];
			const step = e.shiftKey ? BIG_STEP : STEP;
			p.onPan(x * step, y * step);
		} else if (e.key === " " && p.hasPhoto && !t.closest(PRESSABLE)) {
			e.preventDefault();
			return true;
		}
		return false;
	});

	useEffect(() => {
		let holding = false;
		const release = () => {
			if (!holding) return;
			holding = false;
			hold(false);
		};
		const down = (e: KeyboardEvent) => {
			if (act(e) && !holding) {
				holding = true;
				hold(true);
			}
		};
		const up = (e: KeyboardEvent) => {
			if (e.key === " ") release();
		};
		window.addEventListener("keydown", down);
		window.addEventListener("keyup", up);
		window.addEventListener("blur", release);
		return () => {
			window.removeEventListener("keydown", down);
			window.removeEventListener("keyup", up);
			window.removeEventListener("blur", release);
			release();
		};
	}, []);
}
