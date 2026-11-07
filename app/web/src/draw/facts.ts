// What the hidden `facts` element says about the layers worker: how many photos it holds, and a
// stamp that moves after each finished draw (the tests wait on it). It lives outside React state, so
// a draw does not render the whole app; only the element that shows it (`StageArea`) subscribes.
import { useSyncExternalStore } from "react";
import { layersHeld } from "./coreClient";

type Snap = { held: number; stamp: number };

let snap: Snap = { held: 0, stamp: 0 };
const subs = new Set<() => void>();

/** A draw finished, or a photo went to the worker: re-read what the worker holds and move the stamp. */
export function touchFacts() {
	snap = { held: layersHeld(), stamp: snap.stamp + 1 };
	for (const f of subs) f();
}

const subscribe = (f: () => void) => {
	subs.add(f);
	return () => {
		subs.delete(f);
	};
};

export const useFacts = (): Snap =>
	useSyncExternalStore(
		subscribe,
		() => snap,
		() => snap,
	);
