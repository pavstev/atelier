// The hover card of a photo in the list: a bigger preview, the name, the file size, the pixel size
// and the day and time it was added. It mounts only while the tip is open, and then reads the
// stored preview (`ensurePreview`). A photo saved before the previews existed gets its preview, and
// its pixel size, from the stored file the first time it is hovered.
import { useEffect, useState } from "react";
import { ensurePreview } from "./missing";
import { addedText, type Doc, sizeText } from "./store";

export default function PhotoCard(p: {
	d: Doc;
	/** Tells the list what the card found out (the pixel size, that the preview is stored). */
	onFacts: (id: string, change: Partial<Doc>) => void;
}) {
	const { d, onFacts } = p;
	// the tiny preview shows at once, blurred up; the stored one replaces it
	const [src, setSrc] = useState(d.thumb);
	useEffect(() => {
		let live = true;
		let url = "";
		void ensurePreview({ id: d.id, width: d.width }).then(
			({ blob, change }) => {
				if (change) onFacts(d.id, change);
				if (blob && live) {
					url = URL.createObjectURL(blob);
					setSrc(url);
				}
			},
		);
		return () => {
			live = false;
			if (url) URL.revokeObjectURL(url);
		};
	}, [d.id, d.width, onFacts]);

	const facts: [string, string][] = [
		["Size", sizeText(d.size)],
		["Pixels", d.width > 0 ? `${d.width} × ${d.height}` : ""],
		["Added", addedText(d.at)],
	];
	return (
		<div data-testid="photo-card" className="flex w-60 flex-col gap-2 py-1">
			<div
				className="grid max-h-64 place-items-center overflow-hidden rounded-(--radius-chip) bg-default"
				style={{
					aspectRatio: d.width > 0 ? `${d.width} / ${d.height}` : "4 / 3",
				}}
			>
				{src && (
					<img
						src={src}
						alt=""
						data-testid="photo-card-image"
						className="size-full object-cover"
					/>
				)}
			</div>
			<p className="wrap-break-word text-sm font-medium">{d.name}</p>
			<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
				{facts
					.filter(([, v]) => v)
					.map(([k, v]) => (
						<div key={k} className="contents">
							<dt className="text-muted">{k}</dt>
							<dd className="tabular-nums">{v}</dd>
						</div>
					))}
			</dl>
		</div>
	);
}
