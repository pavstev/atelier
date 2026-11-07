// The original files and the bigger previews, in IndexedDB on this device. Nothing leaves it. A
// reload or a closed window brings the photos back from here.

const DB_NAME = "atelier";
const STORE = "photos";
/** The bigger previews (version 2 of the database). */
const PREVIEWS = "previews";
let opened: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
	opened ??= new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, 2);
		/** Another page still holds an older version: give up now (the next call tries again). */
		let gone = false;
		req.onupgradeneeded = () => {
			for (const name of [STORE, PREVIEWS])
				if (!req.result.objectStoreNames.contains(name))
					req.result.createObjectStore(name);
		};
		req.onsuccess = () => {
			const d = req.result;
			if (gone) {
				d.close();
				return;
			}
			// a newer page wants to upgrade: let go, and open again on the next call
			d.onversionchange = () => {
				d.close();
				opened = null;
			};
			resolve(d);
		};
		req.onerror = () => reject(req.error ?? new Error("no IndexedDB"));
		req.onblocked = () => {
			gone = true;
			reject(new Error("IndexedDB is held by another tab"));
		};
	});
	opened.catch(() => {
		opened = null;
	});
	return opened;
}

async function run<T>(
	mode: IDBTransactionMode,
	act: (store: IDBObjectStore) => IDBRequest<T>,
	name = STORE,
): Promise<T> {
	const store = (await db()).transaction(name, mode).objectStore(name);
	return new Promise((resolve, reject) => {
		const req = act(store);
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error ?? new Error("IndexedDB failed"));
	});
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
		await run("readwrite", (s) => s.put(file, id));
		asksPersist();
	} catch {
		// private window or full disk: the photo stays open for this visit only
	}
}

/**
 * The file of a photo, or undefined when it is not stored. A storage error throws: "cannot read"
 * is not "gone", and only "gone" may drop a row of the list.
 */
export function loadFile(id: string): Promise<Blob | undefined> {
	return run<Blob | undefined>("readonly", (s) => s.get(id));
}

export async function deleteFile(id: string): Promise<void> {
	try {
		await run("readwrite", (s) => s.delete(id));
		await run("readwrite", (s) => s.delete(id), PREVIEWS);
	} catch {
		// nothing to delete
	}
}

/** Keeps the bigger preview (a JPEG blob) of a photo. Returns false when it could not be kept. */
export async function savePreview(id: string, blob: Blob): Promise<boolean> {
	try {
		await run("readwrite", (s) => s.put(blob, id), PREVIEWS);
		return true;
	} catch {
		return false;
	}
}

/** The bigger preview of a photo, or undefined when there is none. */
export async function loadPreview(id: string): Promise<Blob | undefined> {
	try {
		return await run<Blob | undefined>("readonly", (s) => s.get(id), PREVIEWS);
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
	const read = run<IDBValidKey[]>("readonly", (s) => s.getAllKeys()).then(
		(keys) => keys.map(String),
		() => null,
	);
	const late = new Promise<null>((r) => setTimeout(() => r(null), IDS_WAIT));
	return Promise.race([read, late]);
}
