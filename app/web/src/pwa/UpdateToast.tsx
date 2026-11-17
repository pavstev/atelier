// The update prompt: a glass card that appears when a new version waits. "Reload" activates it,
// "Later" hides the card. Never updates by itself.
import { Button } from "@heroui/react";
import { useReducer } from "react";
import { usePwa } from "./usePwa.ts";

export function UpdateToast() {
	const { state, update } = usePwa();
	const [hidden, hide] = useReducer(() => true, false);
	if (!state.needRefresh || hidden) return null;
	return (
		<div
			role="status"
			data-testid="update-toast"
			className="glass fixed bottom-20 left-1/2 z-(--z-banner) flex max-w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-2 rounded-(--radius-card) p-2 pl-3 text-sm"
		>
			<span>A new version is ready.</span>
			<Button size="sm" variant="primary" onPress={update}>
				Reload
			</Button>
			<Button size="sm" variant="ghost" onPress={hide}>
				Later
			</Button>
		</div>
	);
}
