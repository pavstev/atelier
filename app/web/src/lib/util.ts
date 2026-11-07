// Small helpers the pages share.

/** The text of a caught error. */
export function errText(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}
