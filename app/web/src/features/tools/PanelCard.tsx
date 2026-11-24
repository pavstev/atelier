// The head and the body of a tool card in one file, so `ToolCard.tsx` can load them as one lazy chunk.
import { ToolBody, type ToolCardProps, ToolHead } from "./Panel";

export default function PanelCard(p: ToolCardProps) {
	return (
		<>
			<ToolHead {...p} />
			<ToolBody {...p} />
		</>
	);
}
