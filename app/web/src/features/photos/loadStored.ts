// Reads a listed photo back from this device: the stored file, decoded to pixels. The answer says
// which of three things happened, so the caller can tell "cannot read" from "gone".
import { errText } from "@/lib/util";
import { loadPhoto as decodePhoto } from "./photo";
import { loadFile } from "./store";

export type Stored =
	| { kind: "ok"; img: ImageData }
	/** The saved file is gone: the row may be dropped. */
	| { kind: "gone" }
	/** The file could not be read or decoded: keep the row and tell the user `text`. */
	| { kind: "error"; text: string };

export async function loadStored(id: string): Promise<Stored> {
	let blob: Blob | undefined;
	try {
		blob = await loadFile(id);
	} catch (e) {
		return {
			kind: "error",
			text: `Could not read the saved photo: ${errText(e)}`,
		};
	}
	if (!blob) return { kind: "gone" };
	try {
		return { kind: "ok", img: await decodePhoto(blob) };
	} catch (e) {
		return { kind: "error", text: `Could not open the photo: ${errText(e)}` };
	}
}
