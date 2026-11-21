// Plain functions, no browser: the photo list search, sort and the match marks, and the folder
// code (clean, reducers, tree questions). The page-level behavior (typing, Esc, the count) is in
// photos.spec.ts, and the folders in the page are in folders.spec.ts.
import { expect, test } from "@playwright/test";
import {
	highlight,
	matches,
	sorted,
	words,
} from "../src/features/photos/search";
import {
	ancestors,
	childFolders,
	cleanFolders,
	countAll,
	type Doc,
	docsReducer,
	type Folder,
	flatFolders,
	foldersReducer,
	groupDocs,
	mergeDocs,
	ORPHAN_MS,
	orphansToDelete,
	pathOf,
} from "../src/features/photos/store";
import { cleanDocs } from "../src/features/photos/store/schema";
import { hex, sha256Hex } from "../src/lib/bytes";
import { keepNewest, Lru } from "../src/lib/lru";
import { RELOAD_FLAG, RELOAD_GAP_MS, reloadOnce } from "../src/pwa/reloadOnce";

const doc = (name: string, size = 1, at = 1): Doc => ({
	id: name,
	name,
	size,
	width: 0,
	height: 0,
	at,
	thumb: "",
	tile: false,
	preview: false,
	hash: "",
	folder: "",
});
const inFolder = (name: string, folder: string): Doc => ({
	...doc(name),
	folder,
});
const fold = (id: string, name = id, parent = ""): Folder => ({
	id,
	name,
	parent,
});

test("test_words_fold_case_and_accents", () => {
	expect(words("  Café   MONA ")).toEqual(["cafe", "mona"]);
	expect(words("   ")).toEqual([]);
});

test("test_matches_needs_every_word", () => {
	const d = doc("Mona Lisa.JPG");
	expect(matches(d, [])).toBe(true);
	expect(matches(d, words("lisa mona"))).toBe(true);
	expect(matches(d, words("lisa david"))).toBe(false);
	// the extension counts, and accents are ignored on both sides
	expect(matches(doc("Café.png"), words("CAFE png"))).toBe(true);
});

test("test_highlight_marks_the_matched_pieces", () => {
	expect(highlight("Mona Lisa", words("on lis"))).toEqual([
		{ text: "M", hit: false },
		{ text: "on", hit: true },
		{ text: "a ", hit: false },
		{ text: "Lis", hit: true },
		{ text: "a", hit: false },
	]);
	expect(highlight("abc", [])).toEqual([{ text: "abc", hit: false }]);
});

test("test_sorted_orders_without_changing_the_list", () => {
	const list = [doc("b2", 5), doc("a10", 9), doc("a9", 1)];
	expect(sorted(list, "newest")).toBe(list);
	expect(sorted(list, "oldest").map((d) => d.name)).toEqual([
		"a9",
		"a10",
		"b2",
	]);
	expect(sorted(list, "name").map((d) => d.name)).toEqual(["a9", "a10", "b2"]);
	expect(sorted(list, "size").map((d) => d.name)).toEqual(["a10", "b2", "a9"]);
	expect(list.map((d) => d.name)).toEqual(["b2", "a10", "a9"]);
});

test("test_merge_keeps_what_each_tab_added_and_drops_what_one_removed", () => {
	const [a, b, c, d] = ["a", "b", "c", "d"].map((n) => doc(n));
	const base = [a, b];
	// this page added c on top; another tab added d
	expect(mergeDocs(base, [c, a, b], [d, a, b]).map((x) => x.id)).toEqual([
		"c",
		"d",
		"a",
		"b",
	]);
	// another tab removed b: it goes, whatever this page thinks
	expect(mergeDocs(base, [a, b], [a]).map((x) => x.id)).toEqual(["a"]);
	// this page removed a: it stays gone even though storage still holds it
	expect(mergeDocs(base, [b], [a, b]).map((x) => x.id)).toEqual(["b"]);
	// both have a photo: this page's fields win
	const mine = { ...a, name: "mine" };
	expect(
		mergeDocs(base, [mine, b], [{ ...a, name: "theirs" }, b])[0]?.name,
	).toBe("mine");
});

test("test_orphans_are_deleted_only_after_ten_minutes", () => {
	const now = 1_000_000_000;
	const listed = new Set(["own"]);
	const out = orphansToDelete(
		["own", "new", "old", "edge"],
		listed,
		{ old: now - ORPHAN_MS - 1, edge: now - ORPHAN_MS + 1, gone: now - 5 },
		now,
	);
	expect(out.del).toEqual(["old"]);
	// a new orphan is noted now, a young one keeps its date, one that is gone is forgotten
	expect(out.seen).toEqual({ new: now, edge: now - ORPHAN_MS + 1 });
});

test("test_the_docs_reducer_applies_each_change_and_keeps_the_array_when_nothing_changes", () => {
	const [a, b, c] = ["a", "b", "c"].map((n) => doc(n));
	const list = [a, b] as Doc[];
	const ids = (l: Doc[]) => l.map((d) => d.id);
	// patch: one row changes; a missing id changes nothing and gives back the same array
	expect(
		docsReducer(list, {
			type: "patch",
			id: "b",
			change: { name: "renamed" },
		})[1]?.name,
	).toBe("renamed");
	expect(docsReducer(list, { type: "patch", id: "x", change: {} })).toBe(list);
	// show: a new row goes on top; a known row is made again (previews cleared, hash kept)
	const c2 = { ...c, hash: "h" } as Doc;
	expect(ids(docsReducer(list, { type: "show", doc: c2 }))).toEqual([
		"c",
		"a",
		"b",
	]);
	const known = docsReducer(
		[{ ...a, thumb: "t", tile: true, preview: true, hash: "old" }, b],
		{ type: "show", doc: { ...a, width: 9, height: 8, at: 5 } },
	)[0];
	expect(known).toMatchObject({
		thumb: "",
		tile: false,
		preview: false,
		width: 9,
		at: 5,
		hash: "old",
	});
	// join: new rows go right under `after`, in order; a row already there is not added twice
	const x = doc("x");
	const y = doc("y");
	expect(
		ids(
			docsReducer(list, {
				type: "join",
				rest: [x, y, a],
				replaced: new Map(),
				at: 1,
				after: "a",
			}),
		),
	).toEqual(["a", "x", "y", "b"]);
	expect(
		docsReducer(list, {
			type: "join",
			rest: [],
			replaced: new Map(),
			at: 1,
			after: null,
		}),
	).toBe(list);
	// remove and keep
	expect(ids(docsReducer(list, { type: "remove", id: "a" }))).toEqual(["b"]);
	expect(docsReducer(list, { type: "remove", id: "z" })).toBe(list);
	expect(docsReducer(list, { type: "keep", ids: new Set(["a", "b"]) })).toBe(
		list,
	);
	expect(ids(docsReducer(list, { type: "keep", ids: new Set(["b"]) }))).toEqual(
		["b"],
	);
});

test("test_the_hash_tells_two_files_with_the_same_name_and_size_apart", async () => {
	const one = new Blob([new Uint8Array([1, 2, 3, 4])]);
	const two = new Blob([new Uint8Array([1, 2, 3, 5])]);
	const h1 = await sha256Hex(one);
	expect(h1).toMatch(/^[0-9a-f]{64}$/);
	expect(await sha256Hex(new Blob([new Uint8Array([1, 2, 3, 4])]))).toBe(h1);
	expect(await sha256Hex(two)).not.toBe(h1);
});

test("test_an_old_saved_list_loads_and_drops_what_it_does_not_know", () => {
	const old = [
		// a row saved with the removed face fields: they are dropped, the rest stays
		{ id: "a", name: "a.jpg", size: 5, at: 3, people: true, faces: 2 },
		{ id: "a", name: "twin.jpg" },
		{ name: "no id" },
		null,
		{
			id: "b",
			name: "b.jpg",
			tile: true,
			thumb: "data:image/jpeg;base64,xx",
			hash: "nope",
		},
	];
	const list = cleanDocs(old);
	expect(list.map((d) => d.id)).toEqual(["a", "b"]);
	expect(list[0]).toEqual({
		id: "a",
		name: "a.jpg",
		size: 5,
		width: 0,
		height: 0,
		at: 3,
		thumb: "",
		tile: false,
		preview: false,
		hash: "",
		folder: "",
	});
	expect(list[1]?.thumb).toBe("data:image/jpeg;base64,xx");
	expect(list[1]?.hash).toBe("");
	expect(cleanDocs("broken")).toEqual([]);
});

test("test_keep_newest_and_lru_drop_the_oldest", () => {
	const m = new Map([
		["a", 1],
		["b", 2],
		["c", 3],
	]);
	const dropped: string[] = [];
	keepNewest(m, 2, (k) => dropped.push(k));
	expect([...m.keys()]).toEqual(["b", "c"]);
	expect(dropped).toEqual(["a"]);
	const lru = new Lru<number>(2);
	lru.set("a", 1);
	lru.set("b", 2);
	lru.get("a"); // a is the newest now
	lru.set("c", 3);
	expect(lru.get("b")).toBeUndefined();
	expect(lru.get("a")).toBe(1);
});

test("test_hex_writes_two_digits_per_byte", () => {
	expect(hex(new Uint8Array([0, 15, 255]))).toBe("000fff");
});

test("test_clean_folders_drops_bad_rows_and_cuts_bad_parents", () => {
	expect(cleanFolders("broken")).toEqual([]);
	const list = cleanFolders([
		{ name: "no id", parent: "" },
		{ id: "", name: "empty id" },
		null,
		{ id: "a", name: "  Portraits  ", parent: "" },
		// a second row with the same id is dropped
		{ id: "a", name: "twin", parent: "" },
		// an empty or missing name becomes "Folder"; a wrong-typed parent is the top
		{ id: "b", name: "   ", parent: "a" },
		{ id: "c", parent: 5 },
		// a parent that does not exist
		{ id: "d", name: "d", parent: "nope" },
		// a folder that is its own parent
		{ id: "e", name: "e", parent: "e" },
	]);
	expect(list.map((f) => f.id)).toEqual(["a", "b", "c", "d", "e"]);
	expect(list.map((f) => f.name)).toEqual([
		"Portraits",
		"Folder",
		"Folder",
		"d",
		"e",
	]);
	// only the good link stays (b is inside a)
	expect(list.map((f) => f.parent)).toEqual(["", "a", "", "", ""]);

	// a ring a > b > c > a is cut to the top, and so is a folder that hangs from it
	const ring = cleanFolders([
		{ id: "a", name: "a", parent: "b" },
		{ id: "b", name: "b", parent: "c" },
		{ id: "c", name: "c", parent: "a" },
		{ id: "d", name: "d", parent: "a" },
		{ id: "ok", name: "ok", parent: "" },
		{ id: "kid", name: "kid", parent: "ok" },
	]);
	expect(ring.map((f) => f.parent)).toEqual(["", "", "", "", "", "ok"]);
});

test("test_the_folders_reducer_applies_each_change_and_keeps_the_array_when_nothing_changes", () => {
	const empty: Folder[] = [];
	const one = foldersReducer(empty, { type: "add", folder: fold("a", "A") });
	expect(one).toEqual([fold("a", "A")]);
	// add: a known id is not added twice
	expect(foldersReducer(one, { type: "add", folder: fold("a", "Other") })).toBe(
		one,
	);

	// rename trims; an empty name, a missing id and the same name change nothing
	expect(
		foldersReducer(one, { type: "rename", id: "a", name: "  Faces  " })[0]
			?.name,
	).toBe("Faces");
	expect(foldersReducer(one, { type: "rename", id: "a", name: "   " })).toBe(
		one,
	);
	expect(foldersReducer(one, { type: "rename", id: "x", name: "Z" })).toBe(one);
	expect(foldersReducer(one, { type: "rename", id: "a", name: " A " })).toBe(
		one,
	);

	// a > b > c, and a separate d
	const tree = [fold("a"), fold("b", "b", "a"), fold("c", "c", "b"), fold("d")];
	const parents = (l: Folder[]) => l.map((f) => f.parent);
	// move: into itself, into its own subfolder, into a folder that is not there, to where it is
	expect(foldersReducer(tree, { type: "move", id: "a", parent: "a" })).toBe(
		tree,
	);
	expect(foldersReducer(tree, { type: "move", id: "a", parent: "b" })).toBe(
		tree,
	);
	expect(foldersReducer(tree, { type: "move", id: "a", parent: "c" })).toBe(
		tree,
	);
	expect(foldersReducer(tree, { type: "move", id: "d", parent: "zz" })).toBe(
		tree,
	);
	expect(foldersReducer(tree, { type: "move", id: "b", parent: "a" })).toBe(
		tree,
	);
	expect(foldersReducer(tree, { type: "move", id: "x", parent: "a" })).toBe(
		tree,
	);
	// move into a sibling tree works, and so does a move to the top ("")
	expect(
		parents(foldersReducer(tree, { type: "move", id: "d", parent: "c" })),
	).toEqual(["", "a", "b", "c"]);
	expect(
		parents(foldersReducer(tree, { type: "move", id: "b", parent: "" })),
	).toEqual(["", "", "b", ""]);

	// drop: the given folders go; a set with no match gives the same array
	expect(
		foldersReducer(tree, { type: "drop", ids: new Set(["b", "c"]) }).map(
			(f) => f.id,
		),
	).toEqual(["a", "d"]);
	expect(foldersReducer(tree, { type: "drop", ids: new Set(["zz"]) })).toBe(
		tree,
	);
});

test("test_the_docs_reducer_moves_and_drops_photos_and_keeps_the_array_when_nothing_changes", () => {
	const list = [inFolder("a", ""), inFolder("b", "f1"), inFolder("c", "f1")];
	const where = (l: Doc[]) => l.map((d) => `${d.id}:${d.folder}`);
	// move: only the rows that change are new objects
	const moved = docsReducer(list, {
		type: "move",
		ids: new Set(["a", "b"]),
		folder: "f1",
	});
	expect(where(moved)).toEqual(["a:f1", "b:f1", "c:f1"]);
	expect(moved[1]).toBe(list[1]);
	expect(
		where(docsReducer(list, { type: "move", ids: new Set(["c"]), folder: "" })),
	).toEqual(["a:", "b:f1", "c:"]);
	// nothing to change: already there, an id that is not listed, an empty set
	expect(
		docsReducer(list, { type: "move", ids: new Set(["b", "c"]), folder: "f1" }),
	).toBe(list);
	expect(
		docsReducer(list, { type: "move", ids: new Set(["zz"]), folder: "f1" }),
	).toBe(list);
	expect(
		docsReducer(list, { type: "move", ids: new Set(), folder: "f1" }),
	).toBe(list);

	// drop
	expect(
		docsReducer(list, { type: "drop", ids: new Set(["b", "c"]) }).map(
			(d) => d.id,
		),
	).toEqual(["a"]);
	expect(docsReducer(list, { type: "drop", ids: new Set(["zz"]) })).toBe(list);
});

test("test_the_tree_questions_group_count_and_path", () => {
	// Art > Faces > Old, Art > Hands, and Misc; the names sort by number
	const folders = [
		fold("art", "Art"),
		fold("faces", "Faces", "art"),
		fold("old", "Old", "faces"),
		fold("hands", "Hands", "art"),
		fold("misc", "Misc"),
	];
	const docs = [
		inFolder("p1", ""),
		inFolder("p2", "old"),
		inFolder("p3", "faces"),
		inFolder("p4", "old"),
		// its folder is gone: the photo shows at the top
		inFolder("p5", "deleted"),
	];
	const groups = groupDocs(docs, folders);
	expect(groups.get("")?.map((d) => d.id)).toEqual(["p1", "p5"]);
	expect(groups.get("old")?.map((d) => d.id)).toEqual(["p2", "p4"]);
	expect(groups.get("faces")?.map((d) => d.id)).toEqual(["p3"]);
	expect(groups.has("deleted")).toBe(false);
	expect(groups.has("hands")).toBe(false);

	// a folder counts the photos of the folders inside it
	const counts = countAll(folders, groups);
	expect(Object.fromEntries(counts)).toEqual({
		art: 3,
		faces: 3,
		old: 2,
		hands: 0,
		misc: 0,
	});

	expect(ancestors(folders, "old")).toEqual(["faces", "art"]);
	expect(ancestors(folders, "art")).toEqual([]);
	expect(ancestors(folders, "nope")).toEqual([]);
	expect(pathOf(folders, "old")).toBe("Art / Faces / Old");
	expect(pathOf(folders, "faces")).toBe("Art / Faces");
	expect(pathOf(folders, "")).toBe("");

	// the menu list: depth first, by name, with the depth of each
	expect(flatFolders(folders).map((r) => `${r.folder.id}:${r.depth}`)).toEqual([
		"art:0",
		"faces:1",
		"old:2",
		"hands:1",
		"misc:0",
	]);
	// a skipped folder hides what is inside it too
	expect(
		flatFolders(folders, new Set(["faces", "old"])).map((r) => r.folder.id),
	).toEqual(["art", "hands", "misc"]);

	// names sort with numbers in mind: 2 before 10
	const numbered = [
		fold("x10", "Day 10"),
		fold("x2", "Day 2"),
		fold("x1", "day 1"),
	];
	expect(childFolders(numbered, "").map((f) => f.id)).toEqual([
		"x1",
		"x2",
		"x10",
	]);
	expect(childFolders(folders, "art").map((f) => f.id)).toEqual([
		"faces",
		"hands",
	]);
});

test("test_clean_docs_keeps_the_folder_and_defaults_to_the_top", () => {
	const list = cleanDocs([
		{ id: "a", name: "a.jpg", folder: "f1" },
		{ id: "b", name: "b.jpg" },
		{ id: "c", name: "c.jpg", folder: 7 },
	]);
	expect(list.map((d) => d.folder)).toEqual(["f1", "", ""]);
});

test("test_merge_keeps_a_move_the_other_tab_made_and_this_pages_own_move", () => {
	const at = (d: Doc, folder: string): Doc => ({ ...d, folder });
	const base = [doc("a"), doc("b")];
	// the other tab moved "a" into x; this page changed only a thumb
	const local = [{ ...doc("a"), thumb: "t" }, doc("b")];
	const remote = [at(doc("a"), "x"), doc("b")];
	const merged = mergeDocs(base, local, remote);
	expect(merged[0]?.folder).toBe("x");
	expect(merged[0]?.thumb).toBe("t");
	// this page moved "b" itself: its move stands
	const mine = [doc("a"), at(doc("b"), "y")];
	expect(mergeDocs(base, mine, base)[1]?.folder).toBe("y");
});

test("test_reload_once_reloads_then_waits_a_minute", () => {
	const map = new Map<string, string>();
	const store = {
		getItem: (k: string) => map.get(k) ?? null,
		setItem: (k: string, v: string) => void map.set(k, v),
	};
	let reloads = 0;
	const reload = () => void reloads++;
	expect(reloadOnce(store, reload, 1_000)).toBe(true);
	expect(map.has(RELOAD_FLAG)).toBe(true);
	// the chunk is still broken on the reloaded page: no loop
	expect(reloadOnce(store, reload, 2_000)).toBe(false);
	expect(reloadOnce(store, reload, 1_000 + RELOAD_GAP_MS - 1)).toBe(false);
	expect(reloads).toBe(1);
	// a minute later one more reload is allowed
	expect(reloadOnce(store, reload, 1_000 + RELOAD_GAP_MS)).toBe(true);
	expect(reloads).toBe(2);
	// a storage that throws never reloads, and never throws
	const broken = {
		getItem: () => {
			throw new Error("denied");
		},
		setItem: () => {
			throw new Error("denied");
		},
	};
	expect(reloadOnce(broken, reload)).toBe(false);
	expect(reloads).toBe(2);
});
