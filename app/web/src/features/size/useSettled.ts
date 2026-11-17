// A number box that settles before it commits: the typed value shows at once, but the change goes
// on about 300 ms after the last key, or on blur. So typing a width does not recrop every layer on
// each key. `createSettler` is the plain part (a test fakes the timer); `useSettled` is the hook.
import { useEffect, useRef, useState } from "react";

/** How long after the last key the typed value is committed (ms). */
export const SETTLE_MS = 300;

type Timers = {
	set: (f: () => void, ms: number) => unknown;
	clear: (id: unknown) => void;
};

const REAL: Timers = {
	set: (f, ms) => setTimeout(f, ms),
	clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export function createSettler(
	commit: (v: number) => void,
	ms = SETTLE_MS,
	timers: Timers = REAL,
) {
	let id: unknown = null;
	let pending: number | null = null;
	const flush = () => {
		if (id !== null) timers.clear(id);
		id = null;
		if (pending === null) return;
		const v = pending;
		pending = null;
		commit(v);
	};
	return {
		/** A new typed value; commits after `ms` without another one. */
		push(v: number) {
			pending = v;
			if (id !== null) timers.clear(id);
			id = timers.set(flush, ms);
		},
		/** Commits a waiting value now (blur, unmount). */
		flush,
		/** True while a typed value waits. */
		get waiting() {
			return pending !== null;
		},
	};
}

/**
 * The value to show, a setter for typing, and a flush for blur. While a typed value waits, it is
 * the one shown; when it commits, the shown value follows `value` again.
 */
export function useSettled(value: number, commit: (v: number) => void) {
	const [typed, setTyped] = useState<number | null>(null);
	const last = useRef(commit);
	last.current = commit;
	const settler = useRef<ReturnType<typeof createSettler> | null>(null);
	if (!settler.current) {
		settler.current = createSettler((v) => {
			setTyped(null);
			last.current(v);
		});
	}
	const s = settler.current;
	// a waiting value is sent on when the box goes away
	useEffect(() => () => s.flush(), [s]);
	return {
		shown: typed ?? value,
		type: (v: number) => {
			setTyped(v);
			s.push(v);
		},
		flush: () => s.flush(),
	};
}
