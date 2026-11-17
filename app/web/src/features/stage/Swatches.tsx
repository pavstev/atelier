// The legends of the legend strip. Values and Shapes: one swatch per tone or pile, with its Munsell
// value; a press holds that color in the paint mix card of the color picker (`features/picker`).
// Pencil: one swatch per level with its grade; the hint and the share are in the tooltip. A press
// holds that grade in the picker card.
import type { Level } from "@/features/pencil/grades";
import { css, hex, ink, munsellValue } from "@/features/picker/color";
import type { Fixed } from "@/features/picker/Picker";

/** The legend: one button per tone or pile. A press holds that color in the paint mix card. */
export function Legend(p: {
	tones: number[][];
	label: string;
	onPick: (f: Fixed) => void;
}) {
	return (
		<ol
			data-testid="legend"
			aria-label={p.label}
			className="flex flex-nowrap gap-1 text-xs"
		>
			{p.tones.map((t, i) => (
				<li
					// biome-ignore lint/suspicious/noArrayIndexKey: two piles can share a color; the list never reorders
					key={`${i}-${t.join(",")}`}
					data-testid="legend-swatch"
					className="size-9 rounded-(--radius-chip) border border-separator"
					style={{ backgroundColor: css(t) }}
				>
					<button
						type="button"
						aria-label={`Paint mix for V${munsellValue(t)} ${hex(t)}`}
						onClick={() =>
							p.onPick({
								rgb: [t[0] as number, t[1] as number, t[2] as number],
								label: `V${munsellValue(t)}`,
							})
						}
						className="flex size-full cursor-pointer items-center justify-center rounded-(--radius-chip) atelier-focus"
						style={{ color: ink(t) }}
					>
						V{munsellValue(t)}
					</button>
				</li>
			))}
		</ol>
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
		<ol
			data-testid="legend"
			aria-label="Pencil legend"
			className="flex flex-nowrap gap-1 text-xs"
		>
			{p.levels.map(({ grade, tone, share }, i) => {
				const step = p.mark === i;
				const name = `${grade.id}: ${grade.hint}, ${shareWords(share)}`;
				return (
					<li
						key={grade.id}
						data-testid="legend-swatch"
						data-grade={grade.id}
						data-share={share}
						data-step={step ? "true" : undefined}
						aria-current={step ? "step" : undefined}
						title={name}
						className={`shrink-0 rounded-(--radius-chip) border ${step ? "border-accent ring-2 ring-accent" : "border-separator"} ${share > 0 ? "" : "opacity-60"}`}
						style={{ backgroundColor: css(tone) }}
					>
						<button
							type="button"
							aria-label={name}
							onClick={() =>
								p.onPick?.({
									rgb: [
										tone[0] as number,
										tone[1] as number,
										tone[2] as number,
									],
									label: grade.id,
								})
							}
							className="flex h-9 min-w-9 cursor-pointer items-center justify-center rounded-(--radius-chip) px-1 font-medium atelier-focus"
							style={{ color: ink(tone) }}
						>
							{grade.id}
						</button>
					</li>
				);
			})}
		</ol>
	);
}
