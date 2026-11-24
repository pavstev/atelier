// State that changes only through one pure reducer. The ref and the state are written together, so work
// that outlives a render (a decode, a timer) always reads the newest value from the ref.
import { useCallback, useRef, useState } from "react";

/** The state, a ref to the newest state, and `apply(action)`. An action that changes nothing does not render. */
export function useRefReducer<S, A>(init: () => S, reducer: (s: S, a: A) => S) {
	const [state, setState] = useState(init);
	const ref = useRef(state);
	const apply = useCallback(
		(a: A) => {
			const next = reducer(ref.current, a);
			if (next === ref.current) return;
			ref.current = next;
			setState(next);
		},
		[reducer],
	);
	return [state, ref, apply] as const;
}
