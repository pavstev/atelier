// Lock zoom: the photo shows at a real width in cm on this screen. The zoom is fixed as soon as
// the switch is on, even before both widths are typed; a drag still moves the picture. The
// screen width in cm, measured once with a ruler, turns cm into CSS pixels: `screen.width` is
// the whole screen in CSS pixels, and in Chrome it follows the browser zoom. On a known MacBook
// screen the app fills in the screen width itself (`guessScreen`).
import { useState } from "react";
import { KEYS, loadJson, useSaved } from "@/lib/storage";
import { guessScreen } from "./screens";

export type Lock = {
	on: boolean;
	/** The width the photo takes on screen, in cm. */
	cm: number;
	/** The width of the lit part of this screen, in cm. 0 until it is measured or found. */
	screenCm: number;
};

const START: Lock = { on: false, cm: 18, screenCm: 0 };

/** The saved lock; a missing or wrong-typed value falls back to the start. The key keeps its old
 * dotted name (`atelier.lockZoom`) so saved locks of earlier visits still load. */
function clean(v: unknown): Lock {
	const r = (v && typeof v === "object" ? v : {}) as Partial<Lock>;
	const num = (x: unknown, d: number) =>
		typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : d;
	return {
		on: r.on === true,
		cm: num(r.cm, START.cm),
		screenCm: num(r.screenCm, 0) || (guessScreen()?.cm ?? 0),
	};
}

export function useLock() {
	const [lock, setLock] = useState<Lock>(() =>
		loadJson(KEYS.lock, clean, () => clean(null)),
	);
	useSaved(KEYS.lock, lock);
	return [lock, setLock] as const;
}

/** The photo width in CSS pixels the lock asks for, or null when the lock is off or not set up. */
export function lockedWidth(lock: Lock): number | null {
	if (!lock.on || lock.cm <= 0 || lock.screenCm <= 0) return null;
	return (lock.cm * window.screen.width) / lock.screenCm;
}
