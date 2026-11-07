// Bytes as text: lower-case hex, and the SHA-256 of a file.

/** The bytes as lower-case hex, two digits each. */
export const hex = (bytes: Uint8Array): string =>
	Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/** The SHA-256 of a file in hex, or "" where the browser has no `crypto.subtle` (a page that is not secure). */
export async function sha256Hex(file: Blob): Promise<string> {
	try {
		const sum = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
		return hex(new Uint8Array(sum));
	} catch {
		return "";
	}
}
