// A CSS media query as a React value.
import { useCallback, useSyncExternalStore } from "react";

/** True while `query` matches; the component renders again when that changes. */
export function useMedia(query: string): boolean {
	const subscribe = useCallback(
		(notify: () => void) => {
			const m = window.matchMedia(query);
			m.addEventListener("change", notify);
			return () => m.removeEventListener("change", notify);
		},
		[query],
	);
	return useSyncExternalStore(
		subscribe,
		() => window.matchMedia(query).matches,
		() => false,
	);
}
