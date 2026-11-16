// Auto runs by itself, once for each photo, the first time Pencil is the base and the three knobs
// Auto sets (Brightness, Contrast, Highlights) are still at their start. A photo the painter already
// tuned, a saved look with other values and the Zones look (Auto has nothing to set there) are left
// alone. The Auto button runs it again at any time.
import { useEffect, useRef } from "react";
import type { Look } from "@/features/tools/settings";
import { PENCIL_START } from "./knobs";
import type { PencilExtras } from "./usePencilExtras";

const ZONES = 2;

export function usePencilAuto(
	photo: ImageData | null,
	look: Look,
	onLook: (f: (s: Look) => Look) => void,
	extras: PencilExtras,
) {
	// the photos seen, so a photo is read once (a reference, so a closed one is let go)
	const seen = useRef(new WeakSet<ImageData>());
	const { runAuto, busy } = extras;
	const on = look.base.kind === "pencil";
	const p = look.pencil;
	const untouched =
		p.key === PENCIL_START.key &&
		p.contrast === PENCIL_START.contrast &&
		p.highlights === PENCIL_START.highlights;
	const zones = p.look === ZONES;
	// biome-ignore lint/correctness/useExhaustiveDependencies: `runAuto` is new on each render
	useEffect(() => {
		if (!on || !photo || busy || zones || seen.current.has(photo)) return;
		seen.current.add(photo);
		if (!untouched) return;
		runAuto((a) =>
			onLook((s) => ({
				...s,
				pencil: {
					...s.pencil,
					key: a.key,
					contrast: a.contrast,
					highlights: a.highlights,
				},
			})),
		);
	}, [on, photo, busy, zones, untouched]);
}
