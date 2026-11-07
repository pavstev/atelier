// The one place the page reads and writes `localStorage`. A read cleans what it finds (a broken or
// wrong-typed save gives the start value); a write never throws. Saving that follows changes goes
// through one debounced saver (`Saver`): `useSaved` is its hook form (`usePersisted` adds the state), `store/` and `views.ts` use it
// directly.
import { useEffect, useEffectEvent, useState } from "react";
import { KEYS } from "./keys";

export { KEYS };

/** The value saved under `key`, cleaned by `clean`; `fallback()` when there is none or it is broken
 * (`clean(null)` unless the caller gives another start). */
export function loadJson<T>(
	key: string,
	clean: (raw: unknown) => T,
	fallback: () => T = () => clean(null),
): T {
	try {
		const text = localStorage.getItem(key);
		return text === null ? fallback() : clean(JSON.parse(text));
	} catch {
		return fallback();
	}
}

/** Saves a value; false when storage is full or blocked (the value then lasts for this visit only). */
export function saveJson(key: string, value: unknown): boolean {
	try {
		localStorage.setItem(key, JSON.stringify(value));
		return true;
	} catch {
		return false;
	}
}

/** The saved text under `key`, or null. */
export function loadText(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

/** Saves text, or removes the key when `text` is null. */
export function saveText(key: string, text: string | null) {
	try {
		if (text === null) localStorage.removeItem(key);
		else localStorage.setItem(key, text);
	} catch {
		// the value lasts for this visit only
	}
}

/** The one delay rule: a change is saved this long (ms) after the last change in a burst. */
export const SAVE_MS = 200;

/** What a saver may ask of its owner when it writes. */
export type SaveHooks<T> = {
	/** Returns another value to write (the page joins what another tab saved meanwhile). */
	merge?: (local: T) => T;
	/** Gets what was written. */
	onSaved?: (written: T) => void;
	/** Called once when a write fails, and again only after a write has worked in between. */
	onFail?: () => void;
};

/**
 * Saves one key after a burst of changes: `later` waits `SAVE_MS` after the last call, then writes
 * what `read` gives. `flush` writes at once, but only when a change is waiting (so it never
 * overwrites with an old value). `attach` flushes when the page is hidden or closed.
 */
export class Saver<T> {
	private timer: ReturnType<typeof setTimeout> | undefined;
	private pending = false;
	private failing = false;
	private read: (() => T) | undefined;
	private hooks: () => SaveHooks<T> | undefined = () => undefined;

	constructor(private readonly key: string) {}

	/** A change happened: write `read()` after `wait` ms of quiet (at once when `wait` is 0). */
	later(
		read: () => T,
		wait = SAVE_MS,
		hooks: () => SaveHooks<T> | undefined = () => undefined,
	) {
		this.read = read;
		this.hooks = hooks;
		this.pending = true;
		clearTimeout(this.timer);
		if (wait <= 0) this.write();
		else this.timer = setTimeout(() => this.write(), wait);
	}

	/** Stops the wait without writing (the owner went away). */
	cancel() {
		clearTimeout(this.timer);
	}

	/** Writes now, if a change is waiting. */
	flush() {
		if (this.pending) this.write();
	}

	/** Flushes when the page is hidden. Returns the undo. */
	attach(): () => void {
		const on = () => this.flush();
		window.addEventListener("pagehide", on);
		return () => window.removeEventListener("pagehide", on);
	}

	private write() {
		clearTimeout(this.timer);
		this.pending = false;
		if (!this.read) return;
		const h = this.hooks();
		const local = this.read();
		const out = h?.merge ? h.merge(local) : local;
		if (saveJson(this.key, out)) {
			this.failing = false;
			h?.onSaved?.(out);
		} else if (!this.failing) {
			this.failing = true;
			h?.onFail?.();
		}
	}
}

/**
 * Keeps `value` saved under `key` (which must not change). A burst of changes (a slider drag) is
 * saved once, `wait` ms after the last one (`SAVE_MS` unless a caller needs another), and the last
 * value is also saved when the page is hidden or closed. See `SaveHooks` for `hooks`.
 */
export function useSaved<T>(
	key: string,
	value: T,
	wait = SAVE_MS,
	hooks?: SaveHooks<T>,
) {
	const [saver] = useState(() => new Saver<T>(key));
	// the newest hooks, read when a write happens (not when the change was seen)
	const latestHooks = useEffectEvent(() => hooks);
	useEffect(() => saver.attach(), [saver]);
	useEffect(() => {
		saver.later(() => value, wait, latestHooks);
		return () => saver.cancel();
	}, [saver, value, wait]);
}

/** State that starts from `read()` (the saved value, cleaned) and is kept saved under `key`. */
export function usePersisted<T>(key: string, read: () => T, wait = SAVE_MS) {
	const [value, setValue] = useState(read);
	useSaved(key, value, wait);
	return [value, setValue] as const;
}
