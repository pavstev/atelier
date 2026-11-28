// Takes photos that the OS hands to the app: the launch queue (Open with on desktop). Each batch
// goes to `add`.
import { whileBusy } from "./busy.ts";

/** What the real adder is called with (T8 wraps addPhotos into this). */
export type AddFiles = (files: File[]) => void;

type Handle = { getFile: () => Promise<File> };

/** The parts of `window` the intake uses, so a test can fake them. */
export type IntakeWindow = {
	launchQueue?: {
		setConsumer: (c: (p: { files: readonly Handle[] }) => void) => void;
	};
};

/** Starts listening for launched photos. `win` is the page's `window` (or a fake in a test). */
export function startIntake(win: object, add: AddFiles): void {
	(win as IntakeWindow).launchQueue?.setConsumer((p) =>
		whileBusy(async () => {
			const files = await Promise.all(p.files.map((h) => h.getFile()));
			if (files.length) add(files);
		}),
	);
}
