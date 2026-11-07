// What the hand does on the stage. The wheel zooms around the pointer. One finger or the mouse drags
// the picture. Two fingers pinch (zoom around their middle) and move it. A double tap or a double
// click toggles Fit and 100%. While locked, the wheel, a pinch and a double tap do nothing to the
// zoom (a drag or two fingers still move the picture), and a pinch anywhere on the page must not
// zoom the page either: Chrome sends it as a wheel turn with Ctrl, Safari as gesture events.
import {
	type PointerEvent as ReactPointerEvent,
	type RefObject,
	useEffect,
	useEffectEvent,
	useRef,
} from "react";
import { clampZoom, type View, zoomAround } from "./viewMath";

type Ctl = {
	box: RefObject<HTMLElement | null>;
	/** The view now. */
	view: View;
	/** The zoom that fits the photo. */
	fit: number;
	locked: boolean;
	/** Sets the view the user made; null goes back to Fit. */
	put: (v: View | null) => void;
};

type Hold =
	| { kind: "drag"; x: number; y: number; from: View }
	| { kind: "pinch"; d: number; mx: number; my: number; from: View };

type Point = { x: number; y: number };

/** The wheel step: a trackpad pinch (Ctrl) is finer than a wheel turn. */
const WHEEL_STEP = 0.0016;
const PINCH_STEP = 0.01;
/** A press that moves more than this, in px, is a drag and not a tap. */
const TAP_SLOP = 8;
/** Two taps within this time, in ms, and this distance, in px, are a double tap. */
const DOUBLE_MS = 350;
const DOUBLE_PX = 30;

const GESTURES = ["gesturestart", "gesturechange", "gestureend"];

export function useGestures(c: Ctl) {
	const fingers = useRef(new Map<number, Point>());
	const hold = useRef<Hold | null>(null);
	const press = useRef<(Point & { moved: boolean }) | null>(null);
	const lastTap = useRef<(Point & { t: number }) | null>(null);

	// The wheel needs a non-passive listener to stop the page from scrolling.
	const onWheel = useEffectEvent((e: WheelEvent, el: HTMLElement) => {
		e.preventDefault();
		if (c.locked) return;
		const r = el.getBoundingClientRect();
		const factor = Math.exp(-e.deltaY * (e.ctrlKey ? PINCH_STEP : WHEEL_STEP));
		const zoom = clampZoom(c.view.zoom * factor, c.fit);
		c.put(zoomAround(c.view, zoom, e.clientX - r.left, e.clientY - r.top));
	});
	useEffect(() => {
		const el = c.box.current;
		if (!el) return;
		const on = (e: WheelEvent) => onWheel(e, el);
		el.addEventListener("wheel", on, { passive: false });
		return () => el.removeEventListener("wheel", on);
	}, [c.box]);

	useEffect(() => {
		if (!c.locked) return;
		const stop = (e: Event) => e.preventDefault();
		const onPageWheel = (e: WheelEvent) => {
			if (e.ctrlKey) e.preventDefault();
		};
		window.addEventListener("wheel", onPageWheel, { passive: false });
		for (const g of GESTURES)
			document.addEventListener(g, stop, { passive: false });
		return () => {
			window.removeEventListener("wheel", onPageWheel);
			for (const g of GESTURES) document.removeEventListener(g, stop);
		};
	}, [c.locked]);

	/** Starts a new hold from the fingers now down (after one goes down or up). */
	const rebase = (el: HTMLElement) => {
		const [first, second] = [...fingers.current.values()];
		const from = c.view;
		if (first && second) {
			const r = el.getBoundingClientRect();
			hold.current = {
				kind: "pinch",
				d: Math.hypot(second.x - first.x, second.y - first.y) || 1,
				mx: (first.x + second.x) / 2 - r.left,
				my: (first.y + second.y) / 2 - r.top,
				from,
			};
		} else if (first)
			hold.current = { kind: "drag", x: first.x, y: first.y, from };
		else hold.current = null;
	};

	/** Double tap: back to Fit when the photo is at 100%, else to 100% around the point. */
	const toggleActual = (px: number, py: number) => {
		if (c.locked) return;
		if (Math.abs(c.view.zoom - 1) < 0.001) c.put(null);
		else c.put(zoomAround(c.view, 1, px, py));
	};

	const lift = (e: ReactPointerEvent, tapped: boolean) => {
		const p = press.current;
		if (tapped && p && !p.moved && fingers.current.size === 1) {
			const now = e.timeStamp;
			const last = lastTap.current;
			if (
				last &&
				now - last.t < DOUBLE_MS &&
				Math.hypot(e.clientX - last.x, e.clientY - last.y) < DOUBLE_PX
			) {
				lastTap.current = null;
				const r = e.currentTarget.getBoundingClientRect();
				toggleActual(e.clientX - r.left, e.clientY - r.top);
			} else lastTap.current = { x: e.clientX, y: e.clientY, t: now };
		}
		fingers.current.delete(e.pointerId);
		press.current = null;
		rebase(e.currentTarget as HTMLElement);
	};

	return {
		onPointerDown: (e: ReactPointerEvent) => {
			if (e.pointerType === "mouse" && e.button !== 0) return;
			e.currentTarget.setPointerCapture(e.pointerId);
			fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
			press.current =
				fingers.current.size === 1
					? { x: e.clientX, y: e.clientY, moved: false }
					: null;
			rebase(e.currentTarget as HTMLElement);
		},
		onPointerMove: (e: ReactPointerEvent) => {
			const f = fingers.current.get(e.pointerId);
			const h = hold.current;
			if (!f || !h) return;
			f.x = e.clientX;
			f.y = e.clientY;
			const p = press.current;
			if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > TAP_SLOP)
				p.moved = true;
			if (h.kind === "drag") {
				c.put({
					zoom: h.from.zoom,
					x: h.from.x + e.clientX - h.x,
					y: h.from.y + e.clientY - h.y,
				});
				return;
			}
			const [first, second] = [...fingers.current.values()];
			if (!first || !second) return;
			const r = e.currentTarget.getBoundingClientRect();
			const mx = (first.x + second.x) / 2 - r.left;
			const my = (first.y + second.y) / 2 - r.top;
			const d = Math.hypot(second.x - first.x, second.y - first.y);
			const zoom = c.locked
				? h.from.zoom
				: clampZoom(h.from.zoom * (d / h.d), c.fit);
			c.put(zoomAround(h.from, zoom, h.mx, h.my, mx, my));
		},
		onPointerUp: (e: ReactPointerEvent) => lift(e, true),
		onPointerCancel: (e: ReactPointerEvent) => lift(e, false),
		onLostPointerCapture: (e: ReactPointerEvent) => lift(e, false),
	};
}
