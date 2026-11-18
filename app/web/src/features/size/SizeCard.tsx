// The Size card, in a bar pop-up: the paper in its shape (a small picture), a row of paper and canvas
// chips, the orientation, the width and height in cm, Whole photo or Fit to paper, one line of fact,
// and a "Real size" switch (with the screen width it needs). The choice is kept per photo (`useSize.ts`); the cut itself is made in
// `useSize` before the layers see the photo. The width and height boxes always show the paper in cm;
// typing in one turns the choice into Custom.
import { Switch, ToggleButton, ToggleButtonGroup } from "@heroui/react";
import { NumberBox, Row, Segment } from "@/ui/fields";
import {
	type Choice,
	CUSTOM,
	factText,
	ORIENTS,
	PAPERS,
	paperCm,
	shownWidthCm,
	sideTyped,
} from "./paper";
import SizePreview from "./SizePreview";
import { useSettled } from "./useSettled";

const ORIENT_NAMES = ["Like photo", "Portrait", "Landscape"];
const FIT_NAMES = ["Whole photo", "Fit to paper"];

/** The chips of the paper row: the presets, then Custom. */
const CHIPS = [
	...PAPERS.map((x) => ({ id: x.id, label: x.label })),
	{ id: CUSTOM, label: "Custom" },
];

export default function SizeCard(p: {
	choice: Choice;
	onChange: (f: (c: Choice) => Choice) => void;
	/** The photo before any cut, in px. */
	photoW: number;
	photoH: number;
	/** The cells across the width of the Grid, or null when no Grid with cells is on. */
	cells: number | null;
	/** The step of a Grid in whole cm, or null when no Grid in cm is on. */
	stepCm: number | null;
	/** The real size is on (the zoom is locked to the paper width). */
	real: boolean;
	/** The width of the lit screen in cm; 0 when not known yet. */
	screenCm: number;
	/** The name of the screen found for `screenCm`, or null. */
	found: string | null;
	/** Turns the real size on or off; `cm` is the photo width on paper. */
	onReal: (on: boolean, cm: number) => void;
	onScreen: (cm: number) => void;
}) {
	const { choice: c, photoW, photoH } = p;
	const cm = paperCm(c, photoW, photoH);
	const custom = c.paper === CUSTOM;
	// a side typed in a box: the other side stays as shown, and the choice becomes Custom
	// (it settles first: see `useSettled`, so the layers are not recropped on every key)
	const side = (key: "w" | "h", v: number) =>
		p.onChange((cur) => {
			const now = paperCm(cur, photoW, photoH);
			const typed = sideTyped(v);
			return {
				...cur,
				paper: CUSTOM,
				w: key === "w" ? typed : now.w,
				h: key === "h" ? typed : now.h,
			};
		});
	const width = useSettled(custom ? c.w : cm.w, (v) => side("w", v));
	const height = useSettled(custom ? c.h : cm.h, (v) => side("h", v));
	// an empty box is sent on as NaN; a typed 0 or negative stays a number (kept to the minimum)
	const typeSide =
		(s: { type: (v: number) => void }) => (v: number, empty: boolean) =>
			s.type(empty ? Number.NaN : v);
	return (
		<>
			<h2 className="flex min-h-(--icon-btn-bar) items-center text-sm font-medium">
				Paper
			</h2>
			<div data-testid="tools" className="atelier-tools flex flex-col gap-2">
				<SizePreview choice={c} photoW={photoW} photoH={photoH} />
				<ToggleButtonGroup
					aria-label="Paper or canvas"
					selectionMode="single"
					disallowEmptySelection
					size="sm"
					selectedKeys={[c.paper]}
					onSelectionChange={(keys) => {
						const id = [...keys][0];
						if (id === undefined) return;
						// Custom starts from the paper now on show
						p.onChange((cur) =>
							id === CUSTOM
								? { ...cur, paper: CUSTOM, w: cm.w, h: cm.h }
								: { ...cur, paper: String(id) },
						);
					}}
					className="flex flex-wrap justify-start gap-1"
				>
					{CHIPS.map((x) => (
						<ToggleButton
							key={x.id}
							id={x.id}
							data-testid="size-preset"
							data-preset={x.id}
							className="rounded-full border border-separator data-[selected=true]:bg-accent-soft data-[selected=true]:text-accent-soft-foreground"
						>
							{x.label}
						</ToggleButton>
					))}
				</ToggleButtonGroup>
				<Segment
					bare
					testid="size-orientation"
					label="Orientation"
					options={ORIENT_NAMES}
					value={Math.max(0, ORIENTS.indexOf(c.orient))}
					disabled={custom}
					onChange={(i) =>
						p.onChange((cur) => ({ ...cur, orient: ORIENTS[i] ?? "auto" }))
					}
				/>
				<div className="grid grid-cols-2 gap-3">
					<NumberBox
						testid="size-width"
						label="Width"
						value={width.shown}
						onChange={typeSide(width)}
						onBlur={width.flush}
					/>
					<NumberBox
						testid="size-height"
						label="Height"
						value={height.shown}
						onChange={typeSide(height)}
						onBlur={height.flush}
					/>
				</div>
				<Segment
					bare
					testid="size-fit"
					label="Photo on the paper"
					options={FIT_NAMES}
					value={c.fit ? 1 : 0}
					onChange={(i) => p.onChange((cur) => ({ ...cur, fit: i === 1 }))}
				/>
				<Row label="Real size">
					<Switch
						data-testid="paper-real"
						aria-label="Real size"
						isSelected={p.real}
						onChange={(on) => {
							p.onReal(on, shownWidthCm(c, photoW, photoH));
						}}
					>
						<Switch.Content>
							<Switch.Control>
								<Switch.Thumb />
							</Switch.Control>
						</Switch.Content>
					</Switch>
				</Row>
				{p.real && (
					<>
						<NumberBox
							testid="screen-width"
							label="Screen width, cm"
							placeholder="ruler"
							value={p.screenCm}
							onChange={p.onScreen}
						/>
						{p.found && (
							<p data-testid="screen-found" className="text-xs text-muted">
								Found: {p.found}.
							</p>
						)}
						{p.screenCm <= 0 && (
							<p className="text-xs text-muted">
								For the real size, measure the lit part of the screen, left to
								right, once.
							</p>
						)}
					</>
				)}
				<p
					data-testid="size-fact"
					aria-live="polite"
					className="min-h-8 text-xs text-muted"
				>
					{factText(c, photoW, photoH, p.cells, p.stepCm)}
				</p>
			</div>
		</>
	);
}
