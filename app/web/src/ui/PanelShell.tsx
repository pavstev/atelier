// The frame of the side panel. It owns the width variable (`--left-w`, set on the window root,
// capped at half of the window), the glass look and the test attributes. The panel floats over the
// stage as an inset glass card and never moves the photo. A hidden panel is an empty stub; the handle
// on the panel edge shows it again. In a window narrower than 768 px the panel is a drawer over the
// stage (at most 88% wide) with a scrim that closes it.
import type { ComponentProps, ReactNode } from "react";

export default function PanelShell(
	p: {
		label: string;
		testid: string;
		collapsed: boolean;
		/** Closes the drawer (a press on the scrim). */
		onClose?: () => void;
		children: ReactNode;
	} & Pick<
		ComponentProps<"aside">,
		"className" | "onDragOver" | "onDragLeave" | "onDrop"
	>,
) {
	const { label, testid, collapsed, onClose, children, className, ...drag } = p;
	if (collapsed)
		return (
			<aside
				aria-label={label}
				data-testid={testid}
				data-collapsed="true"
				className="hidden"
			/>
		);
	return (
		<>
			<button
				type="button"
				tabIndex={-1}
				aria-label="Close the panel"
				data-testid="panel-scrim"
				className="fixed inset-0 z-(--z-popup) cursor-default bg-(--backdrop) md:hidden"
				onClick={onClose}
			/>
			<aside
				aria-label={label}
				data-testid={testid}
				data-collapsed="false"
				className={`glass fixed flex flex-col gap-2 overflow-hidden p-(--panel-pad) max-md:inset-y-0 max-md:left-0 max-md:z-(--z-drawer) max-md:w-[min(var(--left-w),88vw)] md:top-(--panel-top) md:bottom-(--panel-gap) md:left-(--panel-gap) md:z-(--z-panel) md:w-[min(var(--left-w),50vw)] md:rounded-(--radius-card) ${className ?? ""}`}
				{...drag}
			>
				{children}
			</aside>
		</>
	);
}
