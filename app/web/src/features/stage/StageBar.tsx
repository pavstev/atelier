// The bar at the bottom center of the stage, left to right: See photo (a tap keeps the bare photo on
// and lights the button, a press over 300 ms peeks while held) | Base, Edges and Grid (Edges and Grid
// are split buttons: the main part switches the layer, the chevron opens its card) | Paper and the
// zoom button | the color picker toggle | the grip. Paper (`features/size`) frames the photo to a paper
// and holds the Real size switch with the screen width. A tool button opens its controls in a card
// over the bar (a bottom sheet on a phone), one card at a time. The picker has no card: it is a
// toggle, and its mix card follows the mouse over the photo (`features/picker`). The zoom button
// shows the zoom now; its menu has Fit, 100%, 200% and "Real size", a toggle that locks the zoom to
// the photo width on the paper (it opens the Paper card when the screen width is not known yet).
// While locked, the button shows a lock and Fit, 100% and 200% are off.
// The grip at the right end drags the bar along the stage; the place is saved (`BarHandle.tsx`).
import { Button, Dropdown, Label } from "@heroui/react";
import { useEffect, useRef, useState } from "react";
import { usePencilAuto } from "@/features/pencil/usePencilAuto";
import { usePencilExtras } from "@/features/pencil/usePencilExtras";
import { shownWidthCm } from "@/features/size/paper";
import SizeCard from "@/features/size/SizeCard";
import type { SizeState } from "@/features/size/useSize";
import { baseName, ToolBody, ToolHead } from "@/features/tools/Panel";
import { GRID_MODE, type Look, type StageId } from "@/features/tools/settings";
import { KEYS, loadJson, useSaved } from "@/lib/storage";
import { Icon, IconButton, type IconName, Tip } from "@/ui/icons";
import BarHandle, { barLeft } from "./BarHandle";
import { BAR_START, cleanBar } from "./barPlace";
import type { Lock } from "./lockZoom";
import Popup from "./Popup";
import { guessScreen } from "./screens";

type Open = StageId | "size" | null;

/** The icon of each base, so the Base button shows the base now on show. */
const BASE_ICON: Record<Look["base"]["kind"], IconName> = {
	photo: "image",
	values: "tones",
	shapes: "shapes",
	paper: "paper",
	pencil: "pen",
};

const STAGE_IDS_IN_BAR: readonly StageId[] = ["base", "edges", "grid"];

export default function StageBar(p: {
	/** Zoom as a factor; 1 is actual pixels. */
	zoom: number;
	lock: Lock;
	onLock: (l: Lock) => void;
	/** See photo goes down (true) or up (false); `seePhoto.ts` tells a tap from a hold. */
	onHold: (down: boolean, completed?: boolean) => void;
	/** The bare photo is kept on after a tap. */
	seeLatched: boolean;
	onFit: () => void;
	/** Zooms to this factor around the center of the stage (1 is 100%). */
	onZoomTo: (zoom: number) => void;
	look: Look;
	onLook: (f: (s: Look) => Look) => void;
	/** The photo on screen: Auto and Suggest of the Pencil card read it. */
	photo: ImageData | null;
	/** The paper or canvas of the photo (the Size card). */
	size: SizeState;
	/** The color picker is on. */
	picking: boolean;
	/** A color just held from the legend: the open card gives way to the picker card. */
	picked: unknown;
	onPicking: (on: boolean) => void;
}) {
	const [open, setOpen] = useState<Open>(null);
	const { lock } = p;
	// the Auto note and the suggested pencils live here, so a closed card keeps them
	const extras = usePencilExtras(p.photo);
	usePencilAuto(p.photo, p.look, p.onLook, extras);
	const found = guessScreen();
	// the See photo press finished on the button (not left or cancelled)
	const pressed = useRef(false);
	// the bar place along the stage, saved so a refresh keeps it
	const frame = useRef<HTMLDivElement>(null);
	const [place, setPlace] = useState(() => ({
		x: loadJson(KEYS.bar, cleanBar, () => BAR_START),
	}));
	useSaved(KEYS.bar, place, 150);
	// the bar's own width, for the keep-inside rule of the place
	useEffect(() => {
		const el = frame.current;
		if (!el) return;
		const ro = new ResizeObserver(() =>
			el.style.setProperty("--bar-w", `${el.offsetWidth}px`),
		);
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	useEffect(() => {
		if (p.picked) setOpen(null);
	}, [p.picked]);

	/** The photo width on the paper in cm, or the lock's own width before a photo is open. */
	const paperW = p.size.whole
		? shownWidthCm(p.size.choice, p.size.whole.width, p.size.whole.height)
		: lock.cm;
	// While the real size is on, the zoom follows the paper: a new paper or cut changes the width
	useEffect(() => {
		if (lock.on && p.size.whole && Math.abs(lock.cm - paperW) > 0.005)
			p.onLock({ ...lock, cm: paperW });
	}, [lock, paperW, p.size.whole, p.onLock]);

	/** The Real size switch of the Paper card and of the zoom menu. Without a screen width the zoom
	 * cannot be real yet, so the Paper card opens to ask for it. */
	const setReal = (on: boolean, cm: number = paperW) => {
		p.onLock({ ...lock, on, cm: on ? cm : lock.cm });
		if (on && lock.screenCm <= 0) setOpen("size");
	};

	const act = (key: string) => {
		if (key === "fit") p.onFit();
		else if (key === "actual") p.onZoomTo(1);
		else if (key === "double") p.onZoomTo(2);
		else if (key === "real") setReal(!lock.on);
		else if (key === "unlock") setReal(false);
	};

	// Pencil is a drawing of its own: Edges is off while it is the base (its saved switch stays)
	const noEdges = p.look.base.kind === "pencil";
	const info: Record<StageId, { label: string; icon: IconName; tip: string }> =
		{
			base: {
				label: "Base",
				icon: BASE_ICON[p.look.base.kind],
				tip: `Base: ${baseName(p.look)}`,
			},
			edges: {
				label: "Edges",
				icon: "edges",
				tip: noEdges ? "Off in Pencil mode" : "Edges",
			},
			grid: { label: "Grid", icon: "grid", tip: "Grid" },
		};

	return (
		<div
			ref={frame}
			data-testid="stage-bar-frame"
			style={{ "--bar-left": barLeft(place.x) } as React.CSSProperties}
			className="absolute bottom-5 left-1/2 z-(--z-bar) max-w-[calc(100%-1rem)] -translate-x-1/2 md:left-(--bar-left)"
		>
			<div
				data-testid="stage-bar"
				className="floating-card flex items-center gap-1 rounded-full p-1"
			>
				<Tip
					text="Tap to keep the bare photo, hold to peek (Space)"
					placement="top"
				>
					<Button
						size="sm"
						variant={p.seeLatched ? "secondary" : "ghost"}
						className="touch-none select-none rounded-full"
						aria-label="See photo"
						aria-pressed={p.seeLatched}
						data-latched={p.seeLatched ? "true" : undefined}
						data-testid="photo-hold"
						onPressStart={() => {
							pressed.current = false;
							p.onHold(true);
						}}
						// onPress comes right after onPressEnd, and only for a press that finished on the
						// button; a leave or a cancel has no onPress, so it only ends the peek
						onPress={() => {
							pressed.current = true;
						}}
						onPressEnd={() =>
							queueMicrotask(() => p.onHold(false, pressed.current))
						}
					>
						<Icon name="eye" />
						<span className="@max-md:sr-only">See photo</span>
					</Button>
				</Tip>
				<span className="h-5 w-px bg-separator" />
				{STAGE_IDS_IN_BAR.map((id) => (
					<Popup
						key={id}
						id={id}
						title={info[id].label}
						open={open === id && !(id === "edges" && noEdges)}
						onOpenChange={(o) => {
							if (id === "edges" && noEdges) return;
							setOpen(o ? id : open === id ? null : open);
						}}
						button={{
							icon: info[id].icon,
							label: info[id].label,
							tip: info[id].tip,
							testid: `tool-${id}`,
							on:
								id === "base"
									? p.look.base.kind !== "photo"
									: p.look[id].on && !(id === "edges" && noEdges),
							disabled: id === "edges" && noEdges,
							onToggle:
								id === "base"
									? undefined
									: () =>
											p.onLook((s) => ({
												...s,
												[id]: { ...s[id], on: !s[id].on },
											})),
						}}
					>
						<ToolHead id={id} look={p.look} onLook={p.onLook} />
						<ToolBody id={id} look={p.look} onLook={p.onLook} extras={extras} />
					</Popup>
				))}
				<span className="h-5 w-px bg-separator" />
				<Popup
					id="size"
					title="Paper"
					open={open === "size"}
					onOpenChange={(o) =>
						setOpen(o ? "size" : open === "size" ? null : open)
					}
					button={{
						icon: "size",
						label: "Paper",
						tip: "Paper: size and real size",
						testid: "tool-size",
						on: p.size.choice.fit,
					}}
				>
					{p.size.whole && (
						<SizeCard
							choice={p.size.choice}
							onChange={p.size.set}
							photoW={p.size.whole.width}
							photoH={p.size.whole.height}
							cells={
								p.look.grid.on && p.look.grid.mode !== GRID_MODE.thirds
									? p.look.grid.cells
									: null
							}
							real={lock.on}
							screenCm={lock.screenCm}
							found={
								found && Math.abs(lock.screenCm - found.cm) < 0.005
									? found.name
									: null
							}
							onReal={(on, cm) => setReal(on, cm)}
							onScreen={(screenCm) => p.onLock({ ...lock, screenCm })}
						/>
					)}
				</Popup>
				<Dropdown onOpenChange={(o) => o && setOpen(null)}>
					<Tip text={lock.on ? "Zoom (locked)" : "Zoom"} placement="top">
						<Button
							size="sm"
							variant={lock.on ? "secondary" : "ghost"}
							className="touch-none gap-1 rounded-full px-2.5 select-none"
							aria-label="Zoom"
							data-testid="zoom-menu"
							data-bar-button
							data-locked={lock.on}
						>
							<span
								data-testid="zoom-percent"
								className="min-w-9 text-center text-xs tabular-nums"
							>
								{Math.round(p.zoom * 100)}%
							</span>
							<Icon name={lock.on ? "lock" : "down"} size="row" />
						</Button>
					</Tip>
					<Dropdown.Popover placement="top">
						<Dropdown.Menu
							aria-label="Zoom"
							onAction={(key) => act(String(key))}
							disabledKeys={lock.on ? ["fit", "actual", "double"] : []}
						>
							<Dropdown.Item id="fit" textValue="Fit" data-testid="zoom-fit">
								<Label>Fit</Label>
							</Dropdown.Item>
							<Dropdown.Item
								id="actual"
								textValue="100%"
								data-testid="zoom-actual"
							>
								<Label>100%</Label>
							</Dropdown.Item>
							<Dropdown.Item
								id="double"
								textValue="200%"
								data-testid="zoom-200"
							>
								<Label>200%</Label>
							</Dropdown.Item>
							<Dropdown.Item
								id="real"
								textValue="Real size"
								data-testid="zoom-real"
							>
								<Label>Real size</Label>
							</Dropdown.Item>
							{lock.on ? (
								<Dropdown.Item
									id="unlock"
									textValue="Unlock"
									data-testid="zoom-unlock"
								>
									<Label>Unlock</Label>
								</Dropdown.Item>
							) : null}
						</Dropdown.Menu>
					</Dropdown.Popover>
				</Dropdown>
				<span className="h-5 w-px bg-separator" />
				<IconButton
					icon="pipette"
					label="Color picker"
					tip="Color picker: the paint mix of a color"
					testid="tool-picker"
					pressed={p.picking}
					placement="top"
					className="touch-none rounded-full select-none"
					data-bar-button
					onPress={() => {
						setOpen(null);
						p.onPicking(!p.picking);
					}}
				/>
				<span className="h-5 w-px bg-separator max-md:hidden" />
				<BarHandle
					frame={frame}
					x={place.x}
					onCommit={(x) => setPlace({ x })}
					onStart={() => setOpen(null)}
				/>
			</div>
		</div>
	);
}
