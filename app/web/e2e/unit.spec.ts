// Plain functions, no browser: the photo list search, sort and the match marks. The page-level
// behavior (typing, Esc, the count) is in photos.spec.ts.
import { expect, test } from "@playwright/test";
import {
	highlight,
	matches,
	sorted,
	words,
} from "../src/features/photos/search";
import {
	type Doc,
	docsReducer,
	mergeDocs,
	ORPHAN_MS,
	orphansToDelete,
} from "../src/features/photos/store";
import { cleanDocs } from "../src/features/photos/store/schema";
import { hex, sha256Hex } from "../src/lib/bytes";
import { keepNewest, Lru } from "../src/lib/lru";

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
