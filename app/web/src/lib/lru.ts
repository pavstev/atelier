// "Keep the newest N" for a Map, and a small least-recently-used map built on it.

/**
 * Drops the oldest entries of `map` (the first inserted) until `size` are left. `onDrop` sees each
 * dropped entry before it goes, so a caller can free what it holds.
 */
export function keepNewest<K, V>(
	map: Map<K, V>,
	size: number,
	onDrop?: (key: K, value: V) => void,
): void {
	for (const [key, value] of map) {
		if (map.size <= size) break;
		onDrop?.(key, value);
		map.delete(key);
	}
}

/** A small least-recently-used map: a read or a write makes the key the newest. */
export class Lru<V> {
	private map = new Map<string, V>();
	constructor(private readonly size: number) {}
	get(id: string): V | undefined {
		const v = this.map.get(id);
		if (v !== undefined) {
			this.map.delete(id);
			this.map.set(id, v);
		}
		return v;
	}
	set(id: string, v: V) {
		this.map.delete(id);
		this.map.set(id, v);
		keepNewest(this.map, this.size);
	}
	delete(id: string) {
		this.map.delete(id);
	}
}
