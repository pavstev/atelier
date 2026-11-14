// The middle of the screen: the stage with the photo, the bottom bar, the handle on the panel edge,
// the error banner and the color picker. It owns the zoom and pan (`useViewport`) and the Lock, so a
// drag or a wheel turn draws this part only and not the whole page.
import { Button } from "@heroui/react";
import { type ReactNode, type RefObject, useState } from "react";
import { useFacts } from "@/draw/facts";
import type { Level } from "@/features/pencil/grades";
import Picker, { AREA_START, type Fixed } from "@/features/picker/Picker";
import {
	LAYOUT,
	type Layout,
	type Look,
	PANEL_MAX,
	PANEL_MIN,
	type StageId,
} from "@/features/tools/settings";
import { ICON_BUTTON, Tip } from "@/ui/icons";
import EdgeHandle from "./EdgeHandle";
import { lockedWidth, useLock } from "./lockZoom";
import ResizeHandle from "./ResizeHandle";
import Stage from "./Stage";
import StageBar from "./StageBar";
import { useShortcuts } from "./useShortcuts";
import { useViewport } from "./useViewport";

type Layers = Record<StageId, { image: ImageData; opacity: number } | null>;

/** The hidden facts the tests and screen readers read. */
type Facts = {
	name: string;
	photos: number;
};

export default function StageArea(p: {
	root: RefObject<HTMLElement | null>;
	photo: ImageData | null;
	/** The photo id; each photo keeps its own zoom. */
	photoId: string | null;
	layers: Layers;
	look: Look;
	onLook: (f: (s: Look) => Look) => void;
	/** The Pencil levels once drawn; the picker names the grade of a spot from them. */
	levels?: Level[] | null;
	/** The legend of Values, Shapes or Pencil, for the Base card. */
	legend?: ReactNode;
	layout: Layout;
	onLayout: (f: (s: Layout) => Layout) => void;
	facts: Facts;
	errors: string[];
	onDismissError: () => void;
	/** A color held from the legend, shown in the picker card, or null. */
	picked: Fixed | null;
	onPicked: (f: Fixed | null) => void;
	onOpen: () => void;
	onFiles: (files: File[]) => void;
}) {
	const { look, layout, photo } = p;
	const drawn = useFacts();
	const [lock, setLock] = useLock();
	const [hold, setHold] = useState(false);
	const [picking, setPicking] = useState(false);
	const [area, setArea] = useState(AREA_START);
	// a color held from the legend turns the picker on
	const [seen, setSeen] = useState<Fixed | null>(null);
	if (p.picked !== seen) {
		setSeen(p.picked);
		if (p.picked) setPicking(true);
	}
	const viewport = useViewport(photo, p.photoId, lock.on, lockedWidth(lock));
	const toggle = () =>
		p.onLayout((l) => ({ ...l, panels: { left: !l.panels.left } }));
	useShortcuts({
		hasPhoto: photo !== null,
		onHold: setHold,
		onPan: viewport.pan,
		onPanel: toggle,
	});
	const widthOf = (w: number) =>
		p.onLayout((l) => ({ ...l, widths: { left: w } }));
	return (
		<main className="flex min-w-0 flex-1 flex-col">
			<div className="@container relative min-h-0 flex-1">
				{p.errors.length > 0 && (
					<div
						role="alert"
						data-testid="error"
						className="absolute top-4 left-1/2 z-(--z-banner) flex max-w-[min(32rem,calc(100%-2rem))] -translate-x-1/2 items-center gap-2 rounded-(--radius-chip) bg-danger py-1 ps-3 pe-1 text-sm text-danger-foreground"
					>
						<span className="flex min-w-0 flex-col gap-0.5 wrap-break-word">
							{p.errors.map((text) => (
								<span key={text}>{text}</span>
							))}
						</span>
						<Tip text="Dismiss">
							<Button
								isIconOnly
								size="sm"
								variant="ghost"
								className={`${ICON_BUTTON.row} text-danger-foreground`}
								aria-label="Dismiss the message"
								onPress={p.onDismissError}
							>
								×
							</Button>
						</Tip>
					</div>
				)}
				<Stage
					photo={photo}
					layers={p.layers}
					paper={look.base.kind === "paper"}
					hold={hold}
					viewport={viewport}
					onOpen={p.onOpen}
					onFiles={p.onFiles}
				/>
				{photo && picking && (
					<Picker
						box={viewport.box}
						photo={photo}
						layers={p.layers}
						paper={look.base.kind === "paper"}
						hold={hold}
						view={viewport.view}
						pencil={look.base.kind === "pencil"}
						levels={p.levels ?? null}
						fixed={p.picked}
						onFixed={p.onPicked}
						area={area}
						onArea={setArea}
					/>
				)}
				<EdgeHandle hidden={layout.panels.left} onToggle={toggle} />
				{!layout.panels.left && (
					<ResizeHandle
						root={p.root}
						variable="--left-w"
						width={layout.widths.left}
						min={PANEL_MIN.left}
						max={PANEL_MAX.left}
						onCommit={widthOf}
						onReset={() => widthOf(LAYOUT.widths.left)}
					/>
				)}
				{photo && (
					<StageBar
						lock={lock}
						onLock={setLock}
						zoom={viewport.view.zoom}
						onHold={setHold}
						onFit={viewport.fit}
						onZoomTo={viewport.zoomTo}
						look={look}
						onLook={p.onLook}
						legend={p.legend}
						picking={picking}
						picked={p.picked}
						onPicking={(on) => {
							setPicking(on);
							if (!on) p.onPicked(null);
						}}
					/>
				)}
				{photo && (
					<div
						data-testid="facts"
						data-stamp={drawn.stamp}
						data-held={drawn.held}
						data-photos={p.facts.photos}
						className="sr-only"
					>
						<p>{p.facts.name}</p>
						<p>
							{photo.width} × {photo.height}
						</p>
					</div>
				)}
			</div>
		</main>
	);
}
