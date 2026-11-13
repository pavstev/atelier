// The color picker over the stage. While it is on, the cursor is a crosshair, a ring shows the area
// that is read, and a card follows the mouse: the color on the left (the top half is the photo, the
// bottom half is what the recipe makes) and, on the right, how much of each paint to mix for it.
// A click or a tap holds the card at that spot of the photo (it stays there while you zoom or move
// the photo). A held card is a real control: copy the recipe, let it go, pick how big an area to
// average. Esc lets it go. A swatch of the Values or Shapes legend holds its color in the card too.
// The card reads the shown picture, whatever the base is. A drag still moves the photo.
// Keyboard: the stage takes the focus, the arrow keys move the probe (Shift for big steps) and
// Enter holds the color. A screen reader hears the held recipe as a status message.
import {
	type RefObject,
	useEffect,
	useEffectEvent,
	useId,
	useRef,
	useState,
} from "react";
import type { StageId } from "@/features/tools/settings";
import { Segment } from "@/ui/fields";
import { IconButton } from "@/ui/icons";
import { type Mix, masstone, mixFor, PAINTS, type Rgb } from "./mix";
import { colorAround } from "./sample";

type Layers = Record<StageId, { image: ImageData; opacity: number } | null>;

/** A color held from outside the photo (a legend swatch), with its name for the card. */
export type Fixed = { rgb: Rgb; label: string };

/** How much of the photo is averaged, as a radius in screen px at the moment of the pick. A patch
 * is what a painter matches; a single pixel of a grainy photo is not. */
export const AREAS = [
	{ name: "Point", px: 0 },
	{ name: "Small", px: 6 },
	{ name: "Medium", px: 14 },
	{ name: "Large", px: 30 },
] as const;
export const AREA_START = 1;

/** A press that moves more than this, in px, is a drag and not a click. */
const TAP_SLOP = 8;
/** The card's room, in px, for flipping it away from the edge. */
const CARD_W = 304;
const CARD_H = 290;
/** The gap between the cursor and the card, in px. */
const GAP = 18;
/** A key step of the probe, in px; with Shift the big one. */
const KEY_STEP = 6;
const KEY_BIG = 30;

const css = (c: Rgb) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
const hex = (c: Rgb) =>
	`#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
/** Black or white, whichever reads on this color. */
const ink = (c: Rgb) =>
	0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2] > 140 ? "#000" : "#fff";

type Spot = { x: number; y: number };
/** A held spot: the photo pixel and the radius in photo pixels, so the ring grows with the zoom. */
type Pin = Spot & { r: number };

/** How the match reads: a color difference under 1 cannot be seen, under 3 is close. */
function verdict(error: number): string {
	if (error < 1) return "same to the eye";
	if (error < 3) return "close match";
	return "nearest mix";
}

/** The recipe in words: whole parts first, then a touch of any strong paint too small for a part. */
function recipeWords(mix: Mix): string {
	return [
		...PAINTS.flatMap((p, i) =>
			(mix.parts[i] as number) > 0
				? [`${mix.parts[i]} ${p.name.toLowerCase()}`]
				: [],
		),
		...PAINTS.flatMap((p, i) =>
			(mix.parts[i] as number) === 0 && (mix.weights[i] as number) >= 0.0003
				? [`a touch of ${p.name.toLowerCase()}`]
				: [],
		),
	].join(", ");
}

export default function Picker(p: {
	/** The stage box: the mouse, the touches and the keys are read from it. */
	box: RefObject<HTMLElement | null>;
	photo: ImageData;
	layers: Layers;
	paper: boolean;
	hold: boolean;
	/** The view of the photo: where it sits in the box and how big. */
	view: { zoom: number; x: number; y: number };
	/** A color held from a legend swatch; it takes the card until a click or Esc. */
	fixed: Fixed | null;
	onFixed: (f: Fixed | null) => void;
	/** Index in `AREAS`. */
	area: number;
	onArea: (i: number) => void;
}) {
	const { box, photo, layers, paper, hold, view, fixed, onFixed, area } = p;
	const helpId = useId();
	const card = useRef<HTMLDivElement>(null);
	// the mouse or the keyboard probe, in px from the top left of the box
	const [mouse, setMouse] = useState<Spot | null>(null);
	const [pin, setPin] = useState<Pin | null>(null);
	const [focused, setFocused] = useState(false);
	const [copied, setCopied] = useState<"yes" | "no" | null>(null);

	const radius = () => (AREAS[area]?.px ?? 0) / view.zoom;
	const toPhoto = (s: Spot): Spot => ({
		x: (s.x - view.x) / view.zoom,
		y: (s.y - view.y) / view.zoom,
	});
	const release = () => {
		setPin(null);
		onFixed(null);
	};
	const holdAt = (s: Spot) => {
		setPin({ ...toPhoto(s), r: radius() });
		onFixed(null);
		setCopied(null);
	};

	// the events always read the latest props; the listeners are set once
	const onMove = useEffectEvent((e: PointerEvent, el: HTMLElement) => {
		if (e.pointerType !== "mouse") return;
		const r = el.getBoundingClientRect();
		setMouse({ x: e.clientX - r.left, y: e.clientY - r.top });
	});
	const onTap = useEffectEvent((e: PointerEvent, el: HTMLElement) => {
		const r = el.getBoundingClientRect();
		holdAt({ x: e.clientX - r.left, y: e.clientY - r.top });
	});
	const onEsc = useEffectEvent((e: KeyboardEvent) => {
		if (e.key === "Escape" && (pin || fixed)) release();
	});
	// the probe keys are read on the stage itself, before the page shortcuts (which move the photo)
	const onKey = useEffectEvent((e: KeyboardEvent, el: HTMLElement) => {
		if (e.target !== el || e.ctrlKey || e.metaKey || e.altKey) return;
		const arrows: Record<string, [number, number]> = {
			ArrowLeft: [-1, 0],
			ArrowRight: [1, 0],
			ArrowUp: [0, -1],
			ArrowDown: [0, 1],
		};
		const at = mouse ?? { x: el.clientWidth / 2, y: el.clientHeight / 2 };
		if (e.key in arrows) {
			e.preventDefault();
			const [dx, dy] = arrows[e.key] as [number, number];
			const step = e.shiftKey ? KEY_BIG : KEY_STEP;
			setMouse({
				x: Math.min(el.clientWidth, Math.max(0, at.x + dx * step)),
				y: Math.min(el.clientHeight, Math.max(0, at.y + dy * step)),
			});
		} else if (e.key === "Enter") {
			e.preventDefault();
			setMouse(at);
			holdAt(at);
		}
	});

	useEffect(() => {
		const el = box.current;
		if (!el) return;
		const was = {
			cursor: el.style.cursor,
			tabindex: el.getAttribute("tabindex"),
			describedby: el.getAttribute("aria-describedby"),
		};
		el.style.cursor = "crosshair";
		el.tabIndex = 0;
		el.setAttribute("aria-describedby", helpId);
		let down: Spot | null = null;
		const move = (e: PointerEvent) => onMove(e, el);
		const leave = () => setMouse(null);
		const press = (e: PointerEvent) => {
			down = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
		};
		const lift = (e: PointerEvent) => {
			if (!down) return;
			const far = Math.hypot(e.clientX - down.x, e.clientY - down.y) > TAP_SLOP;
			down = null;
			if (!far) onTap(e, el);
		};
		const key = (e: KeyboardEvent) => onKey(e, el);
		const esc = (e: KeyboardEvent) => onEsc(e);
		const focus = () => setFocused(el.matches(":focus-visible"));
		const blur = () => setFocused(false);
		el.addEventListener("pointermove", move);
		el.addEventListener("pointerleave", leave);
		el.addEventListener("pointerdown", press);
		el.addEventListener("pointerup", lift);
		el.addEventListener("focus", focus);
		el.addEventListener("blur", blur);
		el.addEventListener("keydown", key);
		// capture: a tooltip or a menu that has the focus must not swallow the Esc
		window.addEventListener("keydown", esc, true);
		return () => {
			el.style.cursor = was.cursor;
			if (was.tabindex === null) el.removeAttribute("tabindex");
			else el.setAttribute("tabindex", was.tabindex);
			if (was.describedby === null) el.removeAttribute("aria-describedby");
			else el.setAttribute("aria-describedby", was.describedby);
			el.removeEventListener("pointermove", move);
			el.removeEventListener("pointerleave", leave);
			el.removeEventListener("pointerdown", press);
			el.removeEventListener("pointerup", lift);
			el.removeEventListener("focus", focus);
			el.removeEventListener("blur", blur);
			el.removeEventListener("keydown", key);
			window.removeEventListener("keydown", esc, true);
		};
	}, [box, helpId]);

	// a color from the legend takes the focus to the card, so a screen reader reads it
	// (after the open card has given back its focus to its button)
	useEffect(() => {
		if (!fixed) return;
		const id = requestAnimationFrame(() => card.current?.focus());
		return () => cancelAnimationFrame(id);
	}, [fixed]);

	// what the card shows: a legend color, a held spot, or the spot under the mouse
	let color: Rgb | null = null;
	let at: Spot | null = null;
	let ring = 0;
	let title = "Paint mix";
	if (fixed) {
		color = fixed.rgb;
		title = `Paint mix · ${fixed.label}`;
	} else if (pin) {
		color = colorAround(photo, layers, paper, hold, pin.x, pin.y, pin.r);
		at = { x: view.x + pin.x * view.zoom, y: view.y + pin.y * view.zoom };
		ring = pin.r * view.zoom;
	} else if (mouse) {
		const s = toPhoto(mouse);
		color = colorAround(photo, layers, paper, hold, s.x, s.y, radius());
		at = mouse;
		ring = AREAS[area]?.px ?? 0;
	}
	const mix = color ? mixFor(color) : null;
	const pinned = pin !== null || fixed !== null;
	const summary =
		color && mix
			? `${title}, color ${hex(color)}: ${recipeWords(mix) || "white"}. ${verdict(mix.error)}.`
			: "";

	const room = box.current;
	let style: React.CSSProperties | null = null;
	if (fixed) style = { right: 12, top: 12 };
	else if (at) {
		const left =
			room && at.x + GAP + CARD_W > room.clientWidth
				? at.x - GAP - CARD_W
				: at.x + GAP;
		const top =
			room && at.y + GAP + CARD_H > room.clientHeight
				? at.y - GAP - CARD_H
				: at.y + GAP;
		style = { left: Math.max(4, left), top: Math.max(4, top) };
	}

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(summary);
			setCopied("yes");
		} catch {
			setCopied("no");
		}
	};

	return (
		<div className="pointer-events-none absolute inset-0 z-(--z-stage) overflow-hidden">
			<p id={helpId} className="sr-only">
				Color picker is on. Point at the photo to see the paint mix of a color.
				Click, or press Enter, to hold it. Arrow keys move the probe, with Shift
				in bigger steps. Escape lets it go.
			</p>
			<p role="status" className="sr-only">
				{pinned ? summary : ""}
				{copied === "yes" ? " Copied." : ""}
				{copied === "no" ? " The copy did not work." : ""}
			</p>
			{focused && (
				<div
					aria-hidden="true"
					className="absolute inset-0 ring-2 ring-accent ring-inset"
				/>
			)}
			{at && !fixed && (
				<span
					aria-hidden="true"
					data-testid={pin ? "picker-mark" : "picker-ring"}
					className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1.5px_#000]"
					style={{
						left: at.x,
						top: at.y,
						width: Math.max(12, ring * 2),
						height: Math.max(12, ring * 2),
					}}
				/>
			)}
			{color && mix && style && (
				<Card
					ref={card}
					color={color}
					mix={mix}
					pinned={pinned}
					title={title}
					style={style}
					copied={copied}
					onCopy={copy}
					onRelease={release}
					area={fixed ? null : area}
					onArea={(i) => {
						p.onArea(i);
						// the held ring takes the new size at the zoom of now
						if (pin) setPin({ ...pin, r: (AREAS[i]?.px ?? 0) / view.zoom });
					}}
				/>
			)}
		</div>
	);
}

/** The dot and bar color of each paint: the paint on its own, as the model sees it. */
const DOTS = PAINTS.map((_, i) => masstone(i));

function Card(p: {
	ref: RefObject<HTMLDivElement | null>;
	color: Rgb;
	mix: Mix;
	pinned: boolean;
	title: string;
	style: React.CSSProperties;
	copied: "yes" | "no" | null;
	onCopy: () => void;
	onRelease: () => void;
	/** Index in `AREAS`; null when the color did not come from the photo. */
	area: number | null;
	onArea: (i: number) => void;
}) {
	const { mix } = p;
	const words = recipeWords(mix);
	const used = PAINTS.map((paint, i) => ({
		paint,
		dot: DOTS[i] as Rgb,
		share: mix.weights[i] as number,
		parts: mix.parts[i] as number,
	}));
	return (
		// biome-ignore lint/a11y/useSemanticElements: a floating card, not a form group
		<div
			ref={p.ref}
			role="group"
			aria-label={p.title}
			tabIndex={p.pinned ? -1 : undefined}
			aria-hidden={p.pinned ? undefined : true}
			data-testid="picker-card"
			data-pinned={p.pinned}
			data-color={hex(p.color)}
			data-mix={hex(mix.result)}
			data-error={mix.error.toFixed(2)}
			className={`floating-card absolute flex w-76 flex-col gap-2 rounded-(--radius-card) p-3 text-xs outline-none ${p.pinned ? "pointer-events-auto" : ""}`}
			style={p.style}
		>
			<div className="flex min-h-6 items-center justify-between gap-2">
				<h3 className="text-xs font-semibold">{p.title}</h3>
				{p.pinned && (
					<div className="flex items-center gap-1">
						{p.copied && (
							<span
								data-testid="picker-copied"
								className="text-[0.7rem] text-muted"
							>
								{p.copied === "yes" ? "Copied" : "Could not copy"}
							</span>
						)}
						<IconButton
							icon="copy"
							label="Copy the recipe"
							size="row"
							testid="picker-copy"
							placement="bottom"
							onPress={p.onCopy}
						/>
						<IconButton
							icon="close"
							label="Let go of this color"
							size="row"
							testid="picker-close"
							placement="bottom"
							onPress={p.onRelease}
						/>
					</div>
				)}
			</div>
			<div className="flex gap-3">
				<div className="flex w-14 shrink-0 flex-col gap-1">
					<div className="overflow-hidden rounded-(--radius-chip) border border-separator">
						<div
							data-testid="picker-swatch"
							className="flex h-9 items-end px-1 pb-0.5 text-[0.6rem] leading-none"
							style={{ backgroundColor: css(p.color), color: ink(p.color) }}
						>
							Photo
						</div>
						<div
							data-testid="picker-result"
							className="flex h-9 items-end px-1 pb-0.5 text-[0.6rem] leading-none"
							style={{
								backgroundColor: css(mix.result),
								color: ink(mix.result),
							}}
						>
							Mix
						</div>
					</div>
					<span className="font-mono text-[0.65rem] leading-tight text-muted">
						{hex(p.color)}
					</span>
					<span
						data-testid="picker-verdict"
						className="text-[0.65rem] leading-tight text-muted"
					>
						{verdict(mix.error)}
					</span>
				</div>
				<div className="flex min-w-0 flex-1 flex-col gap-1.5">
					<ul className="flex flex-col gap-1" aria-label="Paint mix">
						{used.map(({ paint, dot, share, parts }) => (
							<li
								key={paint.id}
								data-testid={`picker-${paint.id}`}
								data-share={share.toFixed(3)}
								data-parts={parts}
								className={`flex items-center gap-1.5 ${share === 0 ? "text-muted" : ""}`}
							>
								<span
									aria-hidden="true"
									className={`size-3 shrink-0 rounded-full border border-separator ${share === 0 ? "opacity-50" : ""}`}
									style={{ backgroundColor: css(dot) }}
								/>
								<span className="w-[4.6rem] shrink-0">{paint.name}</span>
								<span
									aria-hidden="true"
									className="h-1.5 flex-1 overflow-hidden rounded-full bg-default"
								>
									<span
										className="block h-full rounded-full"
										style={{
											width: `${Math.round(share * 100)}%`,
											backgroundColor: css(dot),
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
					<p data-testid="picker-parts" className="font-medium">
						{words ? `Parts: ${words}` : ""}
					</p>
				</div>
			</div>
			{p.pinned ? (
				p.area !== null && (
					<Segment
						bare
						label="Sample area"
						testid="picker-area"
						options={AREAS.map((a) => a.name)}
						value={p.area}
						onChange={p.onArea}
					/>
				)
			) : (
				<p className="text-muted">Click to hold this color. Esc lets it go.</p>
			)}
		</div>
	);
}
