// The head and the body of a tool card in one file, so `ToolCard.tsx` can load them as one lazy chunk.
import type { PencilExtras } from "@/features/pencil/usePencilExtras";
import { ToolBody, ToolHead } from "./Panel";
import type { Look, StageId } from "./settings";

export default function PanelCard(p: {
	id: StageId;
	look: Look;
	onLook: (f: (s: Look) => Look) => void;
	extras: PencilExtras;
	/** A paper is set (a photo is open), so the Grid can count in cm. */
	paper: boolean;
}) {
	return (
		<>
			<ToolHead id={p.id} look={p.look} onLook={p.onLook} />
			<ToolBody
				id={p.id}
				look={p.look}
				onLook={p.onLook}
				extras={p.extras}
				paper={p.paper}
			/>
		</>
	);
}
