// What a photo of the list still lacks, and how to make it: the content hash, the pixel size, the
// tiny whole-photo tile and the bigger preview. Rows saved by an earlier version miss some of them.
// The photo on screen is completed from its pixels; the others quietly, one at a time, from their
// stored files (`backfillDocs`). The hover card gets its preview here too (`ensurePreview`), so no
// component does storage work.
import { sha256Hex } from "@/lib/bytes";
import { type Doc, loadFile, loadPreview, savePreview } from "./store";
import { previewOf, previewOfFile, thumbnail, thumbnailOfBlob } from "./thumb";

/** A row that lacks nothing. */
export const isComplete = (d: Doc) =>
	Boolean(d.thumb && d.tile && d.preview && d.width > 0 && d.hash);

/** The hash of the stored file of a photo, or "" when it cannot be read. */
async function storedHash(id: string): Promise<string> {
	const file = await loadFile(id).catch(() => undefined);
	return file ? await sha256Hex(file) : "";
}

/** What the photo on screen lacks, made from its decoded pixels. */
export async function missingFromPixels(
	d: Doc,
	photo: ImageData,
): Promise<Partial<Doc>> {
	const change: Partial<Doc> = {};
	if (!d.hash) {
		const hash = await storedHash(d.id);
		if (hash) change.hash = hash;
	}
	if (d.width === 0) {
		change.width = photo.width;
		change.height = photo.height;
	}
	if (!d.thumb || !d.tile) {
		const thumb = await thumbnail(photo);
		if (thumb) {
			change.thumb = thumb;
			change.tile = true;
		}
	}
	if (!d.preview) {
		const big = await previewOf(photo);
		if (big && (await savePreview(d.id, big))) change.preview = true;
	}
	return change;
}

/** What a listed photo lacks, made from its stored file; null when the file cannot give a preview. */
async function missingFromFile(d: Doc): Promise<Partial<Doc> | null> {
	const change: Partial<Doc> = {};
	if (!d.hash) {
		const hash = await storedHash(d.id);
		if (hash) change.hash = hash;
	}
	let thumbFrom = d.preview ? await loadPreview(d.id) : undefined;
	if (!thumbFrom || d.width === 0) {
		const file = await loadFile(d.id);
		const big = file ? await previewOfFile(file) : null;
		if (!big) return null;
		change.width = big.width;
		change.height = big.height;
		if (!d.preview && (await savePreview(d.id, big.blob)))
			change.preview = true;
		thumbFrom ??= big.blob;
	}
	if (!d.thumb || !d.tile) {
		const thumb = await thumbnailOfBlob(thumbFrom);
		if (thumb) {
			change.thumb = thumb;
			change.tile = true;
		}
	}
	return change;
}

/**
 * The bigger preview of a photo for the hover card. When none is stored yet it is made from the
 * stored file and kept; `change` then holds what the list should learn (that the preview is stored,
 * and the pixel size if the row had none). `blob` is undefined when there is no preview to show.
 */
export async function ensurePreview(
	d: Pick<Doc, "id" | "width">,
): Promise<{ blob: Blob | undefined; change: Partial<Doc> | null }> {
	const stored = await loadPreview(d.id);
	if (stored) return { blob: stored, change: null };
	const file = await loadFile(d.id).catch(() => undefined);
	const made = file ? await previewOfFile(file) : null;
	if (!made) return { blob: undefined, change: null };
	const change: Partial<Doc> = { preview: await savePreview(d.id, made.blob) };
	if (d.width === 0) {
		change.width = made.width;
		change.height = made.height;
	}
	return { blob: made.blob, change };
}

/** A pass is running (a second start, as React's dev double run, does nothing). */
let running = false;

/**
 * Quietly makes what the listed photos still lack, one photo at a time. `skip` is the photo on
 * screen, which is completed from its pixels instead.
 */
export async function backfillDocs(
	list: Doc[],
	skip: string | undefined,
	patch: (id: string, change: Partial<Doc>) => void,
) {
	if (running) return; // one pass at a time
	running = true;
	try {
		for (const d of list) {
			if (d.id === skip || isComplete(d)) continue;
			await new Promise((r) => setTimeout(r, 150)); // let the page breathe between photos
			try {
				const change = await missingFromFile(d);
				if (change && Object.keys(change).length > 0) patch(d.id, change);
			} catch {
				// this photo stays as it is; the next one goes on
			}
		}
	} finally {
		running = false;
	}
}
