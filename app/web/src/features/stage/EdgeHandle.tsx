// The handle on the right edge of the glass side panel (the left edge of the window when the panel is
// hidden) that hides or shows it: a small round button just right of the panel edge, off the resize
// line so a drag that starts on the middle of the edge still resizes. It fades in when the pointer is
// near the edge, and stays when the panel is hidden.
import { IconButton } from "@/ui/icons";

export default function EdgeHandle(p: {
	/** The panel is hidden. */
	hidden: boolean;
	onToggle: () => void;
}) {
	// the panel folds toward the left; a hidden one opens toward the right
	return (
		<div
			className={`group/edge absolute top-1/2 left-0 z-(--z-drawer) flex h-16 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center ${
				p.hidden
					? ""
					: // right of the resize line (4 px each side of the edge), so a drag on the middle of the edge resizes
						"md:left-[calc(var(--panel-gap)+min(var(--left-w),50vw)+4px)] md:translate-x-0 md:justify-start"
			}`}
		>
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
