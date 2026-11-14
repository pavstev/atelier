// The Base card of the Pencil base: the look, its knobs in a Tone and a Texture group (only those
// the look reads), the By pencil step, Auto and Reset, the pencils the painter owns and Suggest.
// What each knob does is in `.agents/pencil-v2-decisions.md` and docs/how-it-works/pencil.md.
import { Button } from "@heroui/react";
import { useId } from "react";
import { LABELS } from "@/features/tools/settings";
import { Choice, Knob, Segment } from "@/ui/fields";
import GradeRow from "./GradeRow";
import { GRADES, stepPencil } from "./grades";
import { PENCIL_RANGE, type PencilLook, resetKnobs } from "./knobs";
import { type PencilExtras, SUGGEST_COUNTS } from "./usePencilExtras";

/** The looks the card treats on their own, in the core's numbers (`LABELS.pencilLook` has the names). */
const DRAWING = 1;
const ZONES = 2;
const HATCH = 3;
const BY_PENCIL = 4;

/** One line under the look: what it is for. */
const LOOK_HINTS = [
	"Smooth gray tones. Good for judging the values.",
	"The tones with paper grain, like a pencil drawing.",
	"Flat zones, one pencil each. The simplest map.",
	"Lines that follow the form, crossed in the darks. The slowest look.",
	"The drawing built up one pencil at a time, lightest first.",
];

type Props = {
	pencil: PencilLook;
	/** Changes some of the Pencil settings. */
	onChange: (v: Partial<PencilLook>) => void;
	extras: PencilExtras;
};

/** A small heading for a group of knobs. */
function Heading(p: { id: string; children: string }) {
	return (
		<h3 id={p.id} className="atelier-label pt-1 text-xs font-medium text-muted">
			{p.children}
		</h3>
	);
}

export default function PencilCard({ pencil: s, onChange, extras }: Props) {
	const toneId = useId();
	const textureId = useId();
	const zones = s.look === ZONES;
	const texture = s.look === DRAWING || s.look === HATCH;
	const { count, at, grade } = stepPencil(s.mask, s.step);

	// a hand move of Key, Contrast or Highlights makes the Auto note stale
	const change = (v: Partial<PencilLook>) => {
		if ("key" in v || "contrast" in v || "highlights" in v) extras.clearNote();
		onChange(v);
	};
	/** A slider for one number setting; the range is the core's. */
	const knob = (
		key: Exclude<keyof PencilLook, "look" | "mask">,
		label: string,
		testid: string,
		step = 5,
	) => (
		<Knob
			testid={testid}
			label={label}
			min={PENCIL_RANGE[key][0]}
			max={PENCIL_RANGE[key][1]}
			step={step}
			value={s[key]}
			onChange={(v) => change({ [key]: v })}
		/>
	);

	return (
		<div className="flex flex-col gap-1.5 [--row-label:6.25rem]">
			<Choice
				testid="pencil-look"
				label="Look"
				options={LABELS.pencilLook}
				value={s.look}
				onChange={(look) => change({ look })}
			/>
			<p
				data-testid="pencil-look-hint"
				className="text-xs leading-snug text-muted"
			>
				{LOOK_HINTS[s.look]}
			</p>
			{s.look === BY_PENCIL && (
				<>
					<Knob
						testid="pencil-step"
						label="Step"
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
						Step {at} of {count}: {grade.id}
					</p>
				</>
			)}
			<div className="flex gap-2">
				{!zones && (
					<Button
						size="sm"
						variant="secondary"
						className="flex-1"
						data-testid="pencil-auto"
						aria-label="Auto: set Key, Contrast and Highlights from the photo"
						isDisabled={extras.busy !== null}
						onPress={() =>
							extras.runAuto((a) =>
								onChange({
									key: a.key,
									contrast: a.contrast,
									highlights: a.highlights,
								}),
							)
						}
					>
						Auto
					</Button>
				)}
				<Button
					size="sm"
					variant="secondary"
					className="flex-1"
					data-testid="pencil-reset"
					aria-label="Reset every knob to its start; the look and the pencils stay"
					onPress={() => change(resetKnobs(s))}
				>
					Reset
				</Button>
			</div>
			{!zones && (
				<p
					data-testid="pencil-auto-note"
					aria-live="polite"
					className={
						extras.note ? "text-xs leading-snug text-muted" : "sr-only"
					}
				>
					{extras.note ?? ""}
				</p>
			)}
			<fieldset
				aria-labelledby={toneId}
				data-testid="pencil-tone-group"
				className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0"
			>
				<Heading id={toneId}>Tone</Heading>
				{/* steps of 1: Auto sets any whole number, and the slider must show it */}
				{!zones && knob("key", "Key", "pencil-key", 1)}
				{!zones && knob("contrast", "Contrast", "pencil-contrast", 1)}
				{knob("highlights", "Highlights", "pencil-highlights", 1)}
				{knob("darks", "Deep darks", "pencil-darks")}
				{!zones && knob("local", "Local contrast", "pencil-local")}
				{knob("detail", "Detail", "pencil-detail")}
			</fieldset>
			{texture && (
				<fieldset
					aria-labelledby={textureId}
					data-testid="pencil-texture-group"
					className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0"
				>
					<Heading id={textureId}>Texture</Heading>
					{knob("grain", "Grain", "pencil-grain")}
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
				</fieldset>
			)}
			<GradeRow mask={s.mask} onChange={(mask) => change({ mask })} />
			<div className="flex flex-col gap-1.5">
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
			</div>
		</div>
	);
}
