// The controls of the three tools, one body each: Base and Grid. `StageBar` shows a body in a
// pop-up card over the bottom bar (a bottom sheet on a phone). `ToolHead` is the top row of a card:
// its name and, for Grid, the on/off switch. A body is three groups split by thin lines:
// Opacity first, the main choice at full width, then its settings one line each.
import { GRID_CM } from "@/features/size/paper";
import { Choice, Knob, Segment, Toggle } from "@/ui/fields";
import { BASE_NAMES, baseIndex } from "./baseName";
import {
	BASES,
	LABELS,
	type Look,
	OPACITY_MIN,
	type SetLook,
	type StageId,
} from "./settings";

type Props = {
	look: Look;
	onLook: SetLook;
};

/** What one tool card takes: its tool, the look and its setter. */
export type ToolCardProps = Props & {
	id: StageId;
};

/** Changes the settings of one part of the look. */
const setter =
	(p: Props) =>
	<K extends keyof Look>(id: K, v: Partial<Look[K]>) =>
		p.onLook((s) => ({ ...s, [id]: { ...s[id], ...v } }));

/** The top row of a tool card: its name and (Grid) the on/off switch. The mode shows in the
 * main choice right below, so the head does not repeat it. */
export function ToolHead(p: Props & { id: StageId }) {
	const s = p.look;
	const set = setter(p);
	const title = { base: "Base", grid: "Grid" }[p.id];
	return (
		<div className="flex min-h-(--icon-btn-bar) items-center gap-2">
			<h2 className="min-w-0 flex-1 text-sm font-medium">{title}</h2>
			{p.id !== "base" && (
				<Toggle
					testid={`layer-${p.id}`}
					label={`Show ${title}`}
					on={s[p.id].on}
					onChange={(on) => set(p.id, { on })}
				/>
			)}
		</div>
	);
}

/** A thin line between the groups of a card. */
const Rule = () => <div className="my-0.5 h-px bg-separator" />;

/** The controls of one tool: Opacity first, then the main choice at full width, then its settings. */
export function ToolBody(p: ToolCardProps) {
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
	const toned = s.base.kind === "values" || s.base.kind === "shapes";
	return (
		<div
			data-testid="tools"
			className={`atelier-tools -mx-1 flex max-h-[min(60dvh,30rem)] flex-col gap-1.5 overflow-y-auto overscroll-contain px-1 transition-opacity ${dim ? "opacity-60" : ""}`}
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
					{toned && opacity("base")}
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
						</>
					)}
					{s.base.kind === "shapes" && (
						<>
							<Segment
								stacked
								testid="shapes-step"
								label="Paint step"
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
				</>
			)}
			{p.id === "grid" && (
				<>
					{opacity("grid")}
					<Rule />
					<Knob
						testid="grid-step"
						label="Step, cm"
						steps={GRID_CM}
						{...bind("grid", "cm")}
					/>
				</>
			)}
		</div>
	);
}
