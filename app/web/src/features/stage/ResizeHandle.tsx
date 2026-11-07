// The thin drag handle on the right edge of the side panel. While you drag, the width goes straight
// to a CSS variable on the window root, once per frame, so React does not render for each move;
// when you let go the width is saved. A double click sets the start width again.
import { useRef } from "react";

export default function ResizeHandle(p: {
	/** The window root that holds the width variables. */
	root: React.RefObject<HTMLElement | null>;
	/** The CSS variable that holds the width (`--left-w`). */
	variable: string;
	width: number;
	min: number;
	max: number;
	onCommit: (width: number) => void;
	onReset: () => void;
}) {
	const drag = useRef<{ x: number; w: number; now: number } | null>(null);
	const frame = useRef(0);
	// The panel is also capped at half of the window (see `PanelShell`), so the limit follows it.
	const clamp = (w: number) =>
		Math.round(
			Math.min(
				Math.max(p.min, Math.min(p.max, window.innerWidth * 0.5)),
				Math.max(p.min, w),
			),
		);
	/** Arrow keys move 16 px, Home and End jump to the limits. */
	const onKey = (e: React.KeyboardEvent) => {
		let w: number | null = null;
		if (e.key === "ArrowRight") w = p.width + 16;
		else if (e.key === "ArrowLeft") w = p.width - 16;
		else if (e.key === "Home") w = p.min;
		else if (e.key === "End") w = p.max;
		if (w === null) return;
		e.preventDefault();
		const next = clamp(w);
		p.root.current?.style.setProperty(p.variable, `${next}px`);
		if (next !== p.width) p.onCommit(next);
	};

	const paint = () => {
		frame.current = 0;
		const d = drag.current;
		if (d) p.root.current?.style.setProperty(p.variable, `${d.now}px`);
	};

	return (
		// biome-ignore lint/a11y/useSemanticElements: a draggable separator, not a rule between blocks
		<div
			role="separator"
			aria-orientation="vertical"
			tabIndex={0}
			onKeyDown={onKey}
			aria-label="Resize the side panel"
			aria-valuenow={p.width}
			aria-valuemin={p.min}
			aria-valuemax={p.max}
			data-testid="files-resize"
			className="atelier-focus group/resize absolute inset-y-0 left-0 z-(--z-popup) w-2 -translate-x-1/2 cursor-col-resize touch-none select-none max-md:hidden"
			onPointerDown={(e) => {
				if (e.button !== 0) return;
				e.currentTarget.setPointerCapture(e.pointerId);
				drag.current = { x: e.clientX, w: p.width, now: p.width };
				document.body.style.cursor = "col-resize";
				e.preventDefault();
			}}
			onPointerMove={(e) => {
				const d = drag.current;
				if (!d) return;
				const dx = e.clientX - d.x;
				d.now = clamp(d.w + dx);
				if (!frame.current) frame.current = requestAnimationFrame(paint);
			}}
			onPointerUp={(e) => {
				const d = drag.current;
				if (!d) return;
				drag.current = null;
				document.body.style.cursor = "";
				e.currentTarget.releasePointerCapture(e.pointerId);
				if (frame.current) cancelAnimationFrame(frame.current);
				frame.current = 0;
				p.root.current?.style.setProperty(p.variable, `${d.now}px`);
				if (d.now !== p.width) p.onCommit(d.now);
			}}
			onPointerCancel={() => {
				drag.current = null;
				document.body.style.cursor = "";
				p.root.current?.style.setProperty(p.variable, `${p.width}px`);
			}}
			onDoubleClick={p.onReset}
		>
			<span className="pointer-events-none mx-auto block h-full w-0.5 bg-transparent transition-colors group-hover/resize:bg-accent/60 group-active/resize:bg-accent" />
		</div>
	);
}
