// The photos on this device ("docs"), one list for all of them. Three homes, all on this device,
// nothing leaves it: the original files and bigger previews in IndexedDB (`idb.ts`), the list and
// which photo is on screen in localStorage (`schema.ts`, joined with another tab by `merge.ts`),
// and the decoded pixels in a small cache in memory (`cache.ts`). One file per job; this index is
// the one import for the rest of the app.
export { decoded } from "./cache";
export {
	cleanFolders,
	type Folder,
	type FoldersAction,
	foldersReducer,
	MAX_NAME,
	readFolders,
	readOpen,
	subtree,
} from "./folders";
export { addedText, sizeText } from "./format";
export {
	deleteFile,
	loadFile,
	loadPreview,
	saveFile,
	savePreview,
	storedIds,
} from "./idb";
export { mergeDocs } from "./merge";
export { ORPHAN_MS, orphansToDelete, sweepOrphans } from "./orphans";
export { type DocsAction, docsReducer } from "./reducer";
export { type Doc, readActive, readDocs, writeActive } from "./schema";
export {
	ancestors,
	canMoveInto,
	childFolders,
	countAll,
	flatFolders,
	folderOf,
	groupDocs,
	pathOf,
	photoIdsIn,
} from "./tree";
