// The grip at the right end of the bottom bar. Drag it left or right to move the whole bar along
// the stage; it stays inside the stage. While you drag, the place goes straight to a CSS variable on
// the bar's frame, once per frame, so React does not render for each move; when you let go the place
// is saved (`barPlace.ts`). A double click, or Home, puts the bar back in the middle. The arrow keys
// move it 2 percent. On a phone the bar stays in the middle and the grip is hidden.
import { type RefObject, useRef } from "react";
import { Icon, Tip } from "@/ui/icons";
import { BAR_START, clampCenter } from "./barPlace";

/** The room kept between the bar and the stage edge, in px. */
export const BAR_EDGE = 8;
const KEY_STEP = 0.02;

/** The CSS `left` of the bar's center for a share of the stage, kept inside the stage. */
export const barLeft = (x: number) =>
	`clamp(calc(var(--bar-w, 0px) / 2 + ${BAR_EDGE}px), ${x * 100}%, calc(100% - var(--bar-w, 0px) / 2 - ${BAR_EDGE}px))`;

export default function BarHandle(p: {
	/** The frame of the bar; it holds the variable `--bar-left`. */
	frame: RefObject<HTMLElement | null>;
	/** The place now: the share of the stage width at the bar's center. */
	x: number;
	onCommit: (x: number) => void;
	/** A drag began: the open card closes. */
	onStart: () => void;
}) {
	const drag = useRef<{
		from: number;
		center: number;
		now: number;
		moved: boolean;
	} | null>(null);
	const frame = useRef(0);

	/** The stage width, the bar width and the bar center (px from the stage's left edge). */
	const measure = () => {
		const el = p.frame.current;
		const stage = el?.parentElement;
		if (!el || !stage) return null;
		const b = el.getBoundingClientRect();
		const s = stage.getBoundingClientRect();
		return {
			bar: b.width,
			stage: s.width,
			center: b.left + b.width / 2 - s.left,
		};
	};
	const paint = () => {
		frame.current = 0;
		const d = drag.current;
		const m = measure();
		if (d && m)
			p.frame.current?.style.setProperty(
				"--bar-left",
				barLeft(d.now / m.stage),
			);
	};
	const commit = (x: number) => {
		p.frame.current?.style.setProperty("--bar-left", barLeft(x));
		p.onCommit(x);
	};

	return (
		<Tip
			text="Drag to move the bar. Double click for the middle."
			placement="top"
		>
			<div
				role="slider"
				tabIndex={0}
				aria-label="Move the bar"
				aria-orientation="horizontal"
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={Math.round(p.x * 100)}
				data-testid="bar-handle"
				className="atelier-focus flex h-(--icon-btn-bar) w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded-full text-muted select-none hover:text-foreground active:cursor-grabbing max-md:hidden"
				onKeyDown={(e) => {
					let x: number | null = null;
					if (e.key === "ArrowLeft") x = p.x - KEY_STEP;
					else if (e.key === "ArrowRight") x = p.x + KEY_STEP;
					else if (e.key === "Home") x = BAR_START;
					if (x === null) return;
					e.preventDefault();
					commit(Math.min(1, Math.max(0, x)));
				}}
				onPointerDown={(e) => {
					if (e.button !== 0) return;
					const m = measure();
					if (!m) return;
					e.currentTarget.setPointerCapture(e.pointerId);
					drag.current = {
						from: e.clientX,
						center: m.center,
						now: m.center,
						moved: false,
					};
					document.body.style.cursor = "grabbing";
					e.preventDefault();
				}}
				onPointerMove={(e) => {
					const d = drag.current;
					const m = measure();
					if (!d || !m) return;
					// the open card closes when the bar really starts to move, not on a plain click
					if (!d.moved && Math.abs(e.clientX - d.from) >= 3) {
						d.moved = true;
						p.onStart();
					}
					if (!d.moved) return;
					d.now = clampCenter(
						d.center + e.clientX - d.from,
						m.bar,
						m.stage,
						BAR_EDGE,
					);
					if (!frame.current) frame.current = requestAnimationFrame(paint);
				}}
				onPointerUp={(e) => {
					const d = drag.current;
					const m = measure();
					if (!d) return;
					drag.current = null;
					document.body.style.cursor = "";
					e.currentTarget.releasePointerCapture(e.pointerId);
					if (frame.current) cancelAnimationFrame(frame.current);
					frame.current = 0;
					if (m && d.moved) commit(d.now / m.stage);
				}}
				onPointerCancel={() => {
					drag.current = null;
					document.body.style.cursor = "";
					p.frame.current?.style.setProperty("--bar-left", barLeft(p.x));
				}}
				onDoubleClick={() => commit(BAR_START)}
			>
				<Icon name="grip" size="row" />
			</div>
		</Tip>
	);
}
