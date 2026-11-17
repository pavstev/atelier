// Which install control to show: "install" (the browser offered a prompt), "ios-tip" (iOS Safari has
// no prompt, so a tip explains the Share sheet) or "none" (already installed, or nothing to offer).
import type { PwaState } from "./state.ts";

export function installLabel(s: PwaState): "install" | "ios-tip" | "none" {
	if (s.standalone) return "none";
	if (s.canInstall) return "install";
	if (s.showIosTip) return "ios-tip";
	return "none";
}
