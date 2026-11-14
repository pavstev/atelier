// What Auto did, in plain words: the note under the Auto button. A pure function of the core's
// numbers (`PencilAuto`), so a node test can check it. No React.
import type { PencilAuto } from "@/draw/calls";

/** The key class names, in the core's order (`PencilAuto.keyClass`). */
const CLASS_NAMES = ["Low key", "Mid key", "High key"];

/** A knob within this many points of 50 counts as unchanged. */
const NEAR = 3;

/** A key move of at most this many points is "a little": half a stop (the Key scale is 25 points
 * per stop, and Auto moves the key one stop at most). */
const LITTLE = 12;

/** The key sentence: which way Auto moved the key and how far. */
function keyWords(a: PencilAuto): string {
	if (a.bimodal)
		return "The photo has two separate groups of tones, so the key stays.";
	const d = a.key - 50;
	if (Math.abs(d) <= NEAR) return "The key stays.";
	const how = Math.abs(d) <= LITTLE ? "a little" : "a lot";
	return `${d > 0 ? "Lifted" : "Lowered"} the key ${how}.`;
}

/** The contrast sentence. */
function contrastWords(a: PencilAuto): string {
	const d = a.contrast - 50;
	if (Math.abs(d) <= NEAR)
		return "The tones are spread well, so contrast stays.";
	return d > 0
		? "The middle tones are close together, so more contrast."
		: "The middle tones are far apart, so less contrast.";
}

/** The note for an Auto answer, for example "Low key photo (middle tone L* 28). Lifted the key a
 * little. The middle tones are close together, so more contrast. 1 percent stays bare paper." */
export function explainAuto(a: PencilAuto): string {
	const name = CLASS_NAMES[a.keyClass] ?? CLASS_NAMES[1];
	const parts = [
		`${name} photo (middle tone L* ${Math.round(a.median)}).`,
		keyWords(a),
		contrastWords(a),
		`${a.highlights} percent stays bare paper${a.spike ? ", with a little extra for a bright glint" : ""}.`,
	];
	return parts.join(" ");
}
