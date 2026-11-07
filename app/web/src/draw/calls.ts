// One typed call per see-through layer, as the page sends it to the core in the worker.
export type LayerId = "edges" | "shapes" | "values" | "grid";

/** A color as red, green and blue, 0 to 255. */
export type Rgb = [number, number, number];

export type Call =
	| {
			layer: "edges";
			mode: number;
			amount: number;
			width: number;
			even: number;
	  }
	| { layer: "shapes"; step: number; detail: number }
	| { layer: "values"; preset: number; detail: number; tint: number }
	| {
			layer: "grid";
			mode: number;
			cells: number;
			width: number;
			group: number;
			center: number;
			color: number;
	  };
