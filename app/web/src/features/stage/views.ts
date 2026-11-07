// The saved zoom and position of each photo: a zoom as a factor of the fit zoom and a center as
// shares of the stage, so a reload, even in a window of another size, shows the photo where it was
// left. One map for the whole page, kept in memory and saved by the one saver in `lib/storage.ts`.
// The newest 50 are kept; a deleted photo forgets its view (`forgetView`).
import { finite, isRecord } from "@/lib/clean";
import { keepNewest } from "@/lib/lru";
import { KEYS, loadJson, Saver } from "@/lib/storage";

export type Saved = { k: number; cx: number; cy: number };
const KEEP = 50;

/** The saved views; a broken or wrong-typed entry is dropped. */
function clean(raw: unknown): Record<string, Saved> {
	const out: Record<string, Saved> = {};
	if (!isRecord(raw)) return out;
	for (const [id, v] of Object.entries(raw)) {
		if (!isRecord(v)) continue;
		const k = finite(v.k, -1);
		const cx = finite(v.cx, Number.NaN);
		const cy = finite(v.cy, Number.NaN);
		if (k > 0 && !Number.isNaN(cx) && !Number.isNaN(cy))
			out[id] = { k, cx, cy };
	}
	return out;
}

const saver = new Saver<Record<string, Saved>>(KEYS.views);
let map: Map<string, Saved> | null = null;

const all = () => {
	if (!map) {
		map = new Map(Object.entries(loadJson(KEYS.views, clean, () => ({}))));
		saver.attach();
	}
	return map;
};

const later = () => saver.later(() => Object.fromEntries(all()));

/** The saved view of a photo, or undefined. */
export const savedView = (id: string): Saved | undefined => all().get(id);

/** Keeps the view of a photo (null: it is fitted again, nothing to keep). The newest 50 stay. */
export function keepView(id: string, s: Saved | null) {
	const m = all();
	m.delete(id);
	if (s) m.set(id, s);
	keepNewest(m, KEEP);
	later();
}

/** A deleted photo forgets its view. */
export function forgetView(id: string) {
	if (all().delete(id)) later();
}

/** A new lock width starts every photo centered again. */
export function forgetAllViews() {
	all().clear();
	later();
}
