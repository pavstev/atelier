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
import { LoadBoundary } from "@/ui/LoadBoundary";
import { tapListeners } from "@/ui/pointer";

/** The look of the failed message: a banner on the stage, like the error banner (`StageArea.tsx`). */
const FAILED =
	"absolute top-4 left-1/2 z-(--z-banner) -translate-x-1/2 rounded-(--radius-chip) bg-surface py-1 ps-3 pe-1 shadow-overlay";

const load = () => import("./Picker");
const Picker = lazy(load);

/** Loads the picker chunk ahead of its first use. */
export function preloadPicker() {
	void load();
}

type Props = Omit<ComponentProps<typeof Picker>, "startAt">;
type Start = { x: number; y: number; tap: boolean };

export default function PickerLazy(p: Props) {
	const last = useRef<Start | null>(null);
	useLayoutEffect(() => {
		const el = p.box.current;
		if (!el) return;
		const move = (e: PointerEvent) => {
			if (e.pointerType === "mouse")
				last.current = { x: e.clientX, y: e.clientY, tap: false };
		};
		const { press, lift } = tapListeners((e) => {
			last.current = { x: e.clientX, y: e.clientY, tap: true };
		});
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
		<LoadBoundary className={FAILED}>
			<Suspense fallback={null}>
				<Picker {...p} startAt={last} />
			</Suspense>
		</LoadBoundary>
	);
}
