// The color picker as a lazy chunk: its paint math (`mix.ts`, `spectral.ts`) is not in the first
// paint. The stage loads it a moment after a photo opens (`preloadPicker`). It is an overlay, so
// nothing shows while it loads. A mouse that moves over the stage, or a tap, while it loads is kept,
// so the card shows (or holds) at once where it was.
import {
	type ComponentProps,
	lazy,
	Suspense,
	useLayoutEffect,
	useRef,
} from "react";

const load = () => import("./Picker");
const Picker = lazy(load);

/** Loads the picker chunk ahead of its first use. */
export function preloadPicker() {
	void load();
}

type Props = Omit<ComponentProps<typeof Picker>, "startAt">;
type Start = { x: number; y: number; tap: boolean };

/** A press that moves more than this, in px, is a drag and not a tap (`TAP_SLOP` in `Picker.tsx`). */
const TAP_SLOP = 8;

export default function PickerLazy(p: Props) {
	const last = useRef<Start | null>(null);
	useLayoutEffect(() => {
		const el = p.box.current;
		if (!el) return;
		let down: { x: number; y: number } | null = null;
		const move = (e: PointerEvent) => {
			if (e.pointerType === "mouse")
				last.current = { x: e.clientX, y: e.clientY, tap: false };
		};
		const press = (e: PointerEvent) => {
			down = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
		};
		const lift = (e: PointerEvent) => {
			if (!down) return;
			const far = Math.hypot(e.clientX - down.x, e.clientY - down.y) > TAP_SLOP;
			down = null;
			if (!far) last.current = { x: e.clientX, y: e.clientY, tap: true };
		};
		el.addEventListener("pointermove", move);
		el.addEventListener("pointerdown", press);
		el.addEventListener("pointerup", lift);
		return () => {
			el.removeEventListener("pointermove", move);
			el.removeEventListener("pointerdown", press);
			el.removeEventListener("pointerup", lift);
		};
	}, [p.box]);
	return (
		<Suspense fallback={null}>
			<Picker {...p} startAt={last} />
		</Suspense>
	);
}
