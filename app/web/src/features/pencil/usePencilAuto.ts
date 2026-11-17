// Auto runs by itself for a photo, the first time Pencil is the base and the painter has not tuned
// Brightness, Contrast and Highlights. "Not tuned" means they still hold their start values or what
// Auto itself set for the last photo (the three knobs are shared by every photo). A hand move wins:
// an answer that comes late never overwrites a value the painter changed meanwhile.
// The Auto button runs it again at any time.
import { useEffect, useRef } from "react";
import type { Look } from "@/features/tools/settings";
import { AUTO_KEYS, PENCIL_START } from "./knobs";
import type { PencilExtras } from "./usePencilExtras";

/** The three knobs Auto sets (`AUTO_KEYS`). */
type Three = Record<(typeof AUTO_KEYS)[number], number>;

const same = (a: Three, b: Three) => AUTO_KEYS.every((k) => a[k] === b[k]);

const START: Three = {
	key: PENCIL_START.key,
	contrast: PENCIL_START.contrast,
	highlights: PENCIL_START.highlights,
};

export function usePencilAuto(
	photo: ImageData | null,
	look: Look,
	onLook: (f: (s: Look) => Look) => void,
	extras: PencilExtras,
) {
	// the photos seen, so a photo is read once (a reference, so a closed one is let go)
	const seen = useRef(new WeakSet<ImageData>());
	// what Auto set last, so the next photo still counts as untuned
	const applied = useRef<Three | null>(null);
	const { runAuto, busy } = extras;
	const on = look.base.kind === "pencil";
	const { key, contrast, highlights } = look.pencil;
	// biome-ignore lint/correctness/useExhaustiveDependencies: `runAuto` is new on each render
	useEffect(() => {
		if (!on || !photo || busy || seen.current.has(photo)) return;
		seen.current.add(photo);
		const before: Three = { key, contrast, highlights };
		if (
			!same(before, START) &&
			!(applied.current && same(before, applied.current))
		)
			return;
		runAuto((a) => {
			const next: Three = {
				key: a.key,
				contrast: a.contrast,
				highlights: a.highlights,
			};
			applied.current = next;
			// only while the three knobs are still as they were when Auto began
			onLook((s) =>
				same(s.pencil, before) ? { ...s, pencil: { ...s.pencil, ...next } } : s,
			);
		});
	}, [on, photo, busy, key, contrast, highlights]);
}
