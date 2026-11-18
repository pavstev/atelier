// The title bar slot of an installed app with Window Controls Overlay. In that mode the page draws a
// bar (in the page color) along the top edge (see index.css) and the side panel starts under it. On a wide
// window the photo list buttons move up into the bar, into the empty slot `App.tsx` renders there.
// This hook gives that slot, or null in a normal tab, in Safari, on a phone or while the user shows
// the native title bar again (the media query then stops matching, so the buttons go back down).
import { useEffect, useState, useSyncExternalStore } from "react";

export const TITLE_BAR_QUERY =
	"(display-mode: window-controls-overlay) and (min-width: 768px)";

const subscribe = (notify: () => void) => {
	const m = window.matchMedia(TITLE_BAR_QUERY);
	m.addEventListener("change", notify);
	return () => m.removeEventListener("change", notify);
};
const read = () => window.matchMedia(TITLE_BAR_QUERY).matches;

export function useTitleSlot(): HTMLElement | null {
	const on = useSyncExternalStore(subscribe, read, () => false);
	const [slot, setSlot] = useState<HTMLElement | null>(null);
	useEffect(() => {
		setSlot(
			on
				? document.querySelector<HTMLElement>('[data-testid="titlebar-tools"]')
				: null,
		);
	}, [on]);
	return slot;
}
