// Joins the photo list of this page with the one another tab saved.
import type { Doc } from "./schema";

/**
 * `base` is the list both started from (what this page last read or wrote), `local` is this page
 * now, `remote` is what storage holds now. A photo one side added stays; a photo one side removed
 * from `base` goes; a photo both have keeps this page's fields (it knows its own previews best).
 * New local photos go on top, as new photos do.
 */
export function mergeDocs(base: Doc[], local: Doc[], remote: Doc[]): Doc[] {
	const ids = (l: Doc[]) => new Set(l.map((d) => d.id));
	const b = ids(base);
	const l = ids(local);
	const r = ids(remote);
	const mine = new Map(local.map((d) => [d.id, d]));
	const out: Doc[] = [];
	for (const d of local) if (!b.has(d.id) && !r.has(d.id)) out.push(d);
	for (const d of remote) {
		if (b.has(d.id) && !l.has(d.id)) continue; // this page removed it
		out.push(mine.get(d.id) ?? d);
	}
	return out;
}
