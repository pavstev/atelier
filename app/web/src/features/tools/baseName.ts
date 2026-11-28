// The name of the base now on show. It lives apart from `Panel.tsx` so the bottom bar can label its
// Base button without loading the card bodies, which are a lazy chunk.
import { BASES, type Look } from "./settings";

/** The name of each base, in the order of `BASES`. */
export const BASE_NAMES = BASES.map((b) => b.label);

/** The index of a base kind in `BASES`, or -1. */
export const baseIndex = (kind: string) =>
	BASES.findIndex((b) => b.id === kind);

/** The name of the base now on show (Photo, Values or Shapes). */
export const baseName = (look: Look) => BASE_NAMES[baseIndex(look.base.kind)];
