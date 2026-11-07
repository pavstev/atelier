// The stage: the bare photo (or white Paper) with one see-through canvas for the base, Edges and Grid, in a
// zoomable and movable frame. With no photo it is a drop zone.
import { Button } from "@heroui/react";
import { useEffect, useRef } from "react";
import { PAPER, STAGE_IDS, type StageId } from "@/features/tools/settings";
import { useFileDrop } from "@/ui/useFileDrop";
import type { useViewport } from "./useViewport";

type Props = {
	photo: ImageData | null;
	/** The picture and opacity (percent) of each layer that is on and drawn. */
	layers: Record<StageId, { image: ImageData; opacity: number } | null>;
	/** The Paper base: white in place of the photo, until the photo button is held. */
	paper: boolean;
	/** The photo button is held: every layer is hidden. */
	hold: boolean;
	viewport: ReturnType<typeof useViewport>;
	onOpen: () => void;
	onFiles: (files: File[]) => void;
};

function Paint({
	image,
	testid,
	style,
	label,
}: {
	image: ImageData;
	testid: string;
	label: string;
	style: React.CSSProperties;
}) {
	const ref = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		const c = ref.current;
		if (!c) return;
		c.width = image.width;
		c.height = image.height;
		c.getContext("2d")?.putImageData(image, 0, 0);
	}, [image]);
	return (
		<canvas
			ref={ref}
			data-testid={testid}
			aria-label={label}
			className="pointer-events-none absolute inset-0 size-full"
			style={style}
		/>
	);
}

export default function Stage({
	photo,
	layers,
	paper,
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
						background: paper && !hold ? PAPER : undefined,
						transform: `translate(${v.x}px, ${v.y}px) scale(${v.zoom})`,
					}}
				>
					<Paint
						image={photo}
						testid="photo-canvas"
						label="Photo"
						style={{
							zIndex: 0,
							visibility: paper && !hold ? "hidden" : "visible",
						}}
					/>
					{STAGE_IDS.map((id, z) => {
						const l = layers[id];
						return l ? (
							<Paint
								key={id}
								image={l.image}
								testid={`layer-canvas-${id}`}
								label={`${id} layer`}
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
						<Button variant="primary" onPress={onOpen}>
							Add photos
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
