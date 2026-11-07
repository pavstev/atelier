// What a photo row is (`Doc`), how a saved list is cleaned, and the two small saved facts next to
// it: the list itself and the id of the photo on screen. An old or broken save never crashes the
// page: unknown keys are dropped and wrong types fall back.
import { finite, isRecord, nonNegative, whole } from "@/lib/clean";
import { KEYS, loadJson, loadText, saveText } from "@/lib/storage";

export type Doc = {
	id: string;
	name: string;
	/** The file size in bytes, 0 when unknown. */
	size: number;
	/** The pixel size of the photo, 0 when unknown (a photo saved before the size was kept). */
	width: number;
	height: number;
	/** When the photo was first opened, in ms since 1970. */
	at: number;
	/** A tiny JPEG preview (the whole photo, long side 128 px) as a data URL, or "" until it is made. */
	thumb: string;
	/** The tiny preview is the whole photo; an older save has a cropped one, which is made again. */
	tile: boolean;
	/** The bigger preview for the hover card is stored (`savePreview`). */
	preview: boolean;
	/** SHA-256 of the file bytes in hex ("" until it is made): the same bytes are the same photo. */
	hash: string;
};

/** The longest tiny preview (a data URL) a save may hold. */
const MAX_THUMB = 20_000;

/** One saved row cleaned, or null when it has no id or name. */
function cleanDoc(k: unknown): Doc | null {
	if (!isRecord(k) || typeof k.id !== "string" || typeof k.name !== "string")
		return null;
	const tile = k.tile === true;
	return {
		id: k.id,
		name: k.name,
		size: nonNegative(k.size),
		width: whole(k.width),
		height: whole(k.height),
		at: finite(k.at),
		tile,
		thumb:
			tile &&
			typeof k.thumb === "string" &&
			k.thumb.startsWith("data:image/") &&
			k.thumb.length < MAX_THUMB
				? k.thumb
				: "",
		preview: k.preview === true,
		hash:
			typeof k.hash === "string" && /^[0-9a-f]{64}$/.test(k.hash) ? k.hash : "",
	};
}

/** The saved list of photos. A broken or wrong-typed save gives an empty list. */
export function cleanDocs(raw: unknown): Doc[] {
	const out: Doc[] = [];
	if (!Array.isArray(raw)) return out;
	for (const item of raw) {
		const doc = cleanDoc(item);
		if (doc && !out.some((x) => x.id === doc.id)) out.push(doc);
	}
	return out;
}

export const readDocs = (): Doc[] => loadJson(KEYS.docs, cleanDocs, () => []);

/** The id of the photo that was on screen last, or null. */
export const readActive = (): string | null => loadText(KEYS.active);

export const writeActive = (id: string | null) => saveText(KEYS.active, id);
