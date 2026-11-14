// The controls of the three tools, one body each: Base, Edges and Grid. `StageBar` shows a body in a
// pop-up card over the bottom bar (a bottom sheet on a phone). `ToolHead` is the top row of a card:
// its name and, for Edges and Grid, the on/off switch. A body is three groups split by thin lines:
// the main choice at full width, its settings one line each, then Opacity.
import { Switch } from "@heroui/react";
import type { ReactNode } from "react";
import GradeRow from "@/features/pencil/GradeRow";
import { Choice, ColorField, Knob, Row, Segment } from "@/ui/fields";
import {
	BASES,
	EDGES_MODE,
	EDGES_WIDTH_MAX,
	GRID_CELLS,
	GRID_GROUPS,
	GRID_MODE,
	GRID_WIDTH_MAX,
	LABELS,
	type Look,
	OPACITY_MIN,
	type StageId,
} from "./settings";

const BASE_NAMES = BASES.map((b) => b.label);
const baseIndex = (kind: string) => BASES.findIndex((b) => b.id === kind);

/** The name of the base now on show (Photo, Values, Shapes, Paper or Pencil). */
export const baseName = (look: Look) => BASE_NAMES[baseIndex(look.base.kind)];

type Props = {
	look: Look;
	onLook: (f: (s: Look) => Look) => void;
};

function Toggle(p: {
	label: string;
	on: boolean;
	onChange: (v: boolean) => void;
	disabled?: boolean;
	testid: string;
}) {
	return (
		<Switch
			data-testid={p.testid}
			aria-label={p.label}
			isSelected={p.on}
			isDisabled={p.disabled}
			onChange={p.onChange}
		>
			<Switch.Content>
				<Switch.Control>
					<Switch.Thumb />
				</Switch.Control>
			</Switch.Content>
		</Switch>
	);
}

/** Changes the settings of one part of the look. */
const setter =
	(p: Props) =>
	<K extends keyof Look>(id: K, v: Partial<Look[K]>) =>
		p.onLook((s) => ({ ...s, [id]: { ...s[id], ...v } }));

/** The top row of a tool card: its name and (Edges, Grid) the on/off switch. The mode shows in the
 * main choice right below, so the head does not repeat it. */
export function ToolHead(p: Props & { id: StageId }) {
	const s = p.look;
	const set = setter(p);
	const title = { base: "Base", edges: "Edges", grid: "Grid" }[p.id];
	return (
		<div className="flex min-h-(--icon-btn-bar) items-center gap-2">
			<h2 className="min-w-0 flex-1 text-sm font-medium">{title}</h2>
			{p.id !== "base" && (
				<Toggle
					testid={`layer-${p.id}`}
					label={`Show ${title}`}
					on={s[p.id].on}
					onChange={(on) => set(p.id as "edges" | "grid", { on })}
				/>
			)}
		</div>
	);
}

/** A thin line between the groups of a card. */
const Rule = () => <div className="my-0.5 h-px bg-separator" />;

/** The controls of one tool, in three groups: the main choice at full width, its settings, then
 * Opacity last. `legend` is the legend of Values, Shapes or Pencil (Base only). */
export function ToolBody(p: Props & { id: StageId; legend?: ReactNode }) {
	const s = p.look;
	const set = setter(p);
	/** The `value` and `onChange` of a field that holds one setting of one part. */
	const bind = <K extends keyof Look, F extends keyof Look[K]>(
		id: K,
		key: F,
	) => ({
		value: s[id][key],
		onChange: (v: Look[K][F]) =>
			set(id, { [key]: v } as unknown as Partial<Look[K]>),
	});
	const opacity = (id: StageId) => (
		<Knob
			testid={`opacity-${id}`}
			label="Opacity"
			min={OPACITY_MIN}
			{...bind(id, "opacity")}
		/>
	);
	const dim = p.id !== "base" && !s[p.id].on;
	const thirds = s.grid.mode === GRID_MODE.thirds;
	const toned =
		s.base.kind === "values" ||
		s.base.kind === "shapes" ||
		s.base.kind === "pencil";
	return (
		<div
			data-testid="tools"
			className={`atelier-tools flex flex-col gap-1.5 transition-opacity ${dim ? "opacity-60" : ""}`}
		>
			{p.id === "base" && (
				<>
					<Segment
						bare
						testid="base"
						label="Show"
						options={BASE_NAMES}
						value={baseIndex(s.base.kind)}
						onChange={(i) => set("base", { kind: BASES[i]?.id ?? "photo" })}
					/>
					{toned && <Rule />}
					{s.base.kind === "values" && (
						<>
							<Choice
								testid="values-preset"
								label="Steps"
								options={LABELS.valuesPreset}
								{...bind("values", "preset")}
							/>
							<Knob
								testid="values-detail"
								label="Detail"
								{...bind("values", "detail")}
							/>
							<Segment
								testid="values-tint"
								label="Tint"
								options={LABELS.valuesTint}
								{...bind("values", "tint")}
							/>
						</>
					)}
					{s.base.kind === "shapes" && (
						<>
							<Choice
								testid="shapes-step"
								label="Step"
								options={LABELS.shapesStep}
								{...bind("shapes", "step")}
							/>
							<Knob
								testid="shapes-detail"
								label="Detail"
								{...bind("shapes", "detail")}
							/>
						</>
					)}
					{s.base.kind === "pencil" && (
						<>
							<Segment
								testid="pencil-look"
								label="Look"
								options={LABELS.pencilLook}
								{...bind("pencil", "look")}
							/>
							<Knob
								testid="pencil-detail"
								label="Detail"
								{...bind("pencil", "detail")}
							/>
							<GradeRow
								mask={s.pencil.mask}
								onChange={(mask) => set("pencil", { mask })}
							/>
						</>
					)}
					{toned && (
						<>
							<Rule />
							{opacity("base")}
						</>
					)}
					{p.legend && <div className="pt-1">{p.legend}</div>}
				</>
			)}
			{p.id === "edges" && (
				<>
					<Segment
						bare
						testid="edges-mode"
						label="Mode"
						options={LABELS.edgesMode}
						{...bind("edges", "mode")}
					/>
					<Rule />
					<Knob
						testid="edges-amount"
						label="Amount"
						step={1}
						{...bind("edges", "amount")}
					/>
					<Knob
						testid="edges-width"
						label="Width"
						min={1}
						max={EDGES_WIDTH_MAX}
						step={1}
						{...bind("edges", "width")}
					/>
					{s.edges.mode === EDGES_MODE.lines && (
						<Knob
							testid="edges-even"
							label="Even"
							step={1}
							{...bind("edges", "even")}
						/>
					)}
					<Rule />
					{opacity("edges")}
				</>
			)}
			{p.id === "grid" && (
				<>
					<Segment
						bare
						testid="grid-mode"
						label="Mode"
						options={LABELS.gridMode}
						{...bind("grid", "mode")}
					/>
					<Rule />
					<Knob
						testid="grid-cells"
						label="Cells"
						steps={GRID_CELLS}
						{...bind("grid", "cells")}
						disabled={thirds}
					/>
					<Segment
						testid="grid-group"
						label="Heavy lines"
						options={LABELS.gridGroup}
						value={Math.max(0, GRID_GROUPS.indexOf(s.grid.group))}
						onChange={(i) =>
							set("grid", { group: GRID_GROUPS[i] ?? s.grid.group })
						}
						disabled={thirds}
					/>
					<Row label="Center">
						<Toggle
							testid="grid-center"
							label="Center the grid on the photo"
							on={s.grid.center}
							disabled={thirds}
							onChange={(center) => set("grid", { center })}
						/>
					</Row>
					<Knob
						testid="grid-width"
						label="Width"
						min={1}
						max={GRID_WIDTH_MAX}
						step={1}
						{...bind("grid", "width")}
					/>
					<Segment
						testid="grid-paint"
						label="Color"
						options={LABELS.gridPaint}
						value={s.grid.contrast ? 0 : 1}
						onChange={(i) => set("grid", { contrast: i === 0 })}
						after={
							!s.grid.contrast && (
								<ColorField
									bare
									testid="grid-color"
									label="Line color"
									{...bind("grid", "color")}
								/>
							)
						}
					/>
					<Rule />
					{opacity("grid")}
				</>
			)}
		</div>
	);
}
