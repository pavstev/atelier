// The whole screen: the photo list on the left; the photo takes the rest, with the tools in the
// bar at the bottom of it.
// A base (Photo, Values, Shapes or Paper) with Edges and Grid over it. The photos live in
// `usePhotos`, the layers in `useLayers`, the middle in `StageArea`.
import { useMemo, useRef, useState } from "react";
import type { Call } from "@/draw/calls";
import { useLayers } from "@/draw/useLayers";
import Files from "@/features/photos/Files";
import { usePhotos } from "@/features/photos/usePhotos";
import StageArea from "@/features/stage/StageArea";
import { Legend } from "@/features/stage/Swatches";
import {
	callFor,
	type Look,
	NARROW,
	readLayout,
	readLook,
	STAGE_IDS,
	type StageId,
	useLayoutSaved,
	useLookSaved,
} from "@/features/tools/settings";
import Logo from "@/ui/Logo";
import { useTheme } from "@/ui/useTheme";

/** The call of each stacked layer; null when it is off (a Photo or Paper base draws nothing). */
const callsOf = (s: Look): Record<StageId, Call | null> => ({
	base:
		s.base.kind === "photo" || s.base.kind === "paper"
			? null
			: callFor(s.base.kind, s),
	edges: s.edges.on ? callFor("edges", s) : null,
	grid: s.grid.on ? callFor("grid", s) : null,
});

export default function App() {
	useTheme();
	const [look, setLook] = useState(readLook);
	const [layout, setLayout] = useState(readLayout);
	useLookSaved(look);
	useLayoutSaved(layout);
	const ph = usePhotos();
	const input = useRef<HTMLInputElement>(null);
	const root = useRef<HTMLDivElement>(null);
	// the legend color shown big, or none
	const [zoom, setZoom] = useState<number | null>(null);

	const calls = useMemo(() => callsOf(look), [look]);
	const { pictures, tones } = useLayers(
		ph.photo,
		calls,
		ph.bump,
		ph.layerFailed,
	);

	const shown = {} as Record<
		StageId,
		{ image: ImageData; opacity: number } | null
	>;
	for (const id of STAGE_IDS) {
		const image = calls[id] ? pictures[id] : null;
		shown[id] = image ? { image, opacity: look[id].opacity } : null;
	}

	const toned =
		ph.photo !== null &&
		(look.base.kind === "values" || look.base.kind === "shapes") &&
		tones !== null &&
		tones.length > 0;
	const openPicker = () => input.current?.click();
	const closePanel = () => setLayout((l) => ({ ...l, panels: { left: true } }));

	return (
		<div
			ref={root}
			className="flex h-dvh overflow-hidden bg-background text-foreground"
			style={
				{
					"--left-w": `${layout.widths.left}px`,
				} as React.CSSProperties
			}
		>
			<div
				data-testid="logo"
				className="pointer-events-none fixed top-3 left-3 z-(--z-banner) flex h-(--logo-h) items-center text-foreground"
			>
				<Logo className="h-[21px] w-auto" outline={layout.panels.left} />
				<span className="sr-only">Atelier</span>
			</div>
			<input
				ref={input}
				type="file"
				accept="image/*"
				multiple
				hidden
				data-testid="file"
				onChange={(e) => {
					void ph.open(Array.from(e.target.files ?? []));
					e.target.value = "";
				}}
			/>
			<Files
				photos={ph.docs}
				activeId={ph.activeId}
				collapsed={layout.panels.left}
				onFacts={ph.patch}
				onClose={closePanel}
				onSelect={(id) => {
					if (id !== ph.activeId) void ph.activate(id);
					// on a phone the drawer gets out of the way, so the photo shows
					if (window.matchMedia(NARROW).matches) closePanel();
				}}
				onAdd={openPicker}
				onFiles={(f) => void ph.open(f)}
				onRename={ph.rename}
				onRemove={ph.remove}
			/>
			<StageArea
				root={root}
				photo={ph.photo}
				photoId={ph.activeId}
				layers={shown}
				look={look}
				onLook={setLook}
				legend={
					toned && tones ? (
						<Legend
							tones={tones}
							label={look.base.kind === "values" ? "Value legend" : "Mix piles"}
							onPick={setZoom}
						/>
					) : undefined
				}
				layout={layout}
				onLayout={setLayout}
				facts={{
					name: ph.name,
					photos: ph.docs.length,
				}}
				errors={ph.errors}
				onDismissError={() => ph.dismissErrors()}
				tones={tones}
				zoomAt={zoom}
				onZoomAt={setZoom}
				onOpen={openPicker}
				onFiles={(f) => void ph.open(f)}
			/>
		</div>
	);
}
