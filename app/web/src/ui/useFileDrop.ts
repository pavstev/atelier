// Dropping image files on an element. `over` is true while files are dragged over it (it does not
// flicker when the pointer moves onto a child), and only files count: a dragged text does nothing.
import { type DragEvent, useState } from "react";

const carriesFiles = (e: DragEvent) => e.dataTransfer.types.includes("Files");

/** The drag handlers for the element, and whether files are over it now. */
export function useFileDrop(onFiles: (files: File[]) => void) {
	const [over, setOver] = useState(false);
	const props = {
		onDragOver: (e: DragEvent) => {
			if (!carriesFiles(e)) return;
			e.preventDefault();
			setOver(true);
		},
		onDragLeave: (e: DragEvent) => {
			const to = e.relatedTarget;
			if (!(to instanceof Node) || !e.currentTarget.contains(to))
				setOver(false);
		},
		onDrop: (e: DragEvent) => {
			if (!carriesFiles(e)) return;
			e.preventDefault();
			setOver(false);
			const files = Array.from(e.dataTransfer.files).filter((f) =>
				f.type.startsWith("image/"),
			);
			if (files.length > 0) onFiles(files);
		},
	};
	return { over, props };
}
