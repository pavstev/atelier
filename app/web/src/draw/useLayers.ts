// Draws the base, Edges and Grid that are on: one draw per layer, after the knobs settle for 250 ms. An answer
// for old knobs or an old photo is dropped; the last picture of this photo stays until the new one lands.
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { errText } from "@/lib/util";
import type { Call, Rgb } from "./calls";
import { draw, WORK_LONG_SIDE } from "./coreClient";

const SETTLE_MS = 250;

/** The three see-through slots of the stage, bottom first. */
type Slot = "base" | "edges" | "grid";

/** What a legend belongs to: the layer, and for Pencil also its set of pencils (a legend row is a
 * pencil, so the rows of an old set must not be read as the rows of a new one). */
const legendOf = (c: Call) =>
	c.layer === "pencil" ? `pencil:${c.mask}` : c.layer;

type Drawn = {
	photo: ImageData;
	layer: Call["layer"];
	legend: string;
	image: ImageData;
	tones?: Rgb[];
	shares?: number[];
};
type One = { image: ImageData; tones?: Rgb[]; shares?: number[] } | null;

/** The picture of one layer, or null while it is off or not drawn yet. */
function useOne(
	photo: ImageData | null,
	call: Call | null,
	onDone: () => void,
	onError: (message: string) => void,
): One {
	const [done, setDone] = useState<Drawn | null>(null);
	// The knobs as text: a new `call` object with the same numbers must not draw again.
	const key = photo && call ? JSON.stringify(call) : "";
	/** The photo of the last run, so a new photo draws at once and a knob waits to settle. */
	const lastPhoto = useRef<ImageData | null>(null);
	// The newest call and callbacks, read when the effect runs and when a draw lands.
	const latestCall = useEffectEvent(() => call);
	const drawn = useEffectEvent(onDone);
	const failed = useEffectEvent(onError);

	useEffect(() => {
		const c = latestCall();
		if (!photo || !c || key === "") {
			setDone(null);
			return;
		}
		let live = true;
		const fresh = lastPhoto.current !== photo;
		lastPhoto.current = photo;
		const timer = setTimeout(
			() => {
				draw(photo, c, WORK_LONG_SIDE, () => live)
					.then(({ layer: image, tones, shares }) => {
						if (!live) return;
						setDone({
							photo,
							layer: c.layer,
							legend: legendOf(c),
							image,
							tones,
							shares,
						});
						drawn();
					})
					.catch((e: unknown) => {
						if (live) failed(errText(e));
					});
			},
			fresh ? 0 : SETTLE_MS,
		);
		return () => {
			live = false;
			clearTimeout(timer);
		};
	}, [photo, key]);

	// The last picture stays while the next one draws, so a layer never blinks out on a knob. The
	// legend tones of another kind of base (Values after Shapes) do not: they would be read as the
	// new kind's tones or piles.
	if (key === "" || done?.photo !== photo) return null;
	const same = call !== null && done.legend === legendOf(call);
	return {
		image: done.image,
		tones: same ? done.tones : undefined,
		shares: same ? done.shares : undefined,
	};
}

type Pictures = Record<Slot, ImageData | null>;

/**
 * The pictures of the base, Edges and Grid; a null call is off. `tones` are the Values tones
 * or the Shapes piles, darkest first, when the base is drawn. Pencil adds `shares`, the percent of
 * the photo at each tone.
 */
export function useLayers(
	photo: ImageData | null,
	calls: Record<Slot, Call | null>,
	onDone: () => void,
	onError: (message: string) => void,
): { pictures: Pictures; tones: Rgb[] | null; shares: number[] | null } {
	const base = useOne(photo, calls.base, onDone, onError);
	const edges = useOne(photo, calls.edges, onDone, onError);
	const grid = useOne(photo, calls.grid, onDone, onError);
	return {
		pictures: {
			base: base?.image ?? null,
			edges: edges?.image ?? null,
			grid: grid?.image ?? null,
		},
		tones: base?.tones ?? null,
		shares: base?.shares ?? null,
	};
}
