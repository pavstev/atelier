// Dragging a photo or a folder inside the list, and the drop spots that take them. A drop spot is a
// folder row, the open part under a folder, or the whole list (the top). Files dragged in from the
// computer only mark the spot (`onOver`); the panel adds them (`Files.tsx`). Plain code, no React
// state: the owner keeps which spot is under the pointer.
import type { DragEvent } from "react";

/** The drag data type of a photo or a folder of the list. */
const ITEM = "application/x-atelier-item";

export type Item = { kind: "photo" | "folder"; id: string };

export function startDrag(e: DragEvent, item: Item) {
	e.dataTransfer.setData(ITEM, JSON.stringify(item));
	e.dataTransfer.effectAllowed = "move";
}

/** Makes an element a drag source for `item` (`on` false: it cannot be dragged, e.g. while typing). */
export function dragProps(item: Item, on = true) {
	return {
		draggable: on,
		onDragStart: (e: DragEvent) => startDrag(e, item),
	};
}

const carriesItem = (e: DragEvent) => e.dataTransfer.types.includes(ITEM);
const carriesFiles = (e: DragEvent) => e.dataTransfer.types.includes("Files");

function readItem(e: DragEvent): Item | null {
	try {
		const v: unknown = JSON.parse(e.dataTransfer.getData(ITEM));
		if (typeof v !== "object" || v === null) return null;
		const { kind, id } = v as Record<string, unknown>;
		return (kind === "photo" || kind === "folder") && typeof id === "string"
			? { kind, id }
			: null;
	} catch {
		return null;
	}
}

/** What a drop spot tells its owner. */
export type DropCtx = {
	/** The spot under the pointer (`null` when it left). "" is the top. */
	onOver: (id: string | null) => void;
	/** A photo or folder was dropped on the spot. */
	onItem: (item: Item, id: string) => void;
};

/** Only the nearest drop spot acts, so a spot inside another one does not wake the outer one. */
const mine = (e: DragEvent) =>
	e.target instanceof Element &&
	e.target.closest("[data-drop]") === e.currentTarget;

/** The handlers and the marker of one drop spot. `id` is the folder id, "" for the top. */
export function dropProps(id: string, ctx: DropCtx) {
	return {
		"data-drop": id,
		onDragOver: (e: DragEvent) => {
			if (!mine(e) || !(carriesItem(e) || carriesFiles(e))) return;
			e.preventDefault();
			ctx.onOver(id);
		},
		onDragLeave: (e: DragEvent) => {
			const to = e.relatedTarget;
			if (!(to instanceof Node) || !e.currentTarget.contains(to))
				ctx.onOver(null);
		},
		// a drag from a row inside ended (dropped or cancelled): no spot is marked any more
		onDragEnd: () => ctx.onOver(null),
		onDrop: (e: DragEvent) => {
			const item = readItem(e);
			// files are left for the panel
			if (!item || !mine(e)) return;
			e.preventDefault();
			ctx.onOver(null);
			ctx.onItem(item, id);
		},
	};
}
