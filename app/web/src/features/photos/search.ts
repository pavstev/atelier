// The photo list search: the words, the match, the highlight, the sort and the saved choice.
// Plain functions with no React, so the match rules are in one place.

import { isRecord } from "@/lib/clean";
import { KEYS, loadJson, saveJson } from "@/lib/storage";
import type { Doc } from "./store";

export type Sort = "newest" | "oldest" | "name" | "size";
export const SORTS: { id: Sort; label: string }[] = [
	{ id: "newest", label: "Newest first" },
	{ id: "oldest", label: "Oldest first" },
	{ id: "name", label: "Name" },
	{ id: "size", label: "Biggest first" },
];

/** Lower case with no accents, one output char for each input char (so positions line up). */
function fold(c: string): string {
	const f = c.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
	return f === "" ? c.toLowerCase() : f;
}

/** The words of a query: lower case, no accents, split on spaces. */
export function words(query: string): string[] {
	return [...query.trim()].map(fold).join("").split(/\s+/).filter(Boolean);
}

/** The date text a query can match: the local date and the ISO date. */
function dateText(d: Doc): string {
	if (d.at <= 0) return "";
	const when = new Date(d.at);
	return `${when.toLocaleDateString()} ${when.toISOString().slice(0, 10)}`;
}

/** The folded name and date of each photo seen, so a keystroke does not fold every name again. */
const hayCache = new Map<string, string>();

function hayOf(d: Doc): string {
	const key = `${d.name}\0${d.at}`;
	let hay = hayCache.get(key);
	if (hay === undefined) {
		if (hayCache.size > 4000) hayCache.clear();
		hay = [...`${d.name} ${dateText(d)}`].map(fold).join("");
		hayCache.set(key, hay);
	}
	return hay;
}

/** Does the photo match every word? The name (with its extension) and the date count. */
export function matches(d: Doc, terms: string[]): boolean {
	if (terms.length === 0) return true;
	const hay = hayOf(d);
	return terms.every((t) => hay.includes(t));
}

/** The name cut into pieces; `hit` marks the pieces a word matched. */
export function highlight(
	name: string,
	terms: string[],
): { text: string; hit: boolean }[] {
	if (terms.length === 0) return [{ text: name, hit: false }];
	const chars = [...name];
	const folded = chars.map(fold);
	// where each folded char starts in the folded string, and which input char it came from
	const owner: number[] = [];
	folded.forEach((f, i) => {
		for (let k = 0; k < f.length; k++) owner.push(i);
	});
	const text = folded.join("");
	const on = new Array<boolean>(chars.length).fill(false);
	for (const t of terms) {
		for (let at = text.indexOf(t); at >= 0; at = text.indexOf(t, at + 1))
			for (let k = at; k < at + t.length; k++) {
				const o = owner[k];
				if (o !== undefined) on[o] = true;
			}
	}
	const out: { text: string; hit: boolean }[] = [];
	chars.forEach((c, i) => {
		const last = out[out.length - 1];
		if (last && last.hit === on[i]) last.text += c;
		else out.push({ text: c, hit: on[i] === true });
	});
	return out;
}

/** The photos in the chosen order. Newest keeps the saved order (the list is saved newest first). */
export function sorted(list: Doc[], sort: Sort): Doc[] {
	if (sort === "newest") return list;
	const copy = [...list];
	if (sort === "oldest") return copy.reverse();
	if (sort === "name")
		return copy.sort((a, b) =>
			a.name.localeCompare(b.name, undefined, { numeric: true }),
		);
	return copy.sort((a, b) => b.size - a.size);
}

/** How the photos show: one row each, or tiles (a square picture with the name under it). */
export type ListLayout = "list" | "tiles";

export type View = { sort: Sort; layout: ListLayout };

const cleanView = (r: unknown): View => {
	const v = isRecord(r) ? r : {};
	return {
		sort: SORTS.find((s) => s.id === v.sort)?.id ?? "newest",
		layout: v.layout === "tiles" ? "tiles" : "list",
	};
};

/** The saved sort and layout; a broken save gives the defaults. */
export const readView = (): View =>
	loadJson(KEYS.list, cleanView, () => cleanView(null));

export const writeView = (v: View) => saveJson(KEYS.list, v);
