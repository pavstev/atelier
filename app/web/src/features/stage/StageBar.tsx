// The bar at the bottom center of the stage, left to right: See photo (a tap keeps the bare photo on
// and lights the button, a press over 300 ms peeks while held) | Base and Grid (Grid
// is a split button: the main part switches the layer, the chevron opens its card) | Paper and the
// zoom button | the color picker toggle. Paper (`features/size`) frames the photo to a paper. A tool
// button opens its controls in a card over the bar (a bottom sheet on a phone), one card at a time.
// The picker has no card: it is a toggle, and its mix card follows the mouse over the photo
// (`features/picker`). The zoom button shows the zoom now; its menu has Fit, 100% and 200%.
// The bar is fixed at the bottom center of the free stage (the stage right of the open panel).
import { Button, Dropdown, Label } from "@heroui/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { SizeState } from "@/features/size/useSize";
import { baseName } from "@/features/tools/baseName";
import { type Look, STAGE_IDS, type StageId } from "@/features/tools/settings";
import { SizeCardLazy, ToolCard } from "@/features/tools/ToolCard";
import { Icon, IconButton, type IconName, Tip } from "@/ui/icons";
import Popup from "./Popup";

type Open = StageId | "size" | null;

/** The icon of each base, so the Base button shows the base now on show. */
const BASE_ICON: Record<Look["base"]["kind"], IconName> = {
	photo: "image",
	values: "tones",
	shapes: "shapes",
};

export default function StageBar(p: {
	/** Zoom as a factor; 1 is actual pixels. */
	zoom: number;
	/** See photo goes down (true) or up (false); `seePhoto.ts` tells a tap from a hold. */
	onHold: (down: boolean, completed?: boolean) => void;
	/** The bare photo is kept on after a tap. */
	seeLatched: boolean;
	onFit: () => void;
	/** Zooms to this factor around the center of the stage (1 is 100%). */
	onZoomTo: (zoom: number) => void;
	look: Look;
	onLook: (f: (s: Look) => Look) => void;
	/** The paper or canvas of the photo (the Size card). */
	size: SizeState;
	/** The color picker is on. */
	picking: boolean;
	/** A color just held from the legend: the open card gives way to the picker card. */
	picked: unknown;
	onPicking: (on: boolean) => void;
	/** The Mac app: a button shows or hides the legend strip (`LegendStrip`, at the right edge). */
	legend?: { on: boolean; onToggle: () => void };
}) {
	const [open, setOpen] = useState<Open>(null);
	// the See photo press finished on the button (not left or cancelled)
	const pressed = useRef(false);
	const frame = useRef<HTMLDivElement>(null);
	const bar = useRef<HTMLDivElement>(null);
	// The bar's width, rounded up to a whole pixel, so its left and right edges are both whole pixels
	// (the left edge is rounded in `style` below). The bar gets that width as its min-width; it is
	// cleared before each measure, so the bar can also get narrower.
	useLayoutEffect(() => {
		const el = bar.current;
		const outer = frame.current;
		if (!el || !outer) return;
		const fit = () => {
			el.style.minWidth = "";
			const w = Math.ceil(el.getBoundingClientRect().width - 0.01);
			el.style.minWidth = `${w}px`;
			outer.style.setProperty("--bar-w", `${w}px`);
		};
		fit();
		const ro = new ResizeObserver(fit);
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	useEffect(() => {
		if (p.picked) setOpen(null);
	}, [p.picked]);

	const act = (key: string) => {
		if (key === "fit") p.onFit();
		else if (key === "actual") p.onZoomTo(1);
		else if (key === "double") p.onZoomTo(2);
	};

	const info: Record<StageId, { label: string; icon: IconName; tip: string }> =
		{
			base: {
				label: "Base",
				icon: BASE_ICON[p.look.base.kind],
				tip: `Base: ${baseName(p.look)}`,
			},
			grid: { label: "Grid", icon: "grid", tip: "Grid" },
		};

	return (
		<div
			ref={frame}
			data-testid="stage-bar-frame"
			// centered on the free stage (right of the open panel, `--free-left` from `StageArea`), kept inside
			// the stage and, when it fits, off the panel (8 px of room); the left edge is a whole pixel (the
			// centre rounded, half the width rounded down), so the 1 px edge stays crisp
			style={{
				left: "round(min(calc(100% - var(--bar-w, 0px) / 2 - 8px), max(calc(var(--free-left, 0px) + var(--bar-w, 0px) / 2 + 8px), calc(var(--free-left, 0px) + (100% - var(--free-left, 0px)) / 2))), 1px)",
			}}
			className="absolute bottom-5 z-(--z-bar) max-w-[calc(100%-1rem)] -translate-x-[round(down,calc(var(--bar-w,0px)/2),1px)]"
		>
			<div
				ref={bar}
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
				{STAGE_IDS.map((id) => (
					<Popup
						key={id}
						id={id}
						title={info[id].label}
						open={open === id}
						onOpenChange={(o) => {
							setOpen(o ? id : open === id ? null : open);
						}}
						button={{
							icon: info[id].icon,
							label: info[id].label,
							tip: info[id].tip,
							testid: `tool-${id}`,
							on: id === "base" ? p.look.base.kind !== "photo" : p.look[id].on,
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
						<ToolCard id={id} look={p.look} onLook={p.onLook} />
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
						tip: "Paper: size and shape",
						testid: "tool-size",
						on: p.size.choice.fit,
					}}
				>
					{p.size.whole && (
						<SizeCardLazy
							choice={p.size.choice}
							onChange={p.size.set}
							photoW={p.size.whole.width}
							photoH={p.size.whole.height}
							stepCm={p.look.grid.on ? p.look.grid.cm : null}
						/>
					)}
				</Popup>
				<Dropdown onOpenChange={(o) => o && setOpen(null)}>
					<Tip text="Zoom" placement="top">
						<Button
							size="sm"
							variant="ghost"
							className="touch-none gap-1 rounded-full px-2.5 select-none"
							aria-label="Zoom"
							data-testid="zoom-menu"
							data-bar-button
						>
							<span
								data-testid="zoom-percent"
								className="min-w-9 text-center text-xs tabular-nums"
							>
								{Math.round(p.zoom * 100)}%
							</span>
							<Icon name="down" size="row" />
						</Button>
					</Tip>
					<Dropdown.Popover placement="top">
						<Dropdown.Menu
							aria-label="Zoom"
							shouldCloseOnSelect
							onAction={(key) => act(String(key))}
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
				{p.legend && (
					<IconButton
						icon="legend"
						label="Legend"
						tip="Show or hide the legend"
						testid="tool-legend"
						pressed={p.legend.on}
						placement="top"
						className="touch-none rounded-full select-none"
						data-bar-button
						onPress={p.legend.onToggle}
					/>
				)}
			</div>
		</div>
	);
}
