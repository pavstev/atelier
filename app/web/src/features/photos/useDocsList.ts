// The list of photos on this device as React state, and its saving. The list changes only through
// `apply` (one pure reducer, `docsReducer`), which writes the ref and the state together so work that
// outlives a render always reads the newest list. It is saved by the one saver (`useSaved`) and
// when the page is hidden, and it is joined with what another tab saved (`mergeDocs`), on the `storage`
// event and before each save.
import { useCallback, useEffect, useRef, useState } from "react";
import { KEYS, loadText, SAVE_MS, useSaved } from "@/lib/storage";
import {
	type Doc,
	type DocsAction,
	docsReducer,
	mergeDocs,
	readDocs,
} from "./store";

export function useDocsList(onSaveFail: () => void) {
	const [docs, setDocsState] = useState<Doc[]>(readDocs);
	const docsRef = useRef(docs);
	const apply = useCallback((a: DocsAction) => {
		const next = docsReducer(docsRef.current, a);
		if (next === docsRef.current) return;
		docsRef.current = next;
		setDocsState(next);
	}, []);
	const patch = useCallback(
		(id: string, change: Partial<Doc>) => apply({ type: "patch", id, change }),
		[apply],
	);

	/** The list as storage held it when this page last read or wrote it, and its text (to see a change). */
	const stored = useRef({ list: docs, text: loadText(KEYS.docs) });
	/**
	 * Joins what another tab saved meanwhile (three ways, against the last list this page knew), so two
	 * tabs add photos to one list instead of the last writer winning.
	 */
	const joinStored = useCallback((local: Doc[]): Doc[] => {
		const text = loadText(KEYS.docs);
		if (text === stored.current.text) return local;
		const remote = readDocs();
		const merged = mergeDocs(stored.current.list, local, remote);
		stored.current = { list: remote, text };
		return merged;
	}, []);
	useSaved(KEYS.docs, docs, SAVE_MS, {
		merge: (local) => {
			const merged = joinStored(local);
			if (merged !== local) apply({ type: "set", list: merged });
			return merged;
		},
		onSaved: (written) => {
			stored.current = { list: written, text: loadText(KEYS.docs) };
		},
		onFail: onSaveFail,
	});
	// another tab saved the list: join it at once
	useEffect(() => {
		const on = (e: StorageEvent) => {
			if (e.storageArea !== localStorage) return;
			if (e.key !== null && e.key !== KEYS.docs) return;
			const merged = joinStored(docsRef.current);
			if (merged !== docsRef.current) apply({ type: "set", list: merged });
		};
		window.addEventListener("storage", on);
		return () => window.removeEventListener("storage", on);
	}, [joinStored, apply]);

	return { docs, docsRef, apply, patch };
}
