// A bar button that opens a card over the bar: a pop-up above the button on a wide window, a
// bottom sheet under 768 px. The window decides which one is made, so a card has one body.
// The caller holds `open`, so only one card is open at a time. A second press on the button, Esc or
// a press outside closes it. The button is an `IconButton` with round corners.
import { Popover, Sheet } from "@heroui/react";
import { type ReactNode, useEffect, useRef, useSyncExternalStore } from "react";
import { NARROW } from "@/features/tools/settings";
import { IconButton, type IconName } from "@/ui/icons";

/** True in a window narrower than 768 px (a phone). */
function useNarrow(): boolean {
	return useSyncExternalStore(
		(onChange) => {
			const m = window.matchMedia(NARROW);
			m.addEventListener("change", onChange);
			return () => m.removeEventListener("change", onChange);
		},
		() => window.matchMedia(NARROW).matches,
		() => false,
	);
}

type ButtonProps = {
	icon: IconName;
	/** The accessible name. */
	label: string;
	/** The tooltip text; the label when missing. */
	tip?: string;
	testid: string;
	/** The part is on: the button looks pressed. */
	on?: boolean;
	/** The part is off for now: the button stays in the bar, dimmed, and its tip says why. */
	disabled?: boolean;
	onPress?: () => void;
};

/** The round icon button of the bar. It has no `aria-pressed`, only the look of a pressed one. */
function BarButton(p: ButtonProps) {
	return (
		<IconButton
			icon={p.icon}
			label={p.label}
			tip={p.tip}
			testid={p.testid}
			variant={p.on ? "secondary" : "ghost"}
			disabled={p.disabled}
			placement="top"
			className="touch-none rounded-full select-none"
			data-bar-button
			onPress={p.onPress}
		/>
	);
}

export default function Popup(p: {
	/** The card's test id suffix: `data-tool`. */
	id: string;
	/** The accessible name of the card. */
	title: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	button: ButtonProps;
	children: ReactNode;
}) {
	const narrow = useNarrow();
	const { open, onOpenChange } = p;
	// When a bar button is pressed, the popover sees a focus change and asks to close; the button's
	// own press then decides. So a close asked just after a bar button went down is ignored here.
	const barDown = useRef(0);

	// A press outside the card closes it. The bar buttons decide for themselves (a press on the
	// button of this card closes it, a press on another opens that one), and the lists and menus a
	// card opens are part of the card.
	useEffect(() => {
		if (!open || narrow) return;
		const away = (e: PointerEvent) => {
			const t = e.target as Element | null;
			if (t?.closest("[data-bar-button]")) barDown.current = e.timeStamp;
			if (
				t?.closest(
					'[data-testid="tool-popup"], [data-bar-button], [role="listbox"], [role="menu"]',
				)
			)
				return;
			onOpenChange(false);
		};
		document.addEventListener("pointerdown", away, true);
		return () => document.removeEventListener("pointerdown", away, true);
	}, [open, narrow, onOpenChange]);

	if (narrow)
		return (
			<>
				<BarButton {...p.button} onPress={() => onOpenChange(!open)} />
				<Sheet isOpen={open} onOpenChange={onOpenChange}>
					<Sheet.Backdrop variant="transparent">
						<Sheet.Content className="max-h-[75dvh]">
							<Sheet.Dialog
								aria-label={p.title}
								data-testid="tool-popup"
								data-tool={p.id}
							>
								<Sheet.Handle />
								<Sheet.Body className="flex flex-col gap-2.5 px-4 pb-6">
									{p.children}
								</Sheet.Body>
							</Sheet.Dialog>
						</Sheet.Content>
					</Sheet.Backdrop>
				</Sheet>
			</>
		);
	return (
		<Popover
			isOpen={open}
			onOpenChange={(o) => {
				if (!o && performance.now() - barDown.current < 500) return;
				onOpenChange(o);
			}}
		>
			<BarButton {...p.button} onPress={() => onOpenChange(!open)} />
			<Popover.Content placement="top" offset={12} isNonModal>
				<Popover.Dialog
					aria-label={p.title}
					data-testid="tool-popup"
					data-tool={p.id}
					className="flex max-h-[min(70dvh,34rem)] w-[min(20rem,calc(100vw-1rem))] flex-col gap-2.5 overflow-y-auto"
				>
					{p.children}
				</Popover.Dialog>
			</Popover.Content>
		</Popover>
	);
}
