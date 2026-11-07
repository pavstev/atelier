// Adds photos to the list. The first one that opens is shown; the others only join the list (each is
// decoded once for its tile and preview and then let go, one at a time, so the memory stays small).
// A photo with the same bytes as one in the list (the same SHA-256; a row saved before hashes is
// matched by name and size until it gets one) replaces it, so there are no duplicates, and two
// different photos that share a name and a size both stay. A file that does not open does not stop
// the others; the names that failed are told together.
import { loadPhoto as sendPhoto } from "@/draw/coreClient";
import { sha256Hex } from "@/lib/bytes";
import { errText } from "@/lib/util";
import { loadPhoto as decodePhoto } from "./photo";
import {
	type Doc,
	type DocsAction,
	decoded,
	saveFile,
	savePreview,
} from "./store";
import { previewOf, thumbnail } from "./thumb";
import type { Clear, Fail } from "./useMessages";

/** What adding needs from the photo session. */
type AddContext = {
	/** Counts up with each add or switch; an add that sees a newer number stops showing. */
	latest: { current: number };
	/** The newest list. */
	docs: { current: Doc[] };
	apply: (a: DocsAction) => void;
	/** Puts a photo on screen. */
	show: (id: string, img: ImageData) => void;
	fail: Fail;
	clear: Clear;
};

const sameNameAndSize = (a: { name: string; size: number }, b: File) =>
	a.name === b.name && a.size === b.size;

/** A new row for a photo. */
const newDoc = (
	id: string,
	file: File,
	img: ImageData,
	at: number,
	more: Partial<Doc> = {},
): Doc => ({
	id,
	name: file.name,
	size: file.size,
	width: img.width,
	height: img.height,
	at,
	thumb: "",
	tile: false,
	preview: false,
	hash: "",
	...more,
});

/** Keeps the file and makes the tile and the bigger preview of a photo that joins without showing. */
async function prepareJoin(
	id: string,
	file: File,
	img: ImageData,
	hash: string,
): Promise<Partial<Doc>> {
	void saveFile(id, file);
	const thumb = await thumbnail(img);
	const big = await previewOf(img);
	return {
		hash,
		thumb,
		tile: thumb !== "",
		preview: big !== null && (await savePreview(id, big)),
	};
}

export async function addPhotos(files: File[], c: AddContext) {
	if (files.length === 0) return;
	const me = ++c.latest.current;
	c.clear("open");
	const at = Date.now();
	const failed: string[] = [];
	let reason = "";
	let firstId: string | null = null;
	const seenFiles: File[] = [];
	const seenHashes = new Set<string>();
	const rest: Doc[] = [];
	const replaced = new Map<string, Partial<Doc>>();
	const miss = (file: File, e: unknown) => {
		failed.push(file.name);
		reason ||= errText(e);
	};
	for (const file of files) {
		const hash = await sha256Hex(file);
		// the same file picked twice
		if (
			hash
				? seenHashes.has(hash)
				: seenFiles.some((f) => sameNameAndSize(f, file))
		)
			continue;
		seenHashes.add(hash);
		seenFiles.push(file);
		let img: ImageData;
		try {
			img = await decodePhoto(file);
		} catch (e) {
			miss(file, e);
			continue;
		}
		const old = c.docs.current.find((d) =>
			hash && d.hash ? d.hash === hash : sameNameAndSize(d, file),
		);
		const id = old?.id ?? crypto.randomUUID();
		if (old) decoded.delete(id);
		/** The photo joins the list without showing. */
		const join = async () => {
			const more = await prepareJoin(id, file, img, hash);
			if (old)
				replaced.set(id, { ...more, width: img.width, height: img.height });
			else rest.push(newDoc(id, file, img, at, more));
		};
		if (firstId !== null || me !== c.latest.current) {
			await join();
			continue;
		}
		try {
			await sendPhoto(img);
		} catch (e) {
			miss(file, e);
			continue;
		}
		if (me !== c.latest.current) {
			// the user picked another photo meanwhile: this one just joins the list
			await join();
			continue;
		}
		firstId = id;
		void saveFile(id, file);
		c.apply({ type: "show", doc: newDoc(id, file, img, at, { hash }) });
		c.show(id, img);
	}
	if (rest.length > 0 || replaced.size > 0)
		// new ones go right under the photo that was shown, in the order they were picked
		c.apply({ type: "join", rest, replaced, at, after: firstId });
	if (failed.length > 0)
		c.fail("open", `Could not open ${failed.join(", ")}: ${reason}`);
}
