// The photo on screen: the list comes from `useDocsList`, the messages from `useMessages`, adding
// from `addPhotos`, what a row lacks from `missing`, reading a photo back from `loadStored`, the
// reload from `restoreSession`. Here are the active photo and its decoded pixels; showing and
// deleting. `App.tsx` only wires the result to the screen; the layers are drawn in `useLayers.ts`.
import {
	useCallback,
	useEffect,
	useEffectEvent,
	useRef,
	useState,
} from "react";
import { loadPhoto as sendPhoto } from "@/draw/coreClient";
import { touchFacts } from "@/draw/facts";
import { forgetView } from "@/features/stage/views";
import { addPhotos } from "./addPhotos";
import { loadStored } from "./loadStored";
import { isComplete, missingFromPixels } from "./missing";
import { restoreSession } from "./restoreSession";
import {
	decoded,
	deleteFile,
	photoIdsIn,
	readActive,
	subtree,
	writeActive,
} from "./store";
import { useDocsList } from "./useDocsList";
import { useFolders } from "./useFolders";
import { useMessages } from "./useMessages";

const SAVE_FAILED =
	"The photo list could not be kept: the browser storage is full or blocked. New photos may be missing after a reload.";

export function usePhotos() {
	const [start] = useState(readActive);
	const { errors, fail, clear } = useMessages();
	const { docs, docsRef, apply, patch } = useDocsList(() =>
		fail("save", SAVE_FAILED),
	);
	const tree = useFolders(() => fail("save", SAVE_FAILED));
	const [activeId, setActiveIdState] = useState<string | null>(start);
	const [photo, setPhoto] = useState<ImageData | null>(null);
	/** Counts up with each add or switch, so slow work for an older choice can tell it is stale. */
	const latest = useRef(0);
	/** The active id for work that outlives its render; written with the state by `setActive`. */
	const activeRef = useRef(activeId);
	const setActive = useCallback((id: string | null) => {
		activeRef.current = id;
		setActiveIdState(id);
	}, []);

	const active = docs.find((d) => d.id === activeId) ?? null;
	const name = active?.name ?? "";

	useEffect(() => writeActive(activeId), [activeId]);

	// What the photo on screen still lacks (hash, pixel size, tile, bigger preview), made once.
	useEffect(() => {
		if (!photo || !activeId) return;
		const id = activeId;
		const d = docsRef.current.find((x) => x.id === id);
		if (!d || isComplete(d)) return;
		let live = true;
		void missingFromPixels(d, photo).then((change) => {
			if (live && Object.keys(change).length > 0) patch(id, change);
		});
		return () => {
			live = false;
		};
	}, [photo, activeId, patch, docsRef]);

	/** Puts a photo on screen as the active one. */
	const show = useCallback(
		(id: string, img: ImageData) => {
			decoded.set(id, img);
			setActive(id);
			setPhoto(img);
			clear("photo");
			touchFacts();
		},
		[setActive, clear],
	);

	/** Adds photos: the first that opens is shown, the others join the list. */
	const { foldersRef } = tree;
	const open = useCallback(
		(files: File[], folder = "") =>
			addPhotos(files, {
				latest,
				docs: docsRef,
				apply,
				show,
				fail,
				clear,
				// a folder that is gone gets no photos: they go to the top
				folder: foldersRef.current.some((f) => f.id === folder) ? folder : "",
			}),
		[docsRef, foldersRef, apply, show, fail, clear],
	);

	/** Shows a photo: from memory when it is cached, else decoded again from its saved file. */
	const activate = useCallback(
		async (id: string): Promise<void> => {
			const me = ++latest.current;
			clear("photo");
			let img = decoded.get(id);
			if (!img) {
				const stored = await loadStored(id);
				if (me !== latest.current) return;
				if (stored.kind === "error") {
					// cannot read is not gone: keep the row
					fail("photo", stored.text);
					return;
				}
				if (stored.kind === "gone") {
					// the saved file is gone: drop the row and show the next photo, if any
					const at = docsRef.current.findIndex((d) => d.id === id);
					apply({ type: "remove", id });
					const rest = docsRef.current;
					const next = rest[Math.min(at, rest.length - 1)];
					if (next) void activate(next.id);
					return;
				}
				img = stored.img;
			}
			// Send it to the layers worker now, so the first draw does not wait for the copy.
			sendPhoto(img).catch(() => {});
			show(id, img);
		},
		[show, apply, fail, clear, docsRef],
	);

	/** Renames a photo. */
	const rename = useCallback(
		(id: string, name: string) => patch(id, { name }),
		[patch],
	);

	/** Deletes photos from this device. If the one on screen goes, its neighbour gets the screen. */
	const removeMany = useCallback(
		(ids: string[]) => {
			const list = docsRef.current;
			const gone = new Set(ids.filter((id) => list.some((d) => d.id === id)));
			if (gone.size === 0) return;
			const shown = activeRef.current;
			const at = shown ? list.findIndex((d) => d.id === shown) : -1;
			apply({ type: "drop", ids: gone });
			const rest = docsRef.current;
			for (const id of gone) {
				void deleteFile(id);
				forgetView(id);
				decoded.delete(id);
			}
			if (!shown || !gone.has(shown)) return;
			const next = rest[Math.min(at, rest.length - 1)];
			if (next) {
				void activate(next.id);
				return;
			}
			latest.current++;
			setActive(null);
			setPhoto(null);
		},
		[activate, apply, setActive, docsRef],
	);
	const remove = useCallback((id: string) => removeMany([id]), [removeMany]);

	/** Moves photos into a folder ("" is the top). A folder that is gone counts as the top. */
	const moveTo = useCallback(
		(ids: string[], folder: string) => {
			const to = foldersRef.current.some((f) => f.id === folder) ? folder : "";
			apply({ type: "move", ids: new Set(ids), folder: to });
		},
		[apply, foldersRef],
	);

	const applyFolders = tree.apply;
	/** Deletes a folder, every folder inside it and every photo in them. */
	const removeFolder = useCallback(
		(id: string) => {
			const ids = subtree(foldersRef.current, id);
			removeMany(photoIdsIn(docsRef.current, foldersRef.current, id));
			applyFolders({ type: "drop", ids });
		},
		[removeMany, applyFolders, foldersRef, docsRef],
	);
	const renameFolder = useCallback(
		(id: string, name: string) => applyFolders({ type: "rename", id, name }),
		[applyFolders],
	);
	const moveFolder = useCallback(
		(id: string, parent: string) => applyFolders({ type: "move", id, parent }),
		[applyFolders],
	);

	// After a reload: drop the photos whose file is gone, then show the one that was on screen.
	const restore = useEffectEvent(() =>
		restoreSession({
			start,
			docs: docsRef,
			latest,
			apply,
			patch,
			activate,
			setActive,
		}),
	);
	useEffect(() => {
		void restore();
	}, []);

	/** Tells the facts element a draw finished or a photo went to the worker (not React state). */
	const bump = useCallback(() => {
		clear("layer");
		touchFacts();
	}, [clear]);
	const layerFailed = useCallback(
		(text: string) => fail("layer", text),
		[fail],
	);

	return {
		docs,
		activeId,
		active,
		photo,
		name,
		errors,
		dismissErrors: clear,
		layerFailed,
		patch,
		bump,
		open,
		activate,
		rename,
		remove,
		moveTo,
		removeFolder,
		renameFolder,
		moveFolder,
		folders: tree.folders,
		openFolders: tree.open,
		setFolderOpen: tree.setOpen,
		openFolderIds: tree.openAll,
		addFolder: tree.addFolder,
	};
}
