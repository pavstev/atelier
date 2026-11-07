// Every change of the photo list, as data. `docsReducer` is the one place that applies them.
import type { Doc } from "./schema";

export type DocsAction =
	| { type: "patch"; id: string; change: Partial<Doc> }
	/** The first photo of an add: a new row on top, or the row it replaces made again. */
	| { type: "show"; doc: Doc }
	/** The other photos of an add: new rows go right under `after`, replaced ones are made again. */
	| {
			type: "join";
			rest: Doc[];
			replaced: ReadonlyMap<string, Partial<Doc>>;
			at: number;
			after: string | null;
	  }
	| { type: "remove"; id: string }
	/** Only these ids stay (the others have no stored file). */
	| { type: "keep"; ids: ReadonlySet<string> }
	| { type: "set"; list: Doc[] };

/** Applies one change to the list. A change that changes nothing gives back the same array. */
export function docsReducer(ds: Doc[], a: DocsAction): Doc[] {
	switch (a.type) {
		case "patch":
			return ds.some((d) => d.id === a.id)
				? ds.map((d) => (d.id === a.id ? { ...d, ...a.change } : d))
				: ds;
		case "show":
			return ds.some((d) => d.id === a.doc.id)
				? ds.map((d) =>
						d.id === a.doc.id
							? {
									...d,
									at: a.doc.at,
									thumb: "",
									tile: false,
									preview: false,
									width: a.doc.width,
									height: a.doc.height,
									hash: a.doc.hash || d.hash,
								}
							: d,
					)
				: [a.doc, ...ds];
		case "join": {
			if (a.rest.length === 0 && a.replaced.size === 0) return ds;
			const next = ds.map((d) =>
				a.replaced.has(d.id) ? { ...d, at: a.at, ...a.replaced.get(d.id) } : d,
			);
			const have = new Set(next.map((d) => d.id));
			const fresh = a.rest.filter((d) => !have.has(d.id));
			const i = a.after ? next.findIndex((d) => d.id === a.after) : -1;
			return [...next.slice(0, i + 1), ...fresh, ...next.slice(i + 1)];
		}
		case "remove": {
			const next = ds.filter((d) => d.id !== a.id);
			return next.length === ds.length ? ds : next;
		}
		case "keep": {
			const next = ds.filter((d) => a.ids.has(d.id));
			return next.length === ds.length ? ds : next;
		}
		case "set":
			return a.list;
	}
}
