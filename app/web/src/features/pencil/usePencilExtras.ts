// What the Pencil card holds for the photo on screen and does not save: the Auto note, the pencils
// Suggest picked and the count it was asked for. A new photo drops the note and the suggestion.
import { useEffect, useRef, useState } from "react";
import type { PencilAuto } from "@/draw/calls";
import { pencilAuto, suggestPencils } from "@/draw/coreClient";
import { errText } from "@/lib/util";
import { explainAuto } from "./explain";

/** The pencil counts Suggest offers. */
export const SUGGEST_COUNTS = [3, 4, 5, 6] as const;

type Held = {
	photo: ImageData | null;
	note: string | null;
	suggested: number | null;
};

export type PencilExtras = {
	/** What Auto did, in words, or null. */
	note: string | null;
	/** The mask Suggest picked, or null. */
	suggested: number | null;
	/** How many pencils Suggest is asked for. */
	count: number;
	setCount: (n: number) => void;
	/** Which call is running now. */
	busy: "auto" | "suggest" | null;
	/** The text of the last failure, or null. */
	error: string | null;
	/** Reads the photo; `apply` gets the knob values Auto found. */
	runAuto: (apply: (a: PencilAuto) => void) => void;
	runSuggest: () => void;
	clearNote: () => void;
};

export function usePencilExtras(photo: ImageData | null): PencilExtras {
	const [held, setHeld] = useState<Held>({
		photo,
		note: null,
		suggested: null,
	});
	const [count, setCount] = useState<number>(4);
	const [busy, setBusy] = useState<PencilExtras["busy"]>(null);
	const [error, setError] = useState<string | null>(null);
	// the photo on screen now, for an answer that comes late
	const now = useRef(photo);
	useEffect(() => {
		now.current = photo;
	}, [photo]);

	// what is held belongs to one photo; another photo sees none of it
	const mine = held.photo === photo;
	const keep = (next: Partial<Omit<Held, "photo">>) =>
		setHeld((h) => ({
			photo,
			note: h.photo === photo ? h.note : null,
			suggested: h.photo === photo ? h.suggested : null,
			...next,
		}));

	const run = (
		kind: "auto" | "suggest",
		job: (img: ImageData, wanted: () => boolean) => Promise<void>,
	) => {
		if (!photo || busy) return;
		setBusy(kind);
		setError(null);
		const wanted = () => now.current === photo;
		job(photo, wanted)
			.catch((e: unknown) => {
				if (wanted()) setError(errText(e));
			})
			.finally(() => setBusy(null));
	};

	return {
		note: mine ? held.note : null,
		suggested: mine ? held.suggested : null,
		count,
		setCount,
		busy,
		error,
		runAuto: (apply) =>
			run("auto", async (img, wanted) => {
				const a = await pencilAuto(img, wanted);
				if (!wanted()) return;
				apply(a);
				keep({ note: explainAuto(a) });
			}),
		runSuggest: () =>
			run("suggest", async (img, wanted) => {
				const mask = await suggestPencils(img, count, wanted);
				if (wanted()) keep({ suggested: mask });
			}),
		clearNote: () => {
			if (mine && held.note !== null) keep({ note: null });
		},
	};
}
