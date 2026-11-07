// After a reload: drop the photos whose file is gone, sweep the files nobody owns, show the photo
// that was on screen, and quietly make what the other rows still lack.

import { backfillDocs } from "./missing";
import type { DocsAction } from "./store";
import { type Doc, storedIds, sweepOrphans } from "./store";

export type Session = {
	/** The id that was on screen last, or null. */
	start: string | null;
	/** The newest list. */
	docs: { current: Doc[] };
	/** Counts up with each add or switch; above 0 means the user opened a photo meanwhile. */
	latest: { current: number };
	apply: (a: DocsAction) => void;
	patch: (id: string, change: Partial<Doc>) => void;
	activate: (id: string) => Promise<void>;
	setActive: (id: string | null) => void;
};

export async function restoreSession(s: Session): Promise<void> {
	// null: the store could not be read. Then every row stays; only a read that worked may drop one.
	const ids = await storedIds();
	if (ids) {
		s.apply({ type: "keep", ids: new Set(ids) });
		void sweepOrphans(ids, new Set(s.docs.current.map((d) => d.id)));
	}
	if (s.latest.current > 0) return; // the user opened a photo meanwhile
	const left = s.docs.current;
	const want = left.find((d) => d.id === s.start) ?? left[0];
	if (want) void s.activate(want.id);
	else s.setActive(null);
	void backfillDocs(left, want?.id, s.patch);
}
