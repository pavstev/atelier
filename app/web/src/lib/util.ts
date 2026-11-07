// The text of a caught error, for the messages the page shows.

/** The text of a caught error. */
export function errText(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}
