// Questions about the folder tree, as plain functions with no React: who is inside a folder, how
// many photos, the path of a folder, which folders to open to show a photo. A photo whose folder
// is not in the list counts as being at the top, so a broken link never hides a photo.
import { type Folder, subtree } from "./folders";
import type { Doc } from "./schema";

const byName = (a: Folder, b: Folder) =>
	a.name.localeCompare(b.name, undefined, { numeric: true });

/** The folder a photo really sits in: its own, or "" (the top) when that folder is gone. */
export function folderOf(d: Doc, folders: Folder[]): string {
	return d.folder !== "" && folders.some((f) => f.id === d.folder)
		? d.folder
		: "";
}

/** The photos of each folder ("" is the top), in list order: one pass for the whole list. */
export function groupDocs(docs: Doc[], folders: Folder[]): Map<string, Doc[]> {
	const ids = new Set(folders.map((f) => f.id));
	const out = new Map<string, Doc[]>();
	for (const d of docs) {
		const key = d.folder !== "" && ids.has(d.folder) ? d.folder : "";
		const list = out.get(key);
		if (list) list.push(d);
		else out.set(key, [d]);
	}
	return out;
}

/** How many photos each folder holds, counting the folders inside it (from `groupDocs`). */
export function countAll(
	folders: Folder[],
	groups: Map<string, Doc[]>,
): Map<string, number> {
	const kids = new Map<string, Folder[]>();
	for (const f of folders) {
		const list = kids.get(f.parent);
		if (list) list.push(f);
		else kids.set(f.parent, [f]);
	}
	const out = new Map<string, number>();
	const total = (id: string, depth: number): number => {
		const known = out.get(id);
		if (known !== undefined) return known;
		let n = groups.get(id)?.length ?? 0;
		// the list is cleaned (no rings); the depth limit is a second guard
		if (depth <= folders.length)
			for (const k of kids.get(id) ?? []) n += total(k.id, depth + 1);
		out.set(id, n);
		return n;
	};
	for (const f of folders) total(f.id, 0);
	return out;
}

/** The folders directly inside `parent` ("" is the top), by name. */
export function childFolders(folders: Folder[], parent: string): Folder[] {
	return folders.filter((f) => f.parent === parent).sort(byName);
}

/** The ids of the photos in a folder and in every folder inside it. */
export function photoIdsIn(
	docs: Doc[],
	folders: Folder[],
	id: string,
): string[] {
	const ids = subtree(folders, id);
	return docs.filter((d) => ids.has(folderOf(d, folders))).map((d) => d.id);
}

/** The folders that hold a folder, nearest first, up to the top ("" is not listed). */
export function ancestors(folders: Folder[], id: string): string[] {
	const out: string[] = [];
	let at = folders.find((f) => f.id === id)?.parent ?? "";
	while (at !== "" && out.length <= folders.length) {
		out.push(at);
		at = folders.find((f) => f.id === at)?.parent ?? "";
	}
	return out;
}

/** The path of a folder, like "Portraits / 2025". "" for the top. */
export function pathOf(folders: Folder[], id: string): string {
	if (id === "") return "";
	const names = [id, ...ancestors(folders, id)].map(
		(x) => folders.find((f) => f.id === x)?.name ?? "",
	);
	return names.reverse().join(" / ");
}

/** Can a folder move into `parent`? Not into itself or into a folder inside it. */
export function canMoveInto(
	folders: Folder[],
	id: string,
	parent: string,
): boolean {
	return !subtree(folders, id).has(parent);
}

/** Every folder as a flat list for a menu: depth-first, by name, each with its depth. */
export function flatFolders(
	folders: Folder[],
	skip: ReadonlySet<string> = new Set(),
): { folder: Folder; depth: number }[] {
	const out: { folder: Folder; depth: number }[] = [];
	const walk = (parent: string, depth: number) => {
		for (const f of childFolders(folders, parent)) {
			if (skip.has(f.id)) continue;
			out.push({ folder: f, depth });
			walk(f.id, depth + 1);
		}
	};
	walk("", 0);
	return out;
}
