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
import { decoded, deleteFile, readActive, writeActive } from "./store";
import { useDocsList } from "./useDocsList";
import { useMessages } from "./useMessages";

const SAVE_FAILED =
	"The photo list could not be kept: the browser storage is full or blocked. New photos may be missing after a reload.";

export function usePhotos() {
	const [start] = useState(readActive);
	const { errors, fail, clear } = useMessages();
	const { docs, docsRef, apply, patch } = useDocsList(() =>
		fail("save", SAVE_FAILED),
	);
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
	const open = useCallback(
		(files: File[]) =>
			addPhotos(files, {
				latest,
				docs: docsRef,
				apply,
				show,
				fail,
				clear,
			}),
		[docsRef, apply, show, fail, clear],
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

	/** Deletes a photo from this device. The one on screen hands the screen to its neighbour. */
	const remove = useCallback(
		(id: string) => {
			const at = docsRef.current.findIndex((d) => d.id === id);
			if (at < 0) return;
			apply({ type: "remove", id });
			const rest = docsRef.current;
			void deleteFile(id);
			forgetView(id);
			decoded.delete(id);
			if (id !== activeRef.current) return;
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
	};
}
