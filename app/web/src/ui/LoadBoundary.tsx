// An error boundary for the lazy parts (a tool card, the color picker). If a chunk fails to load
// (offline, or an old tab after a deploy) it shows one short message and a Reload button, not a
// blank page. React keeps a failed lazy import, so only a reload brings the part back.
import { Button } from "@heroui/react";
import { Component, type ReactNode } from "react";

type Props = {
	children: ReactNode;
	/** Classes of the message box, for a part that floats (the color picker). */
	className?: string;
};

export class LoadBoundary extends Component<Props, { failed: boolean }> {
	state = { failed: false };

	static getDerivedStateFromError() {
		return { failed: true };
	}

	render() {
		if (!this.state.failed) return this.props.children;
		return (
			<div
				role="alert"
				data-testid="load-error"
				className={`flex items-center gap-2 text-sm ${this.props.className ?? "p-3"}`}
			>
				<span>This part did not load. Reload to try again.</span>
				<Button
					size="sm"
					variant="secondary"
					data-testid="load-reload"
					onPress={() => window.location.reload()}
				>
					Reload
				</Button>
			</div>
		);
	}
}
