// The color picker over the stage. While it is on, the cursor is a crosshair and a card follows the
// mouse: the color under it on the left (the top half is the photo, the bottom half is what the
// recipe makes) and, on the right, how much white, yellow, red, blue and black to mix for it. A
// click or a tap pins the card to that spot of the photo (it stays there while you zoom or move the
// photo); the next click moves it; Esc lets it go. The card reads the shown picture, whatever the
// base is, so it works in Values and Shapes too. A drag still moves the photo.
import { type RefObject, useEffect, useState } from "react";
import type { StageId } from "@/features/tools/settings";
import { type Mix, mixFor, PAINTS, type Rgb } from "./mix";
import { colorAt } from "./sample";

type Layers = Record<StageId, { image: ImageData; opacity: number } | null>;

/** A press that moves more than this, in px, is a drag and not a click. */
const TAP_SLOP = 8;
/** The card's room, in px, for flipping it away from the edge. */
const CARD_W = 272;
const CARD_H = 196;
/** The gap between the cursor and the card, in px. */
const GAP = 18;

const css = (c: Rgb) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
const hex = (c: Rgb) =>
	`#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;

type Spot = { x: number; y: number };

export default function Picker(p: {
	/** The stage box: the mouse and the touches are read from it. */
	box: RefObject<HTMLElement | null>;
	photo: ImageData;
	layers: Layers;
	paper: boolean;
	hold: boolean;
	/** The view of the photo: where it sits in the box and how big. */
	view: { zoom: number; x: number; y: number };
}) {
	const { box, photo, layers, paper, hold, view } = p;
	// the mouse, in px from the top left of the box
	const [mouse, setMouse] = useState<Spot | null>(null);
	// the pinned spot, in photo pixels
	const [pin, setPin] = useState<Spot | null>(null);

	useEffect(() => {
		const el = box.current;
		if (!el) return;
		const local = (e: PointerEvent): Spot => {
			const r = el.getBoundingClientRect();
			return { x: e.clientX - r.left, y: e.clientY - r.top };
		};
		const was = el.style.cursor;
		el.style.cursor = "crosshair";
		let down: Spot | null = null;
		const onMove = (e: PointerEvent) => {
			if (e.pointerType === "mouse") setMouse(local(e));
		};
		const onLeave = () => setMouse(null);
		const onDown = (e: PointerEvent) => {
			down = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
		};
		const onUp = (e: PointerEvent) => {
			if (!down) return;
			const far = Math.hypot(e.clientX - down.x, e.clientY - down.y) > TAP_SLOP;
			down = null;
			if (far) return;
			const s = local(e);
			setPin({ x: (s.x - view.x) / view.zoom, y: (s.y - view.y) / view.zoom });
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setPin(null);
		};
		el.addEventListener("pointermove", onMove);
		el.addEventListener("pointerleave", onLeave);
		el.addEventListener("pointerdown", onDown);
		el.addEventListener("pointerup", onUp);
		window.addEventListener("keydown", onKey);
		return () => {
			el.style.cursor = was;
			el.removeEventListener("pointermove", onMove);
			el.removeEventListener("pointerleave", onLeave);
			el.removeEventListener("pointerdown", onDown);
			el.removeEventListener("pointerup", onUp);
			window.removeEventListener("keydown", onKey);
		};
	}, [box, view.x, view.y, view.zoom]);

	// where the card points on the screen, and which photo pixel is under it
	const at: Spot | null = pin
		? { x: view.x + pin.x * view.zoom, y: view.y + pin.y * view.zoom }
		: mouse;
	const photoAt: Spot | null =
		pin ??
		(mouse
			? { x: (mouse.x - view.x) / view.zoom, y: (mouse.y - view.y) / view.zoom }
			: null);
	if (!at || !photoAt) return null;
	const color = colorAt(photo, layers, paper, hold, photoAt.x, photoAt.y);
	if (!color) return null;

	const room = box.current;
	const left =
		room && at.x + GAP + CARD_W > room.clientWidth
			? at.x - GAP - CARD_W
			: at.x + GAP;
	const top =
		room && at.y + GAP + CARD_H > room.clientHeight
			? at.y - GAP - CARD_H
			: at.y + GAP;

	return (
		<div className="pointer-events-none absolute inset-0 z-(--z-stage) overflow-hidden">
			{pin && (
				<span
					aria-hidden="true"
					data-testid="picker-mark"
					className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1.5px_#000]"
					style={{ left: at.x, top: at.y }}
				/>
			)}
			<Card
				color={color}
				pinned={pin !== null}
				style={{ left: Math.max(4, left), top: Math.max(4, top) }}
			/>
		</div>
	);
}

function Card(p: { color: Rgb; pinned: boolean; style: React.CSSProperties }) {
	const mix: Mix = mixFor(p.color);
	const used = PAINTS.map((paint, i) => ({
		paint,
		share: mix.weights[i] as number,
		parts: mix.parts[i] as number,
	}));
	const words = used
		.filter((u) => u.parts > 0)
		.map((u) => `${u.parts} ${u.paint.name.toLowerCase()}`)
		.join(", ");
	return (
		<div
			data-testid="picker-card"
			data-pinned={p.pinned}
			data-color={hex(p.color)}
			data-mix={hex(mix.result)}
			role={p.pinned ? "status" : undefined}
			aria-hidden={p.pinned ? undefined : true}
			className="floating-card absolute flex w-68 gap-3 rounded-(--radius-card) p-3 text-xs"
			style={p.style}
		>
			<div className="flex w-14 shrink-0 flex-col gap-1">
				<div className="overflow-hidden rounded-(--radius-chip) border border-separator">
					<div
						data-testid="picker-swatch"
						className="h-9"
						style={{ backgroundColor: css(p.color) }}
					/>
					<div
						data-testid="picker-result"
						className="h-9"
						style={{ backgroundColor: css(mix.result) }}
					/>
				</div>
				<span className="font-mono text-[0.65rem] leading-tight text-muted">
					{hex(p.color)}
				</span>
				<span className="text-[0.65rem] leading-tight text-muted">
					{mix.error < 3 ? "close match" : "nearest mix"}
				</span>
			</div>
			<div className="flex min-w-0 flex-1 flex-col gap-1.5">
				<ul className="flex flex-col gap-1" aria-label="Paint mix">
					{used.map(({ paint, share, parts }) => (
						<li
							key={paint.id}
							data-testid={`picker-${paint.id}`}
							data-share={share.toFixed(3)}
							data-parts={parts}
							className="flex items-center gap-1.5"
						>
							<span
								aria-hidden="true"
								className="size-3 shrink-0 rounded-full border border-separator"
								style={{ backgroundColor: css(paint.rgb) }}
							/>
							<span className="w-11 shrink-0">{paint.name}</span>
							<span className="h-1.5 flex-1 overflow-hidden rounded-full bg-default">
								<span
									className="block h-full rounded-full"
									style={{
										width: `${Math.round(share * 100)}%`,
										backgroundColor: css(paint.rgb),
										boxShadow: "inset 0 0 0 1px rgb(0 0 0 / 0.25)",
									}}
								/>
							</span>
							<span className="w-8 shrink-0 text-end tabular-nums">
								{Math.round(share * 100)}%
							</span>
						</li>
					))}
				</ul>
				<p data-testid="picker-parts" className="text-muted">
					{words ? `Parts: ${words}` : ""}
				</p>
				{!p.pinned && <p className="text-muted">Click to hold this color.</p>}
			</div>
		</div>
	);
}
