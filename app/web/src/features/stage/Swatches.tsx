// The legend of the legend strip. Values and Shapes: one swatch per tone or pile, with its Munsell
// value; a press holds that color in the paint mix card of the color picker (`features/picker`).
import type { ComponentProps, ReactNode } from "react";
import type { Rgb } from "@/draw/calls";
import { css, hex, ink, munsellValue } from "@/features/picker/color";
import type { Fixed } from "@/features/picker/Picker";

/** The strip: a list of swatches. */
function Strip(p: { label: string; children: ReactNode }) {
	return (
		<ol
			data-testid="legend"
			aria-label={p.label}
			className="flex flex-nowrap gap-1 text-xs"
		>
			{p.children}
		</ol>
	);
}

/**
 * One swatch: a button with `text` on the color. A press holds the color in the picker card as
 * `label`. `className` and `button` size and mark the item and its button; other props (data
 * attributes, a title) go to the item.
 */
function Swatch({
	tone,
	text,
	label,
	aria,
	onPick,
	className,
	button,
	...item
}: {
	tone: Rgb;
	text: string;
	label: string;
	aria: string;
	onPick?: (f: Fixed) => void;
	className: string;
	button: string;
} & Omit<ComponentProps<"li">, "children" | "className" | "style">) {
	return (
		<li
			data-testid="legend-swatch"
			className={`rounded-(--radius-chip) border ${className}`}
			style={{ backgroundColor: css(tone) }}
			{...item}
		>
			<button
				type="button"
				aria-label={aria}
				onClick={() => onPick?.({ rgb: tone, label })}
				className={`flex cursor-pointer items-center justify-center rounded-(--radius-chip) atelier-focus ${button}`}
				style={{ color: ink(tone) }}
			>
				{text}
			</button>
		</li>
	);
}

/** The legend: one button per tone or pile. A press holds that color in the paint mix card. */
export function Legend(p: {
	tones: readonly Rgb[];
	label: string;
	onPick: (f: Fixed) => void;
}) {
	return (
		<Strip label={p.label}>
			{p.tones.map((t, i) => {
				const v = `V${munsellValue(t)}`;
				return (
					<Swatch
						// biome-ignore lint/suspicious/noArrayIndexKey: two piles can share a color; the list never reorders
						key={`${i}-${t.join(",")}`}
						tone={t}
						text={v}
						label={v}
						aria={`Paint mix for ${v} ${hex(t)}`}
						onPick={p.onPick}
						className="size-9 border-separator"
						button="size-full"
					/>
				);
			})}
		</Strip>
	);
}
