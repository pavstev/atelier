// The Size choice of the photo on screen, kept saved per photo, and the photo the layers get: the
// whole photo, or (Fit to paper) a cut of it in the paper shape. The stored original is never cut.
import { useCallback, useMemo } from "react";
import { KEYS, loadJson, usePersisted } from "@/lib/storage";
import { cropImage } from "./crop";
import {
	type Choice,
	cleanSizes,
	cropFor,
	isStartChoice,
	SIZE_START,
} from "./paper";

export type SizeState = {
	/** The choice for the photo on screen (the start when it has none). */
	choice: Choice;
	/** Changes the choice of the photo on screen. */
	set: (f: (c: Choice) => Choice) => void;
	/** The size of the photo before any cut, in px; null with no photo. */
	whole: { width: number; height: number } | null;
};

/**
 * The choice of the photo `id` and the pixels to draw: `framed` is `photo` itself unless Fit to paper
 * is on and the photo has another shape, then a cut of it (made again only when the photo or the
 * choice changes).
 */
export function useSize(
	id: string | null,
	photo: ImageData | null,
): SizeState & { framed: ImageData | null } {
	const [all, setAll] = usePersisted(KEYS.sizes, () =>
		loadJson(KEYS.sizes, cleanSizes),
	);
	const choice = (id && all[id]) || SIZE_START;
	const set = useCallback(
		(f: (c: Choice) => Choice) => {
			if (!id) return;
			setAll((all) => {
				const next = f(all[id] ?? SIZE_START);
				const rest = { ...all };
				delete rest[id];
				// a start choice is not kept; the newest choice goes last
				return isStartChoice(next) ? rest : { ...rest, [id]: next };
			});
		},
		[id, setAll],
	);
	const rect = photo ? cropFor(choice, photo.width, photo.height) : null;
	// the rectangle as text, so a new object with the same numbers does not cut again
	const key = rect ? `${rect.x},${rect.y},${rect.w},${rect.h}` : "";
	// biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for `rect`
	const framed = useMemo(
		() => (photo && rect ? cropImage(photo, rect) : photo),
		[photo, key],
	);
	return {
		choice,
		set,
		whole: photo ? { width: photo.width, height: photo.height } : null,
		framed,
	};
}
