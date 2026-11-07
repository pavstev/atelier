// Text for a row of the list: when a photo was added and how big its file is.

/** The date and time a photo was added, in the language of the browser: "Nov 6, 2026, 10:49 PM". */
export function addedText(at: number): string {
	if (at <= 0) return "";
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(at);
}

/** A short size for a file row: "412 KB", "1.8 MB". */
export function sizeText(bytes: number): string {
	if (bytes <= 0) return "";
	if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1000))} KB`;
	return `${(bytes / 1_000_000).toFixed(1)} MB`;
}
