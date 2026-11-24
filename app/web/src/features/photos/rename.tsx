// What a photo row and a folder row share: the classes of their small action buttons, and the rename
// box (a typed name that Enter or a click away saves and Escape drops).
import { Input } from "@heroui/react";
import { useState } from "react";

/** A small action of a row (the pen, move, the bin): fills on hover. */
export const ROW_ACTION =
	"rounded-(--radius-chip) transition-colors hover:bg-foreground/15";
/** The bin: the same, and it turns red. */
export const DELETE_ACTION = `${ROW_ACTION} hover:bg-danger/20 hover:text-danger`;

/**
 * The typed name of a rename. `done(true)` saves it when it is a new, non-empty name (trimmed);
 * `done(false)` and an unchanged or empty name drop it. Both call `stop` first, to close the box.
 * `reset` puts the current name in the box again (call it when the rename starts).
 */
export function useRename(
	name: string,
	save: (name: string) => void,
	stop: () => void,
) {
	const [text, setText] = useState(name);
	const done = (ok: boolean) => {
		stop();
		const next = text.trim();
		if (ok && next && next !== name) save(next);
		else setText(name);
	};
	return { text, setText, done, reset: () => setText(name) };
}

/** The rename box of a row: it takes the focus and selects the name. */
export function RenameInput(p: {
	label: string;
	testid: string;
	rename: ReturnType<typeof useRename>;
}) {
	const { text, setText, done } = p.rename;
	return (
		<Input
			autoFocus
			aria-label={p.label}
			data-testid={p.testid}
			value={text}
			maxLength={120}
			className="min-w-0 flex-1"
			onFocus={(e) => e.currentTarget.select()}
			onChange={(e) => setText(e.target.value)}
			onBlur={() => done(true)}
			onKeyDown={(e) => {
				if (e.key === "Enter") done(true);
				if (e.key === "Escape") done(false);
			}}
		/>
	);
}
