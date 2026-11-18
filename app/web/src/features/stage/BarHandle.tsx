// The grip at the right end of the bottom bar. Drag it left or right to move the whole bar along
// the stage; it stays inside the free stage (right of the open side panel). While you drag, the place goes straight to a CSS variable on
// the bar's frame, once per frame (see `useFrameDrag`), so React does not render for each move; when you let go the place
// is saved (`barPlace.ts`). A double click, or Home, puts the bar back in the middle. The arrow keys
// move it 2 percent. On a phone the bar stays in the middle and the grip is hidden.
import { type RefObject, useRef } from "react";
import { Icon, Tip } from "@/ui/icons";
import { useFrameDrag } from "@/ui/useFrameDrag";
import { BAR_START, clampCenter, shareOf } from "./barPlace";

/** The room kept between the bar and the stage edge, in px. */
export const BAR_EDGE = 8;
const KEY_STEP = 0.02;

/**
 * The CSS `left` of the bar's center for a share of the free stage (the stage right of the open side
 * panel, `--free-left` from `StageArea`), kept inside the window and, when it fits, off the panel.
 */
export const barLeft = (x: number) =>
	`min(calc(100% - var(--bar-w, 0px) / 2 - ${BAR_EDGE}px), max(calc(var(--free-left, 0px) + var(--bar-w, 0px) / 2 + ${BAR_EDGE}px), calc(var(--free-left, 0px) + (100% - var(--free-left, 0px)) * ${x})))`;

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
		center: number;
		now: number;
		moved: boolean;
	} | null>(null);

	/** The stage width, where its free part starts (right of the open panel), the bar width and the
	 * bar center (px from the stage's left edge). */
	const measure = () => {
		const el = p.frame.current;
		const stage = el?.parentElement;
		if (!el || !stage) return null;
		const b = el.getBoundingClientRect();
		const s = stage.getBoundingClientRect();
		const free = Number.parseFloat(
			getComputedStyle(stage).getPropertyValue("--free-left"),
		);
		return {
			bar: b.width,
			stage: s.width,
			free: Number.isFinite(free) ? free : 0,
			center: b.left + b.width / 2 - s.left,
		};
	};
	const commit = (x: number) => {
		p.frame.current?.style.setProperty("--bar-left", barLeft(x));
		p.onCommit(x);
	};

	const grip = useFrameDrag({
		onMove: (dx) => {
			const d = drag.current;
			const m = measure();
			if (!d || !m) return;
			// the open card closes when the bar really starts to move, not on a plain click
			if (!d.moved && Math.abs(dx) >= 3) {
				d.moved = true;
				p.onStart();
			}
			if (!d.moved) return;
			d.now = clampCenter(d.center + dx, m.bar, m.stage, BAR_EDGE, m.free);
			p.frame.current?.style.setProperty(
				"--bar-left",
				barLeft(shareOf(d.now, m.stage, m.free)),
			);
		},
		onEnd: () => {
			const d = drag.current;
			const m = measure();
			drag.current = null;
			if (d && m && d.moved) commit(shareOf(d.now, m.stage, m.free));
		},
		onCancel: () => {
			drag.current = null;
			p.frame.current?.style.setProperty("--bar-left", barLeft(p.x));
		},
	});

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
					drag.current = { center: m.center, now: m.center, moved: false };
					grip.onPointerDown(e);
				}}
				onDoubleClick={() => commit(BAR_START)}
			>
				<Icon name="grip" size="row" />
			</div>
		</Tip>
	);
}
