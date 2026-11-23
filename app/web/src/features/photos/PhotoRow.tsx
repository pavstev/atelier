// One photo of the list: a small preview and the name, or a tile. A hover shows the bigger preview
// with the facts (`PhotoCard`). A click shows the photo, the pen renames it, the bin deletes it. The
// pen and the bin float over the right end of the row on hover or focus (always, on a touch screen).
import { Input, Tooltip } from "@heroui/react";
import { memo, useState } from "react";
import { IconButton, tipDelay } from "@/ui/icons";
import { startDrag } from "./drag";
import MoveMenu from "./MoveMenu";
import PhotoCard from "./PhotoCard";
import { highlight } from "./search";
import type { Doc, Folder } from "./store";

/** The pen and the bin: a `row` icon button that fills on hover (the bin turns red). */
const ROW_ACTION =
	"rounded-(--radius-chip) transition-colors hover:bg-foreground/15";

/** The little preview of a photo, or a plain box until it is made. A small square in the list, the
 * whole width of its tile in tiles. */
function Thumb(p: { src: string; tile?: boolean }) {
	return (
		<span
			className={`grid shrink-0 grid-cols-[100%] grid-rows-[100%] place-items-center overflow-hidden rounded-(--radius-chip) ${
				p.src ? "" : "bg-default"
			} ${p.tile ? "aspect-square w-full" : "size-7"}`}
		>
			{p.src && (
				<img
					src={p.src}
					alt=""
					draggable={false}
					className="size-full object-contain"
				/>
			)}
		</span>
	);
}

/** A name with the parts that matched the search marked. */
function Name(p: { name: string; terms: string[] }) {
	return (
		<span className="truncate">
			{highlight(p.name, p.terms).map((s, i) => (
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: the pieces never reorder
					key={i}
					className={
						s.hit ? "rounded-(--radius-chip) bg-accent/30 text-foreground" : ""
					}
				>
					{s.text}
				</span>
			))}
		</span>
	);
}

type RowProps = {
	d: Doc;
	/** Shown as a tile, not a row. */
	tile: boolean;
	active: boolean;
	terms: string[];
	/** All folders, for the move menu. */
	folders: Folder[];
	/** The folder path to show under the name (a search result), or "". */
	where: string;
	onSelect: (id: string) => void;
	onMove: (id: string, folder: string) => void;
	onRename: (id: string, name: string) => void;
	onRemove: (id: string) => void;
	onFacts: (id: string, change: Partial<Doc>) => void;
};

/** One photo: the preview and the name only. */
const PhotoRow = memo(function PhotoRow(p: RowProps) {
	const { d } = p;
	const [editing, setEditing] = useState(false);
	const [text, setText] = useState(d.name);
	const done = (save: boolean) => {
		setEditing(false);
		const name = text.trim();
		if (save && name && name !== d.name) p.onRename(d.id, name);
		else setText(d.name);
	};
	const { tile } = p;
	return (
		<li
			data-testid="photo-row"
			data-active={p.active}
			draggable={!editing}
			onDragStart={(e) => startDrag(e, { kind: "photo", id: d.id })}
			className={`group relative flex rounded-field bg-(--ovl-bg) transition-colors duration-100 ${
				tile ? "flex-col gap-1 p-1" : "items-center gap-2 px-1 py-0.5"
			} ${
				p.active
					? "[--ovl-bg:var(--default-hover)] shadow-[inset_2px_0_0_var(--accent)]"
					: "[--ovl-bg:transparent] hover:[--ovl-bg:var(--default)] has-[:focus-visible]:[--ovl-bg:var(--default)]"
			}`}
		>
			{editing ? (
				<>
					<Thumb src={d.thumb} tile={tile} />
					<Input
						autoFocus
						aria-label="Photo name"
						data-testid="photo-name"
						value={text}
						maxLength={120}
						className="min-w-0 flex-1"
						onFocus={(e) => e.currentTarget.select()}
						onChange={(e) => setText(e.target.value)}
						onBlur={() => done(true)}
						onKeyDown={(e) => {
							if (e.key === "Enter") done(true);
							if (e.key === "Escape") done(false);
						}}
					/>
				</>
			) : (
				<Tooltip delay={tipDelay()}>
					<Tooltip.Trigger
						className="flex min-w-0 flex-1"
						tabIndex={-1}
						role="presentation"
					>
						<button
							type="button"
							data-testid="photo-open"
							aria-current={p.active ? "true" : undefined}
							className={`atelier-focus flex min-w-0 flex-1 cursor-pointer rounded-(--radius-chip) text-start text-sm ${
								tile ? "flex-col gap-1" : "items-center gap-2"
							}`}
							onClick={() => p.onSelect(d.id)}
						>
							<Thumb src={d.thumb} tile={tile} />
							{p.where ? (
								<span className="flex min-w-0 flex-col">
									<Name name={d.name} terms={p.terms} />
									<span
										data-testid="photo-where"
										className="truncate text-xs text-muted"
									>
										{p.where}
									</span>
								</span>
							) : (
								<Name name={d.name} terms={p.terms} />
							)}
						</button>
					</Tooltip.Trigger>
					<Tooltip.Content placement="right" offset={14}>
						<PhotoCard d={d} onFacts={p.onFacts} />
					</Tooltip.Content>
				</Tooltip>
			)}
			{!editing && (
				<span
					className={`pointer-coarse:pointer-events-auto pointer-coarse:opacity-100 pointer-events-none absolute flex items-center gap-1 opacity-0 group-has-[:focus-visible]:opacity-100 group-hover:opacity-100 group-has-[:focus-visible]:[&>button]:pointer-events-auto group-hover:[&>button]:pointer-events-auto ${
						tile
							? "top-2 right-2 rounded-[6px] bg-default/90 p-0.5 backdrop-blur-sm"
							: "inset-y-0 right-0 rounded-e-field bg-[linear-gradient(to_left,var(--ovl-bg)_75%,transparent)] ps-6 pe-1"
					}`}
				>
					<IconButton
						label={`Rename ${d.name}`}
						tip="Rename"
						icon="pen"
						testid="photo-rename"
						size="row"
						className={ROW_ACTION}
						onPress={() => {
							setText(d.name);
							setEditing(true);
						}}
					/>
					<MoveMenu
						label={`Move ${d.name}`}
						testid="photo-move"
						folders={p.folders}
						current={d.folder}
						className={ROW_ACTION}
						onMove={(to) => p.onMove(d.id, to)}
					/>
					<IconButton
						label={`Delete ${d.name}`}
						tip="Delete"
						icon="trash"
						testid="photo-delete"
						size="row"
						className={`${ROW_ACTION} hover:bg-danger/20 hover:text-danger`}
						onPress={() => p.onRemove(d.id)}
					/>
				</span>
			)}
		</li>
	);
});

export default PhotoRow;
