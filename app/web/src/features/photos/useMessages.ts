// The messages the user sees in the red banner. Each comes from one source, and a new message
// replaces only the older one of its own source, so a drawing error never wipes a save error.
import { useCallback, useState } from "react";

/** Where a message comes from. */
type Source = "open" | "photo" | "save" | "layer";
export type Fail = (source: Source, text: string) => void;
export type Clear = (...sources: Source[]) => void;

export function useMessages() {
	const [messages, setMessages] = useState<Partial<Record<Source, string>>>({});
	/** Tells the user what went wrong. */
	const fail = useCallback<Fail>((source, text) => {
		setMessages((m) => (m[source] === text ? m : { ...m, [source]: text }));
	}, []);
	/** Takes back the messages of these sources (all of them when none is named). */
	const clear = useCallback<Clear>((...sources) => {
		setMessages((m) => {
			const gone = sources.length > 0 ? sources : (Object.keys(m) as Source[]);
			if (!gone.some((s) => s in m)) return m;
			const next = { ...m };
			for (const s of gone) delete next[s];
			return next;
		});
	}, []);
	return { errors: Object.values(messages), fail, clear };
}
