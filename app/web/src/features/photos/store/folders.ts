// The folders of the photo list: what a folder is, how a saved list is cleaned, and every change
// of the list as data (`foldersReducer`). A folder holds photos and other folders, to any depth. The
// photos name their folder (`Doc.folder`); the folders name their parent. Pure code, no React.
import { isRecord } from "@/lib/clean";
import { KEYS, loadJson } from "@/lib/storage";

export type Folder = {
	id: string;
	name: string;
	/** The id of the folder that holds this one, "" at the top. */
	parent: string;
};

/** The longest folder name. */
export const MAX_NAME = 120;

/**
 * The same list with every broken parent link cut: a parent that is not in the list, a folder that
 * is its own parent, or a ring of folders. The cut folder moves to the top.
 */
function cutBadParents(list: Folder[]): Folder[] {
	const byId = new Map(list.map((f) => [f.id, f]));
	return list.map((f) => {
		let up = f.parent;
		for (let n = 0; up !== "" && n <= list.length; n++) {
			if (up === f.id) return { ...f, parent: "" };
			const next = byId.get(up);
			if (!next) return { ...f, parent: "" };
			up = next.parent;
		}
		return up === "" ? f : { ...f, parent: "" };
	});
}

/** The saved folders cleaned: a row without an id is dropped, a bad name gets a plain one. */
export function cleanFolders(raw: unknown): Folder[] {
	const out: Folder[] = [];
	if (!Array.isArray(raw)) return out;
	for (const item of raw) {
		if (!isRecord(item) || typeof item.id !== "string" || item.id === "")
			continue;
		if (out.some((f) => f.id === item.id)) continue;
		const name =
			typeof item.name === "string" ? item.name.trim().slice(0, MAX_NAME) : "";
		out.push({
			id: item.id,
			name: name || "Folder",
			parent: typeof item.parent === "string" ? item.parent : "",
		});
	}
	return cutBadParents(out);
}

export const readFolders = (): Folder[] =>
	loadJson(KEYS.folders, cleanFolders, () => []);

/** The ids of the folders that were open, saved as a list of ids. */
export const readOpen = (): string[] =>
	loadJson(KEYS.open, (raw) =>
		Array.isArray(raw)
			? raw.filter((x): x is string => typeof x === "string")
			: [],
	);

export type FoldersAction =
	| { type: "add"; folder: Folder }
	| { type: "rename"; id: string; name: string }
	/** A folder moves into another one ("" is the top). A move into itself or into a folder inside it does nothing. */
	| { type: "move"; id: string; parent: string }
	/** These folders go (the caller gives a folder with everything inside it). */
	| { type: "drop"; ids: ReadonlySet<string> }
	| { type: "set"; list: Folder[] };

/** The ids of a folder and every folder inside it. */
export function subtree(list: Folder[], id: string): Set<string> {
	const out = new Set<string>([id]);
	// a folder joins when its parent is in; repeat until nothing joins (the list is cleaned, so it ends)
	for (let grew = true; grew; ) {
		grew = false;
		for (const f of list)
			if (!out.has(f.id) && out.has(f.parent)) {
				out.add(f.id);
				grew = true;
			}
	}
	return out;
}

/** Applies one change to the folders. A change that changes nothing gives back the same array. */
export function foldersReducer(fs: Folder[], a: FoldersAction): Folder[] {
	switch (a.type) {
		case "add":
			return fs.some((f) => f.id === a.folder.id) ? fs : [...fs, a.folder];
		case "rename": {
			const name = a.name.trim().slice(0, MAX_NAME);
			const f = fs.find((x) => x.id === a.id);
			if (!f || !name || f.name === name) return fs;
			return fs.map((x) => (x.id === a.id ? { ...x, name } : x));
		}
		case "move": {
			const f = fs.find((x) => x.id === a.id);
			if (!f || f.parent === a.parent) return fs;
			if (a.parent !== "" && !fs.some((x) => x.id === a.parent)) return fs;
			if (subtree(fs, a.id).has(a.parent)) return fs;
			return fs.map((x) => (x.id === a.id ? { ...x, parent: a.parent } : x));
		}
		case "drop": {
			const next = fs.filter((f) => !a.ids.has(f.id));
			return next.length === fs.length ? fs : next;
		}
		case "set":
			return a.list;
	}
}
