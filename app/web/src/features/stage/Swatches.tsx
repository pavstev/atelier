// The color legend of Values and Shapes, and the zoom that shows one color big on a neutral gray
// mat, so a painter can hold a brush or a paint chip next to it on the screen. The mat and the
// black and white on it are plain colors on purpose: they must not follow the theme.
import { Button } from "@heroui/react";
import { useEffect, useState } from "react";

/** The CIE L* of each Munsell value V0 to V10. */
const MUNSELL_L = [
	0, 10.6, 20.5, 30.8, 41.2, 51.6, 61.7, 71.6, 81.3, 91.1, 100,
];

/** The mat around a zoomed color: a neutral middle gray (Munsell N5, L* 51.6). */
const MAT = "rgb(124, 124, 124)";
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

/** The legend: one button per tone or pile. A press opens the zoom on that color. */
export function Legend(p: {
	tones: number[][];
	label: string;
	onPick: (i: number) => void;
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
						aria-label={`Zoom V${munsellValue(t)} ${hex(t)}`}
						onClick={() => p.onPick(i)}
						className="flex size-full cursor-zoom-in items-center justify-center rounded-(--radius-chip) atelier-focus"
						style={{ color: ink(t) }}
					>
						V{munsellValue(t)}
					</button>
				</li>
			))}
		</ol>
	);
}

/** One color big on the gray mat, its value and its numbers, and the other colors to switch.
 * The arrow keys switch, Escape closes, a press on the big color fills the screen with it. */
export function SwatchZoom(p: {
	tones: number[][];
	at: number;
	onAt: (i: number) => void;
	onClose: () => void;
}) {
	const [full, setFull] = useState(false);
	const { tones, at, onAt, onClose } = p;
	const t = tones[at];
	useEffect(() => {
		const key = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				if (full) setFull(false);
				else onClose();
			} else if (e.key === "ArrowRight") {
				onAt((at + 1) % tones.length);
			} else if (e.key === "ArrowLeft") {
				onAt((at + tones.length - 1) % tones.length);
			}
		};
		window.addEventListener("keydown", key);
		return () => window.removeEventListener("keydown", key);
	}, [at, full, onAt, onClose, tones.length]);
	if (!t) return null;
	if (full) {
		return (
			<button
				type="button"
				data-testid="swatch-full"
				aria-label="Back to the zoom"
				onClick={() => setFull(false)}
				className="fixed inset-0 z-(--z-banner) cursor-zoom-out"
				style={{ backgroundColor: css(t) }}
			/>
		);
	}
	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Color zoom"
			data-testid="swatch-zoom"
			className="fixed inset-0 z-(--z-drawer) flex flex-col items-center justify-center gap-4 p-6"
			style={{ backgroundColor: MAT, color: BLACK }}
		>
			<button
				type="button"
				data-testid="swatch-zoom-color"
				aria-label="Fill the screen with this color"
				onClick={() => setFull(true)}
				className="aspect-square w-[min(62vh,80vw)] cursor-zoom-in rounded-(--radius-chip)"
				style={{ backgroundColor: css(t) }}
			/>
			<p className="font-mono text-base font-medium">
				V{munsellValue(t)} · {hex(t)} · rgb({t[0]}, {t[1]}, {t[2]})
			</p>
			<ol className="flex flex-wrap justify-center gap-2" aria-label="Colors">
				{tones.map((c, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: two piles can share a color; the list never reorders
					<li key={`${i}-${c.join(",")}`}>
						<button
							type="button"
							aria-label={`V${munsellValue(c)} ${hex(c)}`}
							aria-pressed={i === at}
							onClick={() => onAt(i)}
							className="size-14 rounded-(--radius-chip) border-2 border-transparent"
							style={{
								backgroundColor: css(c),
								borderColor: i === at ? BLACK : undefined,
							}}
						/>
					</li>
				))}
			</ol>
			<div className="flex items-center gap-3 text-sm">
				<span>Arrow keys switch · press the color to fill the screen</span>
				<Button variant="secondary" onPress={onClose} autoFocus>
					Close
				</Button>
			</div>
		</div>
	);
}
