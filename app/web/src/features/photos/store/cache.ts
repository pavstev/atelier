// The decoded pixels of the photos that were shown last, in memory, so a switch back is quick and
// the memory stays bounded.
import { Lru } from "@/lib/lru";

/** Decoded photos kept in memory (the active one counts). One RGBA photo can be 88 MB. */
const KEEP_DECODED = 2;

export const decoded = new Lru<ImageData>(KEEP_DECODED);
