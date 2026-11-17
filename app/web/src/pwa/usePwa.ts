// A React hook over the PWA store in register.ts: the state, an update action and an install action.
import { useSyncExternalStore } from "react";
import { applyUpdate, getState, promptInstall, subscribe } from "./register.ts";
import type { PwaApi } from "./state.ts";

export function usePwa(): PwaApi {
	const state = useSyncExternalStore(subscribe, getState, getState);
	return { state, update: applyUpdate, install: promptInstall };
}
