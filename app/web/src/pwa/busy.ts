// A counter of saves that are running (adding photos, the launch intake). The page does not reload for
// a new version while it is above zero, so a photo is never lost half way. `onIdle` runs a function
// once, when the count is back at zero (at once when it already is).

let count = 0;
let waiting: Array<() => void> = [];

/** A save starts. Call `end` when it is over, also when it fails. */
export function begin(): void {
	count++;
}

/** A save is over. The waiting functions run when no save is left. */
export function end(): void {
	if (count > 0) count--;
	if (count > 0) return;
	const run = waiting;
	waiting = [];
	for (const f of run) f();
}

export function isBusy(): boolean {
	return count > 0;
}

/** Runs `f` once when no save is running. */
export function onIdle(f: () => void): void {
	if (count === 0) f();
	else waiting.push(f);
}

/** Runs `job` between `begin` and `end`. */
export async function whileBusy<T>(job: () => Promise<T>): Promise<T> {
	begin();
	try {
		return await job();
	} finally {
		end();
	}
}
