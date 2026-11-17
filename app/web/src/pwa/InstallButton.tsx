// The install control: a button when the browser offers an install prompt, a short tip on iOS
// ("Share, then Add to Home Screen"), nothing when the app is installed or cannot be.
import { Button } from "@heroui/react";
import { installLabel } from "./labels.ts";
import { usePwa } from "./usePwa.ts";

export function InstallButton() {
	const { state, install } = usePwa();
	const label = installLabel(state);
	if (label === "install") {
		return (
			<Button
				size="sm"
				variant="secondary"
				data-testid="install-button"
				onPress={install}
			>
				Install app
			</Button>
		);
	}
	if (label === "ios-tip") {
		return (
			<p data-testid="ios-tip" className="text-xs text-muted">
				Share, then Add to Home Screen
			</p>
		);
	}
	return null;
}
