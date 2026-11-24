// The title bar slot of an installed app with Window Controls Overlay. In that mode the page draws a
// bar (in the page color) along the top edge (see index.css) and the side panel starts under it. On a wide
// window the photo list buttons move up into the bar, into the empty slot `App.tsx` renders there.
// This hook gives that slot, or null in a normal tab, in Safari, on a phone or while the user shows
// the native title bar again (the media query then stops matching, so the buttons go back down).
// The Mac app (Tauri) has no title bar either; its window is always wide (min width 900 px).
import { useEffect, useState } from "react";
import { useMedia } from "@/ui/media";

export const TITLE_BAR_QUERY =
	"(display-mode: window-controls-overlay) and (min-width: 768px)";

const isMac = () => document.documentElement.dataset.shell === "mac";

export function useTitleSlot(): HTMLElement | null {
	const on = useMedia(isMac() ? "(min-width: 768px)" : TITLE_BAR_QUERY);
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
