// The original files and the bigger previews, in IndexedDB on this device. Nothing leaves it. A
// reload or a closed window brings the photos back from here.

import { type IDBPDatabase, openDB } from "idb";

const DB_NAME = "atelier";
const STORE = "photos";
/** The bigger previews (version 2 of the database). */
const PREVIEWS = "previews";
let opened: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
	opened ??= new Promise<IDBPDatabase>((resolve, reject) => {
		/** Another page still holds an older version: give up now (the next call tries again). */
		let gone = false;
		openDB(DB_NAME, 2, {
			upgrade(d) {
				for (const name of [STORE, PREVIEWS])
					if (!d.objectStoreNames.contains(name)) d.createObjectStore(name);
			},
			// `openDB` waits on a blocked open; here it must fail at once
			blocked() {
				gone = true;
				reject(new Error("IndexedDB is held by another tab"));
			},
			// a newer page wants to upgrade: let go, and open again on the next call
			blocking(_current, _blocked, e) {
				(e.target as IDBDatabase).close();
				opened = null;
			},
		}).then((d) => {
			if (gone) d.close();
			else resolve(d);
		}, reject);
	});
	opened.catch(() => {
		opened = null;
	});
	return opened;
}

/** Asks the browser once to keep this site's storage (Firefox asks the user at each call). */
let persistAsked = false;
function asksPersist() {
	if (persistAsked) return;
	persistAsked = true;
	void navigator.storage?.persist?.();
}

/** Keeps the file bytes of a photo on this device. Failure is not fatal: the photo just will not come back. */
export async function saveFile(id: string, file: Blob): Promise<void> {
	try {
		await (await db()).put(STORE, file, id);
		asksPersist();
	} catch {
		// private window or full disk: the photo stays open for this visit only
	}
}

/**
 * The file of a photo, or undefined when it is not stored. A storage error throws: "cannot read"
 * is not "gone", and only "gone" may drop a row of the list.
 */
export async function loadFile(id: string): Promise<Blob | undefined> {
	return (await db()).get(STORE, id);
}

export async function deleteFile(id: string): Promise<void> {
	try {
		const d = await db();
		await d.delete(STORE, id);
		await d.delete(PREVIEWS, id);
	} catch {
		// nothing to delete
	}
}

/** Keeps the bigger preview (a JPEG blob) of a photo. Returns false when it could not be kept. */
export async function savePreview(id: string, blob: Blob): Promise<boolean> {
	try {
		await (await db()).put(PREVIEWS, blob, id);
		return true;
	} catch {
		return false;
	}
}

/** The bigger preview of a photo, or undefined when there is none. */
export async function loadPreview(id: string): Promise<Blob | undefined> {
	try {
		return await (await db()).get(PREVIEWS, id);
	} catch {
		return undefined;
	}
}

/** The most the id list may take, in ms: a hung database counts as unreadable. */
const IDS_WAIT = 4000;

/**
 * The ids of every stored file, or null when the database cannot be read (an empty list means
 * the store really is empty; null must never be taken for that).
 */
export async function storedIds(): Promise<string[] | null> {
	const read = db()
		.then((d) => d.getAllKeys(STORE))
		.then(
			(keys) => keys.map(String),
			() => null,
		);
	const late = new Promise<null>((r) => setTimeout(() => r(null), IDS_WAIT));
	return Promise.race([read, late]);
}
