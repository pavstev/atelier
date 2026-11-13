// The icons of the page: one svg component, every path in one list, the `Tip` every icon-only
// control is wrapped in, and the square icon button with a tip that the panel and the stage use.
// 16 px grid, 1.6 stroke.
import { Button, Tooltip } from "@heroui/react";
import type { ComponentProps, ReactNode } from "react";

const ICONS = {
	plus: "M8 3v10M3 8h10",
	pen: "M3 13l1-3 7-7 2 2-7 7zM10 4l2 2",
	trash: "M3 4.5h10M6 4.5V3h4v1.5M4.5 4.5l.5 8.5h6l.5-8.5",
	search: "M7 12.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM11 11l3.5 3.5",
	sort: "M5 3v10M5 13l-2.5-2.5M5 13l2.5-2.5M11 13V3M11 3L8.5 5.5M11 3l2.5 2.5",
	eye: "M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8zM8 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
	lock: "M3 7h10v7H3zM5 7V5a3 3 0 0 1 6 0v2",
	grid: "M2.5 2.5h4.5v4.5H2.5zM9 2.5h4.5v4.5H9zM2.5 9H7v4.5H2.5zM9 9h4.5v4.5H9z",
	unlock: "M3 7h10v7H3zM5 7V5a3 3 0 0 1 5.6-1.5",
	down: "M4 6.5l4 4 4-4",
	image: "M2.5 3h11v10h-11zM2.5 11l3.5-3.5 3 3 1.5-1.5 3 3M10.5 6.2h.01",
	tones:
		"M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM8 2.5v11M8 5.5h2M8 8h2.8M8 10.5h2",
	shapes: "M2.5 13.5L7 3.5l4.5 10zM9.5 6.5h4v4h-4z",
	paper: "M4 2.5h5.5L12.5 5.5v8H4zM9.5 2.5v3h3",
	edges: "M2.5 12c1.5-6 3-8.5 5-8.5s.5 7 3 7c1.5 0 2-2 3-4.5",
	list: "M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01",
	pipette:
		"M11 1.8l3.2 3.2-1.6 1.6-3.2-3.2zM9.8 4.7L3.5 11v1.5H5l6.3-6.3M3.5 12.5l-1 1.5",
	close: "M4 4l8 8M12 4l-8 8",
	copy: "M5.5 5.5h7v8h-7zM3.5 10.5v-8h7",
	left: "M10 3L5 8l5 5",
	right: "M6 3l5 5-5 5",
} as const;

export type IconName = keyof typeof ICONS;

/** The two sizes of an icon button and of the icon in it (`--icon-btn-*` and `--icon-size-*` in the
 * theme): `bar` in a bar or a header, `row` inside a row, a handle or a banner. */
export type IconSize = "bar" | "row";

/** The classes of a bare icon-only Button (a Hero Button used without `IconButton`). */
export const ICON_BUTTON: Record<IconSize, string> = {
	bar: "size-(--icon-btn-bar) min-w-0 shrink-0",
	row: "size-(--icon-btn-row) min-w-0 shrink-0",
};

const ICON_SIZE: Record<IconSize, string> = {
	bar: "size-(--icon-size-bar)",
	row: "size-(--icon-size-row)",
};

/** One icon, the `bar` size unless a size or a class says otherwise. */
export function Icon(p: {
	name: IconName;
	size?: IconSize;
	className?: string;
}) {
	return (
		<svg
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.6"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={p.className ?? ICON_SIZE[p.size ?? "bar"]}
			aria-hidden="true"
		>
			<path d={ICONS[p.name]} />
		</svg>
	);
}

let tipMs: number | undefined;

/** How long the pointer rests on a button before its tip shows, for every tip on the page. The
 * one number is `--tooltip-delay` in the theme; this reads it once. */
export function tipDelay(): number {
	if (tipMs === undefined) {
		const css = getComputedStyle(document.documentElement)
			.getPropertyValue("--tooltip-delay")
			.trim();
		const ms = css.endsWith("ms") ? Number.parseFloat(css) : Number.NaN;
		tipMs = Number.isFinite(ms) ? ms : 400;
	}
	return tipMs;
}

type Place = "top" | "bottom" | "left" | "right";

/** A tip on any pressable child: the one wrapper every icon-only control uses, so they all look and
 * time alike. */
export function Tip(p: {
	text: string;
	placement?: Place;
	children: ReactNode;
}) {
	return (
		<Tooltip delay={tipDelay()}>
			{p.children}
			<Tooltip.Content placement={p.placement ?? "bottom"}>
				{p.text}
			</Tooltip.Content>
		</Tooltip>
	);
}

type IconButtonProps = {
	/** The accessible name, and the tooltip text. */
	label: string;
	/** A shorter tooltip text when the accessible name is long (for example "Rename photo.jpg"). */
	tip?: string;
	icon: IconName;
	testid?: string;
	variant?: ComponentProps<typeof Button>["variant"];
	/** A toggle: sets `aria-pressed` and tints the button when on. */
	pressed?: boolean;
	onPress?: () => void;
	/** Where the tooltip opens. */
	placement?: Place;
	/** `bar` (28 px, the default) or `row` (24 px, inside a list row). */
	size?: IconSize;
	className?: string;
	onPressStart?: () => void;
	onPressEnd?: () => void;
} & { [K in `data-${string}`]?: string | boolean };

/** A square icon button with a tooltip, 28 px (`bar`) or 24 px (`row`). Any `data-*` attribute is
 * passed to the button. It can sit under a `Dropdown` or `Popover` as their trigger. */
export function IconButton(p: IconButtonProps) {
	const {
		label,
		tip,
		icon,
		testid,
		variant,
		pressed,
		placement,
		size,
		...rest
	} = p;
	return (
		<Tip text={tip ?? label} placement={placement}>
			<Button
				isIconOnly
				size="sm"
				variant={pressed ? "secondary" : (variant ?? "ghost")}
				aria-label={label}
				aria-pressed={pressed}
				data-testid={testid}
				{...rest}
				className={`${ICON_BUTTON[size ?? "bar"]} ${p.className ?? ""}`}
			>
				<Icon name={icon} size={size} />
			</Button>
		</Tip>
	);
}
