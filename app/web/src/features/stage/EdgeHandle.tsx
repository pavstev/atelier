// The handle on the left edge of the stage that hides or shows the side panel: a small round button
// half over the panel. It fades in when the pointer is near the edge, and stays when the panel is
// hidden.
import { IconButton } from "@/ui/icons";

export default function EdgeHandle(p: {
	/** The panel is hidden. */
	hidden: boolean;
	onToggle: () => void;
}) {
	// the panel folds toward the left; a hidden one opens toward the right
	return (
		<div className="group/edge absolute top-1/2 left-0 z-(--z-drawer) flex h-16 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center">
			<IconButton
				label={`${p.hidden ? "Show" : "Hide"} the side panel`}
				icon={p.hidden ? "right" : "left"}
				size="row"
				variant="secondary"
				placement="right"
				testid={`files-${p.hidden ? "expand" : "fold"}`}
				className={`rounded-full shadow-surface transition-opacity focus-visible:opacity-100 group-hover/edge:opacity-100 ${
					p.hidden ? "translate-x-3 opacity-100" : "opacity-0"
				}`}
				onPress={p.onToggle}
			/>
		</div>
	);
}
