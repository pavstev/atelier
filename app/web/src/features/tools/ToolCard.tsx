// The tool cards of the bottom bar as lazy chunks: the body of Base, Edges and Grid (`Panel.tsx`) and
// the Paper card (`features/size`) load the first time a card opens, not with the first paint. The
// fallback holds the card's width and a floor of its height, so the card does not jump much.
import { lazy, Suspense } from "react";
import type { PencilExtras } from "@/features/pencil/usePencilExtras";
import { LoadBoundary } from "@/ui/LoadBoundary";
import type { Look, StageId } from "./settings";

const Panel = lazy(() => import("./PanelCard"));
const Size = lazy(() => import("@/features/size/SizeCard"));

/** An empty card of about the right height while the chunk loads. */
const Hold = (p: { rows: number }) => (
	<div
		aria-hidden
		style={{ minHeight: `calc(${p.rows} * var(--icon-btn-bar))` }}
	/>
);

/** The head and body of one of the tools Base, Edges and Grid. */
export function ToolCard(p: {
	id: StageId;
	look: Look;
	onLook: (f: (s: Look) => Look) => void;
	extras: PencilExtras;
	/** A paper is set (a photo is open), so the Grid can count in cm. */
	paper: boolean;
}) {
	return (
		<LoadBoundary>
			<Suspense fallback={<Hold rows={p.id === "base" ? 3 : 6} />}>
				<Panel {...p} />
			</Suspense>
		</LoadBoundary>
	);
}

/** The Paper card. */
export function SizeCardLazy(p: React.ComponentProps<typeof Size>) {
	return (
		<LoadBoundary>
			<Suspense fallback={<Hold rows={8} />}>
				<Size {...p} />
			</Suspense>
		</LoadBoundary>
	);
}
