// The legend strip: a glass row of swatches at the top center of the stage,
// below the error banner and the title bar area of an installed app (Window Controls Overlay). It
// holds the legend of Values, Shapes or Pencil (`Swatches.tsx`), stays on one row and scrolls sideways when it is too wide
// (a phone). A swatch press holds its color in the picker card, so the strip needs no card open.
import type { ReactNode } from "react";

export default function LegendStrip(p: { children: ReactNode }) {
	return (
		<div
			data-testid="legend-strip"
			// centered on the free stage (right of the open panel), clear of the Add photo button
			style={{
				top: "calc(env(titlebar-area-height, 0px) + 3.5rem)",
				left: "calc(var(--free-left, 0px) + (100% - var(--free-left, 0px)) / 2)",
				maxWidth:
					"calc(100% - var(--free-left, 0px) - 2 * var(--legend-gap, 0.5rem))",
			}}
			className="absolute z-(--z-bar) max-md:z-(--z-legend) -translate-x-1/2 overflow-x-auto floating-card rounded-(--radius-card) p-1.5"
		>
			{p.children}
		</div>
	);
}
