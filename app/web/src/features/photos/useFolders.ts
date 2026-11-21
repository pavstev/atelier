// The folders of the photo list as React state, and their saving, next to which folders are open.
// The folders change only through `apply` (one pure reducer, `foldersReducer`), which writes the
// ref and the state together. Another tab that saves the folders wins: this page reads them again
// on the `storage` event. Which folders are open is a small saved list of ids on this device.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KEYS, SAVE_MS, useSaved } from "@/lib/storage";
import {
	type Folder,
	type FoldersAction,
	foldersReducer,
	readFolders,
	readOpen,
} from "./store";

export function useFolders(onSaveFail: () => void) {
	const [folders, setState] = useState<Folder[]>(readFolders);
	const foldersRef = useRef(folders);
	const apply = useCallback((a: FoldersAction) => {
		const next = foldersReducer(foldersRef.current, a);
		if (next === foldersRef.current) return;
		foldersRef.current = next;
		setState(next);
	}, []);
	useSaved(KEYS.folders, folders, SAVE_MS, { onFail: onSaveFail });
	// another tab saved the folders
	useEffect(() => {
		const on = (e: StorageEvent) => {
			if (e.storageArea !== localStorage) return;
			if (e.key !== null && e.key !== KEYS.folders) return;
			apply({ type: "set", list: readFolders() });
		};
		window.addEventListener("storage", on);
		return () => window.removeEventListener("storage", on);
	}, [apply]);

	const [openIds, setOpenIds] = useState<string[]>(readOpen);
	// the ids of deleted folders are not kept
	const kept = useMemo(() => {
		const ids = new Set(folders.map((f) => f.id));
		const left = openIds.filter((id) => ids.has(id));
		return left.length === openIds.length ? openIds : left;
	}, [openIds, folders]);
	useSaved(KEYS.open, kept);
	const open = useMemo(() => new Set(openIds), [openIds]);
	const setOpen = useCallback(
		(id: string, on: boolean) =>
			setOpenIds((l) =>
				on === l.includes(id) ? l : on ? [...l, id] : l.filter((x) => x !== id),
			),
		[],
	);
	/** Opens these folders (the ones that hold a photo that must show). */
	const openAll = useCallback(
		(ids: string[]) =>
			setOpenIds((l) => {
				const more = ids.filter((id) => !l.includes(id));
				return more.length > 0 ? [...l, ...more] : l;
			}),
		[],
	);

	/** Makes a folder inside `parent` and opens `parent` so the new one shows. Gives its id. */
	const addFolder = useCallback(
		(name: string, parent: string): string => {
			const id = crypto.randomUUID();
			apply({ type: "add", folder: { id, name, parent } });
			if (parent !== "") setOpen(parent, true);
			return id;
		},
		[apply, setOpen],
	);

	return { folders, foldersRef, apply, open, setOpen, openAll, addFolder };
}
