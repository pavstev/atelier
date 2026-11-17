// The little picture at the top of the Size card: the paper in its shape and the photo faint behind it.
// Fit to paper: the paper is the part of the photo that stays. Whole photo: the paper as a dashed
// frame next to the photo, both with the same long side. A vector drawing, so it is sharp at any
// pixel density. Its box has a fixed height, so the card does not jump when the choice changes.
import { type Choice, fmtCm, paperCm, previewRects } from "./paper";

const W = 240;
const H = 96;
/** Room kept around the drawing so the strokes are not cut at the box edge. */
const PAD = 3;

export default function SizePreview(p: {
	choice: Choice;
	photoW: number;
	photoH: number;
}) {
	const { choice: c } = p;
	const cm = paperCm(c, p.photoW, p.photoH);
	const { photo, paper } = previewRects(
		c,
		p.photoW,
		p.photoH,
		W - 2 * PAD,
		H - 2 * PAD,
	);
	const at = (r: { x: number; y: number }) => ({ x: r.x + PAD, y: r.y + PAD });
	return (
		<svg
			data-testid="size-preview"
			data-fit={c.fit}
			data-ratio={(cm.w / cm.h).toFixed(4)}
			viewBox={`0 0 ${W} ${H}`}
			role="img"
			aria-label={`Paper ${fmtCm(cm.w)} by ${fmtCm(cm.h)} cm, ${c.fit ? "the photo is cut to it" : "the whole photo"}`}
			className="block h-24 w-full shrink-0 rounded-(--radius-chip) bg-default/60"
		>
			<rect
				{...at(photo)}
				width={photo.w}
				height={photo.h}
				rx={1.5}
				className="fill-foreground/10 stroke-foreground/25"
				strokeWidth={1}
				vectorEffect="non-scaling-stroke"
			/>
			<rect
				{...at(paper)}
				width={paper.w}
				height={paper.h}
				rx={1.5}
				className={
					c.fit
						? "fill-accent/30 stroke-accent"
						: "fill-transparent stroke-accent"
				}
				strokeWidth={1.5}
				strokeDasharray={c.fit ? undefined : "4 3"}
				vectorEffect="non-scaling-stroke"
			/>
		</svg>
	);
}
