// The stage: the bare photo with one see-through canvas for the base and Grid, in a
// zoomable and movable frame. With no photo it is a drop zone.
import { Button } from "@heroui/react";
import { useEffect, useRef, useState } from "react";
import { type Layers, STAGE_IDS } from "@/features/tools/settings";
import { useFileDrop } from "@/ui/useFileDrop";
import { downscale, smoothTarget } from "./smooth";
import type { useViewport } from "./useViewport";

type Props = {
	photo: ImageData | null;
	/** The picture and opacity (percent) of each layer that is on and drawn. */
	layers: Layers;
	/** The photo button is held: every layer is hidden. */
	hold: boolean;
	viewport: ReturnType<typeof useViewport>;
	onOpen: () => void;
	onFiles: (files: File[]) => void;
};

/** How long the zoom must stay in one size step before the smooth copy is made again. */
const SMOOTH_MS = 150;

/** The wanted copy size once it has held for SMOOTH_MS; null at once when no copy is wanted. */
function useSettled(want: { width: number; height: number } | null) {
	const [seen, setSeen] = useState<{ width: number; height: number } | null>(
		null,
	);
	const w = want?.width ?? 0;
	const h = want?.height ?? 0;
	useEffect(() => {
		if (w === 0) {
			setSeen(null);
			return;
		}
		const timer = setTimeout(() => setSeen({ width: w, height: h }), SMOOTH_MS);
		return () => clearTimeout(timer);
	}, [w, h]);
	return want ? seen : null;
}

/**
 * One canvas of the stage at the picture's own size. With `smooth` set (the photo and the base, not
 * the thin lines of the Grid) a second, smaller canvas holds a smoothly halved copy; it is shown
 * in place of the full canvas while the picture is shown below half its size (`smooth.ts`). The full
 * canvas stays in the page with all its pixels. `shownWidth` is the CSS width of the whole picture.
 */
function Paint({
	image,
	testid,
	style,
	label,
	smooth,
	shownWidth,
}: {
	image: ImageData;
	testid: string;
	label: string;
	style: React.CSSProperties;
	smooth?: string;
	shownWidth: number;
}) {
	const ref = useRef<HTMLCanvasElement>(null);
	const copy = useRef<HTMLCanvasElement>(null);
	/** The picture the copy holds; a copy of an older picture is never shown. */
	const [made, setMade] = useState<ImageData | null>(null);
	const target = useSettled(
		smooth
			? smoothTarget(image, shownWidth, window.devicePixelRatio || 1)
			: null,
	);
	const tw = target?.width ?? 0;
	const th = target?.height ?? 0;
	useEffect(() => {
		const c = ref.current;
		if (!c) return;
		c.width = image.width;
		c.height = image.height;
		c.getContext("2d")?.putImageData(image, 0, 0);
	}, [image]);
	// after the full canvas is painted: the copy is made when the picture or the size step changes
	useEffect(() => {
		const c = ref.current;
		const s = copy.current;
		if (!c || !s || tw === 0) return;
		downscale(c, s, tw, th);
		setMade(image);
	}, [image, tw, th]);
	const show = tw > 0 && made === image;
	return (
		<>
			<canvas
				ref={ref}
				data-testid={testid}
				aria-label={label}
				className="pointer-events-none absolute inset-0 size-full"
				style={{ ...style, opacity: show ? 0 : style.opacity }}
			/>
			{smooth ? (
				<canvas
					ref={copy}
					data-testid={smooth}
					className="pointer-events-none absolute inset-0 size-full"
					style={{ ...style, opacity: show ? style.opacity : 0 }}
				/>
			) : null}
		</>
	);
}

export default function Stage({
	photo,
	layers,
	hold,
	viewport,
	onOpen,
	onFiles,
}: Props) {
	const drop = useFileDrop(onFiles);
	const { view: v } = viewport;

	return (
		// biome-ignore lint/a11y/useSemanticElements: a drag and zoom area, not a form group
		<div
			data-testid="stage"
			role="group"
			aria-label="Photo stage"
			ref={viewport.box}
			className={`relative size-full select-none overflow-hidden bg-default ${
				photo
					? "cursor-grab touch-none overscroll-contain active:cursor-grabbing"
					: ""
			} ${drop.over ? "ring-2 ring-inset ring-accent" : ""}`}
			{...drop.props}
			{...(photo ? viewport.pointer : {})}
		>
			{photo ? (
				<div
					className="absolute top-0 left-0 origin-top-left shadow-(--shadow-photo)"
					style={{
						width: photo.width,
						height: photo.height,
						transform: `translate(${v.x}px, ${v.y}px) scale(${v.zoom})`,
					}}
				>
					<Paint
						image={photo}
						testid="photo-canvas"
						label="Photo"
						smooth="smooth-photo"
						shownWidth={photo.width * v.zoom}
						style={{ zIndex: 0 }}
					/>
					{STAGE_IDS.map((id, z) => {
						const l = layers[id];
						return l ? (
							<Paint
								key={id}
								image={l.image}
								testid={`layer-canvas-${id}`}
								label={`${id} layer`}
								smooth={id === "base" ? "smooth-base" : undefined}
								shownWidth={photo.width * v.zoom}
								style={{
									zIndex: z + 1,
									opacity: l.opacity / 100,
									visibility: hold ? "hidden" : "visible",
								}}
							/>
						) : null;
					})}
				</div>
			) : (
				<div className="absolute inset-0 grid place-items-center">
					<div className="flex max-w-sm flex-col items-center gap-3 text-center">
						<h2 className="text-lg font-semibold">
							Study a photo like a painter.
						</h2>
						<p className="text-sm text-muted">
							Drop photos here, or add some. It stays in your browser. Nothing
							is uploaded.
						</p>
						<Button variant="primary" onPress={onOpen} data-testid="add-photos">
							Add photos
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
