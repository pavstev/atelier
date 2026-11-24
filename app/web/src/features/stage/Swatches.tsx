// The legends of the legend strip. Values and Shapes: one swatch per tone or pile, with its Munsell
// value; a press holds that color in the paint mix card of the color picker (`features/picker`).
// Pencil: one swatch per level with its grade; the hint and the share are in the tooltip. A press
// holds that grade in the picker card.
import type { ComponentProps, ReactNode } from "react";
import type { Rgb } from "@/draw/calls";
import type { Level } from "@/features/pencil/grades";
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

/** The share of a level as the legend says it. A level the photo does not use is "not used". */
const shareWords = (share: number) => (share > 0 ? `${share}%` : "not used");

/**
 * The Pencil legend: one compact swatch per level, darkest first and Paper last (the order of the
 * answer), with the grade on it. The hint and the share are in the tooltip and the accessible name.
 * A press holds that grade in the picker card. In By pencil `mark` is the level the picture is
 * drawn up to: its swatch has `data-step="true"` and `aria-current="step"`.
 */
export function PencilLegend(p: {
	levels: Level[];
	mark?: number | null;
	onPick?: (f: Fixed) => void;
}) {
	return (
		<Strip label="Pencil legend">
			{p.levels.map(({ grade, tone, share }, i) => {
				const step = p.mark === i;
				const name = `${grade.id}: ${grade.hint}, ${shareWords(share)}`;
				return (
					<Swatch
						key={grade.id}
						tone={tone}
						text={grade.id}
						label={grade.id}
						aria={name}
						onPick={p.onPick}
						data-grade={grade.id}
						data-share={share}
						data-step={step ? "true" : undefined}
						aria-current={step ? "step" : undefined}
						title={name}
						className={`shrink-0 ${step ? "border-accent ring-2 ring-accent" : "border-separator"} ${share > 0 ? "" : "opacity-60"}`}
						button="h-9 min-w-9 px-1 font-medium"
					/>
				);
			})}
		</Strip>
	);
}
