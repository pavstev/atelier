// The bar at the bottom center of the stage, left to right: See photo (hold) | Base, Edges and Grid
// buttons and the color picker toggle | the zoom button. A tool button opens its controls in a card
// over the bar (a bottom sheet on a phone), one card at a time. The picker has no card: it is a
// toggle, and its mix card follows the mouse over the photo (`features/picker`). The zoom button shows the zoom now; its menu has Fit, 100%,
// 200% and "Real size (cm)...", which locks the zoom to a real width and opens a small card for the
// two widths (the photo, the screen). While locked, the button shows a lock, Fit, 100% and 200%
// are off and the menu has "Unlock". A press outside the card or Esc closes it (the lock stays on).
import { Button, Dropdown, Label } from "@heroui/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { baseName, ToolBody, ToolHead } from "@/features/tools/Panel";
import type { Look, StageId } from "@/features/tools/settings";
import { NumberBox } from "@/ui/fields";
import { Icon, IconButton, type IconName, Tip } from "@/ui/icons";
import type { Lock } from "./lockZoom";
import Popup from "./Popup";
import { guessScreen } from "./screens";

type Open = StageId | "lock" | null;

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
	onHold: (down: boolean) => void;
	onFit: () => void;
	/** Zooms to this factor around the center of the stage (1 is 100%). */
	onZoomTo: (zoom: number) => void;
	look: Look;
	onLook: (f: (s: Look) => Look) => void;
	/** The legend of Values, Shapes or Pencil, shown in the Base card. */
	legend?: ReactNode;
	/** The color picker is on. */
	picking: boolean;
	/** A color just held from the legend: the open card gives way to the picker card. */
	picked: unknown;
	onPicking: (on: boolean) => void;
}) {
	const [open, setOpen] = useState<Open>(null);
	const { lock } = p;
	const found = guessScreen();
	const lockCard = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (p.picked) setOpen(null);
	}, [p.picked]);

	useEffect(() => {
		if (open !== "lock") return;
		const away = (e: PointerEvent) => {
			const t = e.target as Element | null;
			// the zoom button and its menu decide for themselves
			if (
				lockCard.current?.contains(t) ||
				t?.closest('[data-testid="zoom-menu"], [role="menu"]')
			)
				return;
			setOpen(null);
		};
		const esc = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(null);
		};
		document.addEventListener("pointerdown", away, true);
		document.addEventListener("keydown", esc);
		return () => {
			document.removeEventListener("pointerdown", away, true);
			document.removeEventListener("keydown", esc);
		};
	}, [open]);

	const act = (key: string) => {
		if (key === "fit") p.onFit();
		else if (key === "actual") p.onZoomTo(1);
		else if (key === "double") p.onZoomTo(2);
		else if (key === "real") {
			p.onLock({ ...lock, on: true });
			setOpen("lock");
		} else if (key === "unlock") {
			p.onLock({ ...lock, on: false });
			setOpen(null);
		}
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
		<div className="absolute bottom-5 left-1/2 z-(--z-bar) max-w-[calc(100%-1rem)] -translate-x-1/2">
			<div
				data-testid="stage-bar"
				className="floating-card flex items-center gap-1 rounded-full p-1"
			>
				<Tip text="Hold to see the bare photo (Space)" placement="top">
					<Button
						size="sm"
						variant="ghost"
						className="touch-none select-none rounded-full"
						aria-label="See photo"
						data-testid="photo-hold"
						onPressStart={() => p.onHold(true)}
						onPressEnd={() => p.onHold(false)}
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
						}}
					>
						<ToolHead id={id} look={p.look} onLook={p.onLook} />
						<ToolBody
							id={id}
							look={p.look}
							onLook={p.onLook}
							legend={id === "base" ? p.legend : undefined}
						/>
					</Popup>
				))}
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
				<span className="h-5 w-px bg-separator" />
				<div className="relative">
					{lock.on && open === "lock" && (
						<div
							ref={lockCard}
							data-testid="lock-card"
							className="absolute right-0 bottom-full mb-3 floating-card flex w-[min(16rem,calc(100vw-1rem))] flex-col gap-2 rounded-(--radius-card) p-3"
						>
							<NumberBox
								testid="lock-width"
								label="Photo width, cm"
								value={lock.cm}
								onChange={(cm) => p.onLock({ ...lock, cm })}
							/>
							<NumberBox
								testid="screen-width"
								label="Screen width, cm"
								placeholder="ruler"
								value={lock.screenCm}
								onChange={(screenCm) => p.onLock({ ...lock, screenCm })}
							/>
							{found && Math.abs(lock.screenCm - found.cm) < 0.005 && (
								<p data-testid="screen-found" className="text-xs text-muted">
									Found: {found.name}.
								</p>
							)}
							{lock.screenCm <= 0 && (
								<p className="text-xs text-muted">
									The zoom is locked. For the real size, measure the lit part of
									the screen, left to right, once.
								</p>
							)}
						</div>
					)}
					<Dropdown
						onOpenChange={(o) =>
							o && setOpen((cur) => (cur === "lock" ? cur : null))
						}
					>
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
									textValue="Real size (cm)..."
									data-testid="zoom-real"
								>
									<Label>Real size (cm)...</Label>
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
				</div>
			</div>
		</div>
	);
}
