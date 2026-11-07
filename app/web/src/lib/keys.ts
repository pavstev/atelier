// Every localStorage key of the page, named once. No React here, so the e2e specs can import it.
// The values are the names saved on users' devices: never change one.
export const KEYS = {
	/** The look: base, Edges and Grid with their knobs. */
	state: "atelier-web-state",
	/** The layout: hidden panel and panel width (older saves also hold folded cards; they are dropped). */
	layout: "atelier-web-layout",
	/** The list of photos (name, size, preview). */
	docs: "atelier-web-kept",
	/** The id of the photo that was on screen last. */
	active: "atelier-web-active",
	/** The sort and the layout of the photo list. */
	list: "atelier-web-list",
	/** The Lock zoom. The dotted name is the old one, kept so saved locks still load. */
	lock: "atelier.lockZoom",
	/** The zoom and position of each photo, as shares of the fit zoom and of the stage. */
	views: "atelier-web-views",
	/** Stored files that no photo of the list owned, and when they were first seen so (`store/orphans.ts`). */
	orphans: "atelier-web-orphans",
} as const;
