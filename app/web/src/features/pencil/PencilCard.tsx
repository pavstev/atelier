// The Base card of the Pencil base, in three tabs. Look: the look, Brightness, Contrast, Detail,
// Highlights, Auto and Reset. Effects: Smudge, Lifted lights, Cross-hatch, Deep darks, Local contrast
// and the Texture knobs (only those the look draws). Pencils: the pencils the painter owns and
// Suggest. Auto runs by itself for a new photo (`usePencilAuto`). What each knob does is in
// docs/how-it-works/pencil.md.
import { Button, Tabs } from "@heroui/react";
import { useState } from "react";
import { LABELS } from "@/features/tools/settings";
import { Knob, Segment } from "@/ui/fields";
import GradeRow from "./GradeRow";
import { GRADES, stepPencil } from "./grades";
import {
	AUTO_KEYS,
	PENCIL_LOOKS,
	PENCIL_RANGE,
	type PencilLook,
	resetKnobs,
} from "./knobs";
import { type PencilExtras, SUGGEST_COUNTS } from "./usePencilExtras";

/** The looks the card treats on their own, by the core's number. */
const DRAWING = 1;
const HATCH = 3;
const BY_PENCIL = 4;

/** Where each look sits in the Look row: the row shows 4 buttons, the core's numbers skip the 2. */
const lookIndex = (look: number) =>
	PENCIL_LOOKS.findIndex((l) => l.id === look);

type TabId = "look" | "effects" | "pencils";

/** The tab names, in order. */
const TABS: { id: TabId; label: string }[] = [
	{ id: "look", label: "Look" },
	{ id: "effects", label: "Effects" },
	{ id: "pencils", label: "Pencils" },
];

type Props = {
	pencil: PencilLook;
	/** Changes some of the Pencil settings. */
	onChange: (v: Partial<PencilLook>) => void;
	extras: PencilExtras;
};

/** The effect knobs: the look that draws each one (the core ignores it elsewhere). */
const EFFECTS: {
	key: "smudge" | "lift" | "cross";
	label: string;
	looks: number[];
}[] = [
	{ key: "smudge", label: "Smudge", looks: [0, 1, 3] },
	{ key: "lift", label: "Lifted lights", looks: [0, 1, 3] },
	{ key: "cross", label: "Cross-hatch", looks: [1, 3] },
];

export default function PencilCard({ pencil: s, onChange, extras }: Props) {
	// the open tab lives for the session only; the Look tab comes first
	const [tab, setTab] = useState<TabId>("look");
	const texture = s.look === DRAWING || s.look === HATCH;
	const { count, at, grade } = stepPencil(s.mask, s.step);

	// a hand move of Key, Contrast or Highlights makes the Auto note stale
	const change = (v: Partial<PencilLook>) => {
		if (AUTO_KEYS.some((k) => k in v)) extras.clearNote();
		onChange(v);
	};
	/** A slider for one number setting; the range is the core's. 0 on an effect means off. */
	const knob = (
		key: Exclude<keyof PencilLook, "look" | "mask">,
		label: string,
		testid: string,
		step = 5,
	) => (
		<Knob
			key={testid}
			testid={testid}
			label={label}
			min={PENCIL_RANGE[key][0]}
			max={PENCIL_RANGE[key][1]}
			step={step}
			value={s[key]}
			onChange={(v) => change({ [key]: v })}
		/>
	);
	const runAuto = () =>
		extras.runAuto((a) =>
			onChange(Object.fromEntries(AUTO_KEYS.map((k) => [k, a[k]]))),
		);

	return (
		<Tabs
			selectedKey={tab}
			onSelectionChange={(k) => setTab(String(k) as TabId)}
			className="[--row-label:6.25rem]"
		>
			<Tabs.ListContainer>
				<Tabs.List aria-label="Pencil settings">
					{TABS.map((t) => (
						<Tabs.Tab key={t.id} id={t.id} data-testid={`pencil-tab-${t.id}`}>
							{t.label}
							<Tabs.Indicator />
						</Tabs.Tab>
					))}
				</Tabs.List>
			</Tabs.ListContainer>
			<Tabs.Panel id="look" className="flex flex-col gap-1.5 pt-1.5">
				<Segment
					testid="pencil-look"
					label="Look"
					options={PENCIL_LOOKS.map((l) => l.label)}
					value={lookIndex(s.look)}
					onChange={(i) => change({ look: PENCIL_LOOKS[i]?.id ?? 0 })}
				/>
				<p
					data-testid="pencil-look-hint"
					className="text-xs leading-snug text-muted"
				>
					{PENCIL_LOOKS[lookIndex(s.look)]?.hint}
				</p>
				{s.look === BY_PENCIL && (
					<>
						<Knob
							testid="pencil-step"
							label="Pencils down"
							min={1}
							max={Math.max(count, 2)}
							step={1}
							value={at}
							disabled={count < 2}
							onChange={(step) => change({ step })}
						/>
						<p
							data-testid="pencil-step-line"
							className="text-xs leading-snug text-muted"
						>
							{at} of {count} pencils down: {grade.id}
						</p>
					</>
				)}
				{/* steps of 1: Auto sets any whole number, and the slider must show it */}
				{knob("key", "Brightness", "pencil-key", 1)}
				{knob("contrast", "Contrast", "pencil-contrast", 1)}
				{knob("detail", "Detail", "pencil-detail")}
				{knob("highlights", "Highlights", "pencil-highlights", 1)}
				<div className="flex gap-2">
					<Button
						size="sm"
						variant="secondary"
						className="flex-1"
						data-testid="pencil-auto"
						aria-label="Auto: set Brightness, Contrast and Highlights from the photo"
						isDisabled={extras.busy !== null}
						onPress={runAuto}
					>
						Auto
					</Button>
					<Button
						size="sm"
						variant="secondary"
						className="flex-1"
						data-testid="pencil-reset"
						aria-label="Reset every knob and effect to its start; the look and the pencils stay"
						onPress={() => change(resetKnobs(s))}
					>
						Reset
					</Button>
				</div>
				<p
					data-testid="pencil-auto-note"
					aria-live="polite"
					className={
						extras.note ? "text-xs leading-snug text-muted" : "sr-only"
					}
				>
					{extras.note ?? ""}
				</p>
			</Tabs.Panel>
			<Tabs.Panel id="effects" className="flex flex-col gap-1.5 pt-1.5">
				{EFFECTS.filter((e) => e.looks.includes(s.look)).map((e) =>
					knob(e.key, e.label, `pencil-${e.key}`),
				)}
				{knob("darks", "Deep darks", "pencil-darks")}
				{knob("local", "Local contrast", "pencil-local")}
				{texture && (
					<div
						data-testid="pencil-texture-group"
						className="flex min-w-0 flex-col gap-1.5"
					>
						{knob("grain", "Texture", "pencil-grain")}
						<Segment
							testid="pencil-paper"
							label="Paper"
							options={LABELS.pencilPaper}
							value={s.paper}
							onChange={(paper) => change({ paper })}
						/>
						{knob("angle", "Hatch angle", "pencil-hatch-angle", 1)}
						{s.look === HATCH &&
							knob("density", "Hatch density", "pencil-hatch-density")}
					</div>
				)}
			</Tabs.Panel>
			<Tabs.Panel id="pencils" className="flex flex-col gap-1.5 pt-1.5">
				<GradeRow mask={s.mask} onChange={(mask) => change({ mask })} />
				<Segment
					testid="pencil-suggest-count"
					label="How many"
					options={SUGGEST_COUNTS.map(String)}
					value={extras.count - SUGGEST_COUNTS[0]}
					onChange={(i) => extras.setCount(SUGGEST_COUNTS[0] + i)}
				/>
				<Button
					size="sm"
					variant="secondary"
					data-testid="pencil-suggest"
					aria-label="Suggest the best pencils for this photo"
					isDisabled={extras.busy !== null}
					onPress={extras.runSuggest}
				>
					Suggest pencils
				</Button>
				{extras.suggested !== null && (
					<div className="flex items-center gap-2">
						<ul
							data-testid="pencil-suggested"
							data-mask={extras.suggested}
							aria-label="Suggested pencils"
							className="flex min-w-0 flex-1 flex-wrap gap-1"
						>
							{GRADES.flatMap((g, bit) =>
								((extras.suggested ?? 0) >> bit) & 1
									? [
											<li
												key={g.id}
												data-testid="pencil-suggested-grade"
												data-grade={g.id}
												className="rounded-full border border-separator px-2 py-0.5 text-xs font-medium"
											>
												{g.id}
											</li>,
										]
									: [],
							)}
						</ul>
						<Button
							size="sm"
							variant="primary"
							data-testid="pencil-suggest-apply"
							aria-label="Use the suggested pencils"
							isDisabled={extras.suggested === s.mask}
							onPress={() => change({ mask: extras.suggested ?? s.mask })}
						>
							Apply
						</Button>
					</div>
				)}
				{extras.error && (
					<p
						role="alert"
						data-testid="pencil-error"
						className="text-xs text-danger"
					>
						{extras.error}
					</p>
				)}
			</Tabs.Panel>
		</Tabs>
	);
}
