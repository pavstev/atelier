// The legends of the base card. Values and Shapes: one swatch per tone or pile, with its Munsell
// value; a press holds that color in the paint mix card of the color picker (`features/picker`).
// Pencil: one row per level with its grade, a hint and its share of the photo; no press.
import type { Level } from "@/features/pencil/grades";
import type { Fixed } from "@/features/picker/Picker";

/** The CIE L* of each Munsell value V0 to V10. */
const MUNSELL_L = [
	0, 10.6, 20.5, 30.8, 41.2, 51.6, 61.7, 71.6, 81.3, 91.1, 100,
];

const BLACK = "#000";
const WHITE = "#fff";

/** The Munsell value (0 to 10) of an sRGB color: the nearest L* in the table. */
function munsellValue([r, g, b]: number[]): number {
	const lin = (c: number) => {
		const x = c / 255;
		return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
	};
	const y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
	const l = y > 216 / 24389 ? 116 * y ** (1 / 3) - 16 : (24389 / 27) * y;
	let best = 0;
	for (let v = 1; v < MUNSELL_L.length; v++) {
		if (Math.abs(MUNSELL_L[v] - l) < Math.abs(MUNSELL_L[best] - l)) best = v;
	}
	return best;
}

const css = (t: number[]) => `rgb(${t[0]}, ${t[1]}, ${t[2]})`;
const hex = (t: number[]) =>
	`#${t.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
const ink = (t: number[]) =>
	0.299 * t[0] + 0.587 * t[1] + 0.114 * t[2] > 128 ? BLACK : WHITE;

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
			className="flex flex-wrap gap-1 text-xs"
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
 * The Pencil legend: one row per level, darkest first and Paper last (the order of the answer),
 * with the swatch, the grade, a short hint and the share. A swatch is not a button: a pencil
 * grade is read from the card of the picker.
 */
export function PencilLegend(p: { levels: Level[] }) {
	return (
		<ol
			data-testid="legend"
			aria-label="Pencil legend"
			className="flex flex-col gap-1 text-xs"
		>
			{p.levels.map(({ grade, tone, share }) => (
				<li
					key={grade.id}
					data-testid="legend-swatch"
					data-grade={grade.id}
					data-share={share}
					className={`flex items-center gap-2 ${share > 0 ? "" : "text-muted opacity-75"}`}
				>
					<span
						aria-hidden="true"
						className="size-5 shrink-0 rounded-(--radius-chip) border border-separator"
						style={{ backgroundColor: css(tone) }}
					/>
					<span className="w-9 shrink-0 font-medium">{grade.id}</span>
					<span className="min-w-0 flex-1 leading-tight text-muted">
						{grade.hint}
					</span>
					<span className="shrink-0 text-end tabular-nums">
						{shareWords(share)}
					</span>
				</li>
			))}
		</ol>
	);
}
