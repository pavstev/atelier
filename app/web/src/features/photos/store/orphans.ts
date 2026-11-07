// Stored files that no photo of the list owns. A photo being added has its file saved before its
// list entry, so a file is deleted only after it has been an orphan for a while.
import { isRecord } from "@/lib/clean";
import { KEYS, loadJson, saveJson } from "@/lib/storage";
import { deleteFile } from "./idb";

/** How long a stored file may go without an owner before the sweep deletes it, in ms. */
export const ORPHAN_MS = 10 * 60_000;

/**
 * Which stored files nobody owns. `seen` holds the first sighting of each orphan; the result keeps
 * the sightings that are still orphans.
 */
export function orphansToDelete(
	stored: string[],
	listed: ReadonlySet<string>,
	seen: Record<string, number>,
	now: number,
): { del: string[]; seen: Record<string, number> } {
	const del: string[] = [];
	const next: Record<string, number> = {};
	for (const id of stored) {
		if (listed.has(id)) continue;
		const at = seen[id];
		if (typeof at === "number" && now - at >= ORPHAN_MS) del.push(id);
		else next[id] = typeof at === "number" ? at : now;
	}
	return { del, seen: next };
}

const cleanSeen = (raw: unknown): Record<string, number> => {
	const out: Record<string, number> = {};
	if (isRecord(raw))
		for (const [id, at] of Object.entries(raw))
			if (typeof at === "number" && Number.isFinite(at)) out[id] = at;
	return out;
};

/** Deletes the stored files that no photo of the list has owned for a while. */
export async function sweepOrphans(
	stored: string[],
	listed: ReadonlySet<string>,
) {
	const seen = loadJson(KEYS.orphans, cleanSeen, () => ({}));
	const { del, seen: next } = orphansToDelete(stored, listed, seen, Date.now());
	saveJson(KEYS.orphans, next);
	for (const id of del) await deleteFile(id);
}
