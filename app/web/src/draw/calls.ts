// One typed call per see-through layer, as the page sends it to the core in the worker.

export type LayerId = "shapes" | "values" | "grid";

/** A color as red, green and blue, 0 to 255. The one color type of the app (the picker reads it too). */
export type Rgb = readonly [number, number, number];

export type Call =
	| { layer: "shapes"; step: number; detail: number }
	| { layer: "values"; preset: number; detail: number }
	| {
			layer: "grid";
			/** The squares across the width in thousandths (a grid in cm). */
			milli: number;
	  };
