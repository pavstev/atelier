// The whole screen: the photo list on the left; the photo takes the rest, with the tools in the
// bar at the bottom of it.
// A base (Photo, Values, Shapes, Paper or Pencil) with Edges and Grid over it; Pencil turns Edges off. The photos live in
// `usePhotos`, the layers in `useLayers`, the middle in `StageArea`. The Size tool cuts the photo to a paper
// shape here (`useSize`), before the layers see its pixels.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Call } from "@/draw/calls";
import { useLayers } from "@/draw/useLayers";
import { levelsOf } from "@/features/pencil/grades";
import Files from "@/features/photos/Files";
import { usePhotos } from "@/features/photos/usePhotos";
import type { Fixed } from "@/features/picker/Picker";
import { shownWidthCm } from "@/features/size/paper";
import { useSize } from "@/features/size/useSize";
import StageArea from "@/features/stage/StageArea";
import { Legend, PencilLegend } from "@/features/stage/Swatches";
import {
	callFor,
	type Look,
	NARROW,
	STAGE_IDS,
	type StageId,
	useLayout,
	useLook,
} from "@/features/tools/settings";
import { InstallButton } from "@/pwa/InstallButton";
import { startIntake } from "@/pwa/intake";
import { askPersist } from "@/pwa/persist";
import Logo from "@/ui/Logo";

/** The call of each stacked layer; null when it is off (a Photo or Paper base draws nothing).
 * `widthCm` is the width of the picture on the paper, for a Grid in cm (null with no photo). */
const callsOf = (
	s: Look,
	widthCm: number | null,
): Record<StageId, Call | null> => ({
	base:
		s.base.kind === "photo" || s.base.kind === "paper"
			? null
			: callFor(s.base.kind, s),
	// Edges is off in Pencil mode; its saved switch stays, so Photo brings it back
	edges: s.edges.on && s.base.kind !== "pencil" ? callFor("edges", s) : null,
	grid: s.grid.on ? callFor("grid", s, widthCm) : null,
});

export default function App() {
	const [look, setLook] = useLook();
	const [layout, setLayout] = useLayout();
	const ph = usePhotos();
	// every way in (picker, drop, launch queue, share) goes through here; after an add the browser is
	// asked to keep the photo store
	const { open } = ph;
	const add = useCallback(
		(files: File[], folder = "") => {
			void open(files, folder);
			if (files.length > 0) void askPersist(navigator);
		},
		[open],
	);
	const addRef = useRef(add);
	addRef.current = add;
	useEffect(() => {
		startIntake(window, (files) => addRef.current(files));
	}, []);
	const input = useRef<HTMLInputElement>(null);
	const root = useRef<HTMLDivElement>(null);
	// the legend color held in the paint mix card, or none
	const [picked, setPicked] = useState<Fixed | null>(null);

	// the paper or canvas of the photo; the layers and the stage get the cut photo (Fit to paper)
	const { framed, ...size } = useSize(ph.activeId, ph.photo);
	// the picture on the paper is this wide in cm: a Grid in cm counts its squares from it
	const widthCm = size.whole
		? shownWidthCm(size.choice, size.whole.width, size.whole.height)
		: null;
	const calls = useMemo(() => callsOf(look, widthCm), [look, widthCm]);
	const { pictures, tones, shares, mark } = useLayers(
		framed,
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
		framed !== null &&
		(look.base.kind === "values" || look.base.kind === "shapes") &&
		tones !== null &&
		tones.length > 0;
	// the Pencil levels (grade, tone, share), once a draw of the set of pencils on show has landed
	const levels =
		framed !== null && look.base.kind === "pencil"
			? levelsOf(look.pencil.mask, tones, shares)
			: null;
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
				className={`pointer-events-none fixed top-3 left-3 z-(--z-banner) flex h-(--logo-h) items-center text-foreground ${layout.panels.left ? "" : "md:top-[calc(var(--panel-gap)+var(--panel-pad)+1px)] md:left-[calc(var(--panel-gap)+var(--panel-pad)+1px)]"}`}
			>
				<Logo className="h-5 w-auto" outline={layout.panels.left} />
				<span className="sr-only">Atelier</span>
			</div>
			{/* the title bar slot of an installed app: the photo buttons move in here (see index.css) */}
			<div data-testid="titlebar-tools" className="titlebar-tools" />
			<div className="fixed top-3 right-3 z-(--z-banner)">
				<InstallButton />
			</div>
			<input
				ref={input}
				type="file"
				accept="image/*"
				multiple
				hidden
				data-testid="file"
				onChange={(e) => {
					add(Array.from(e.target.files ?? []));
					e.target.value = "";
				}}
			/>
			<Files
				photos={ph.docs}
				folders={ph.folders}
				openFolders={ph.openFolders}
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
				onFiles={add}
				onRename={ph.rename}
				onRemove={ph.remove}
				onMove={ph.moveTo}
				onFolderOpen={ph.setFolderOpen}
				onOpenFolders={ph.openFolderIds}
				onAddFolder={ph.addFolder}
				onRenameFolder={ph.renameFolder}
				onMoveFolder={ph.moveFolder}
				onRemoveFolder={ph.removeFolder}
			/>
			<StageArea
				root={root}
				photo={framed}
				photoId={ph.activeId}
				size={size}
				layers={shown}
				look={look}
				onLook={setLook}
				legend={
					levels ? (
						<PencilLegend levels={levels} mark={mark} onPick={setPicked} />
					) : toned && tones ? (
						<Legend
							tones={tones}
							label={look.base.kind === "values" ? "Value legend" : "Mix piles"}
							onPick={setPicked}
						/>
					) : undefined
				}
				levels={levels}
				mark={mark}
				layout={layout}
				onLayout={setLayout}
				facts={{
					name: ph.name,
					photos: ph.docs.length,
				}}
				errors={ph.errors}
				onDismissError={() => ph.dismissErrors()}
				picked={picked}
				onPicked={setPicked}
				onOpen={openPicker}
				onFiles={add}
			/>
		</div>
	);
}
