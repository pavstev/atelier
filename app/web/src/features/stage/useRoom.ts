// The size of the stage box, kept up to date while the window or the panel changes.
import { useEffect, useRef, useState } from "react";
import type { Room } from "./viewMath";

export function useRoom() {
	const box = useRef<HTMLDivElement>(null);
	const [room, setRoom] = useState<Room>({ w: 0, h: 0 });
	useEffect(() => {
		const el = box.current;
		if (!el) return;
		const measure = () =>
			setRoom((r) =>
				r.w === el.clientWidth && r.h === el.clientHeight
					? r
					: { w: el.clientWidth, h: el.clientHeight },
			);
		const watch = new ResizeObserver(measure);
		watch.observe(el);
		measure();
		return () => watch.disconnect();
	}, []);
	return { box, room };
}
