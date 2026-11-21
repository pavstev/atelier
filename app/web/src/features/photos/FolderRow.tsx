// One folder of the list: an arrow, the folder icon, the name and how many photos are in it (the
// folders inside count too). A click opens or closes it; a double-click or F2 renames it. On hover
// or focus three small buttons float over the right end: a new folder inside, move and delete (a
// fourth would hide the name on a narrow panel; a touch screen also gets the pen, as it has no
// double-click or F2). The row can be dragged onto another folder, and
// photos and folders can be dropped on it (`drag.ts`).
import { Input } from "@heroui/react";
import { memo, useState } from "react";
import { Icon, IconButton } from "@/ui/icons";
import { type DropCtx, dragProps, dropProps } from "./drag";
import MoveMenu from "./MoveMenu";
import { type Folder, subtree } from "./store";

const ACTION = "rounded-field transition-colors hover:bg-foreground/15";

type Props = {
	folder: Folder;
	/** All folders, for the move menu. */
	folders: Folder[];
	open: boolean;
	count: number;
	/** A drag is over this folder. */
	over: boolean;
	/** The name is being typed. */
	editing: boolean;
	drop: DropCtx;
	onEditing: (id: string, on: boolean) => void;
	onToggle: (id: string, open: boolean) => void;
	onRename: (id: string, name: string) => void;
	onNewInside: (id: string) => void;
	onMove: (id: string, parent: string) => void;
	onDelete: (id: string) => void;
};

const FolderRow = memo(function FolderRow(p: Props) {
	const { folder: f } = p;
	const [text, setText] = useState(f.name);
	const done = (save: boolean) => {
		p.onEditing(f.id, false);
		const name = text.trim();
		if (save && name && name !== f.name) p.onRename(f.id, name);
		else setText(f.name);
	};
	const startRename = () => {
		setText(f.name);
		p.onEditing(f.id, true);
	};
	return (
		<div
			data-testid="folder-row"
			data-open={p.open}
			data-over={p.over}
			data-folder={f.id}
			{...dragProps({ kind: "folder", id: f.id }, !p.editing)}
			className={`group relative flex items-center gap-1 rounded-field px-1 py-0.5 hover:bg-default ${
				p.over ? "bg-accent/20 ring-1 ring-accent ring-inset" : ""
			}`}
			{...dropProps(f.id, p.drop)}
		>
			{p.editing ? (
				<>
					<Icon name="folder" className="size-4 shrink-0" />
					<Input
						autoFocus
						aria-label="Folder name"
						data-testid="folder-name"
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
				<button
					type="button"
					data-testid="folder-toggle"
					aria-expanded={p.open}
					className="atelier-focus flex min-w-0 flex-1 cursor-pointer items-center gap-1 rounded-(--radius-chip) text-start text-sm"
					title="Double-click or press F2 to rename"
					onClick={() => p.onToggle(f.id, !p.open)}
					onDoubleClick={startRename}
					onKeyDown={(e) => {
						if (e.key === "F2") startRename();
					}}
				>
					<Icon
						name={p.open ? "down" : "right"}
						className="size-3.5 shrink-0 text-muted"
					/>
					<Icon name="folder" className="size-4 shrink-0" />
					<span data-testid="folder-label" className="truncate">
						{f.name}
					</span>
					<span
						data-testid="folder-count"
						className="ms-auto shrink-0 ps-1 text-xs text-muted"
					>
						{p.count}
					</span>
				</button>
			)}
			{!p.editing && (
				<span className="pointer-events-none absolute inset-y-0 right-0 flex items-center gap-0.5 rounded-e-field bg-[linear-gradient(to_left,var(--default)_75%,transparent)] ps-6 pe-0.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 group-focus-within:[&>*]:pointer-events-auto group-hover:[&>*]:pointer-events-auto">
					<IconButton
						label={`New folder inside ${f.name}`}
						tip="New folder inside"
						icon="plus"
						testid="folder-new-inside"
						size="row"
						className={ACTION}
						onPress={() => p.onNewInside(f.id)}
					/>
					{/* a touch screen has no double-click or F2: the pen shows there only */}
					<IconButton
						label={`Rename ${f.name}`}
						tip="Rename"
						icon="pen"
						testid="folder-rename"
						size="row"
						className={`${ACTION} hidden pointer-coarse:inline-flex`}
						onPress={startRename}
					/>
					<MoveMenu
						label={`Move ${f.name}`}
						testid="folder-move"
						folders={p.folders}
						current={f.parent}
						skip={subtree(p.folders, f.id)}
						className={ACTION}
						onMove={(to) => p.onMove(f.id, to)}
					/>
					<IconButton
						label={`Delete ${f.name}`}
						tip="Delete"
						icon="trash"
						testid="folder-delete"
						size="row"
						className={`${ACTION} hover:bg-danger/20 hover:text-danger`}
						onPress={() => p.onDelete(f.id)}
					/>
				</span>
			)}
		</div>
	);
});

export default FolderRow;
