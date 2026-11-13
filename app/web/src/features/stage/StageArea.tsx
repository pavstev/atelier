// The middle of the screen: the stage with the photo, the bottom bar, the handle on the panel edge,
// the error banner and the color zoom. It owns the zoom and pan (`useViewport`) and the Lock, so a
// drag or a wheel turn draws this part only and not the whole page.
import { Button } from "@heroui/react";
import { type ReactNode, type RefObject, useState } from "react";
import { useFacts } from "@/draw/facts";
import Picker from "@/features/picker/Picker";
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
import { SwatchZoom } from "./Swatches";
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
	/** The color legend of Values and Shapes, for the Base card. */
	legend?: ReactNode;
	layout: Layout;
	onLayout: (f: (s: Layout) => Layout) => void;
	facts: Facts;
	errors: string[];
	onDismissError: () => void;
	tones: number[][] | null;
	/** Index of the legend color shown big, or null. */
	zoomAt: number | null;
	onZoomAt: (i: number | null) => void;
	onOpen: () => void;
	onFiles: (files: File[]) => void;
}) {
	const { look, layout, photo } = p;
	const drawn = useFacts();
	const [lock, setLock] = useLock();
	const [hold, setHold] = useState(false);
	const [picking, setPicking] = useState(false);
	const viewport = useViewport(photo, p.photoId, lock.on, lockedWidth(lock));
	const toggle = () =>
		p.onLayout((l) => ({ ...l, panels: { left: !l.panels.left } }));
	useShortcuts({
		enabled: p.zoomAt === null,
		hasPhoto: photo !== null,
		onHold: setHold,
		onPan: viewport.pan,
		onPanel: toggle,
	});
	const widthOf = (w: number) =>
		p.onLayout((l) => ({ ...l, widths: { left: w } }));
	const toned =
		(look.base.kind === "values" || look.base.kind === "shapes") &&
		p.tones !== null &&
		p.tones.length > 0;

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
						onPicking={setPicking}
					/>
				)}
				{p.zoomAt !== null && toned && p.tones && (
					<SwatchZoom
						tones={p.tones}
						at={Math.min(p.zoomAt, p.tones.length - 1)}
						onAt={p.onZoomAt}
						onClose={() => p.onZoomAt(null)}
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
