// The paints on the table. Each paint is two things: the color it has on its own (a spectrum, how
// much light it gives back at each wavelength) and its tinting strength (how fast it takes over a
// mix, as scattering S next to white, which is 1). With those two, Kubelka-Munk (`spectral.ts`)
// predicts any mix.
//
// These spectra are typical shapes of the pigment class, not measurements of your tubes: no open
// measured acrylic data may be bundled (see docs/research). The shapes follow what is known of each
// pigment: cadmium and azo yellows and reds have a sharp edge (the paint passes the light above
// it), ultramarine reflects blue and some deep red, phthalo blue is a narrow blue peak, carbon
// black is flat and dark. To fit your own tubes, change a spectrum or a `strength` below.
import { BANDS } from "./spectral";

export type PaintId = "white" | "yellow" | "red" | "lake" | "phthalo" | "black";

export type Paint = {
	id: PaintId;
	name: string;
	/** The pigment this model stands for. */
	pigment: string;
	/** Reflectance inside the paint layer, 0 to 1, at each band of `BANDS`. */
	spectrum: readonly number[];
	/** Scattering next to titanium white (1). The stronger a colorant, the less of it a mix needs. */
	strength: number;
};

/** A step from 0 to 1 at `edge` nm, `width` nm wide. */
const step = (l: number, edge: number, width: number) =>
	1 / (1 + Math.exp(-(l - edge) / width));
/** A bump of height 1 at `center` nm, `width` nm wide. */
const bump = (l: number, center: number, width: number) =>
	Math.exp(-0.5 * ((l - center) / width) ** 2);

const spectrum = (f: (l: number) => number) =>
	BANDS.map((l) => Math.min(0.99, Math.max(0.005, f(l))));

/** The paints, in the order the card lists them. */
export const PAINTS: readonly Paint[] = [
	{
		id: "white",
		name: "White",
		pigment: "titanium white (PW6)",
		// rutile takes up the violet end a little
		spectrum: spectrum((l) => 0.965 * (1 - 0.3 * (1 - step(l, 412, 8)))),
		strength: 1,
	},
	{
		id: "yellow",
		name: "Yellow",
		pigment: "yellow medium (cadmium or azo, PY35 or PY74)",
		spectrum: spectrum((l) => 0.035 + 0.855 * step(l, 510, 11)),
		strength: 0.45,
	},
	{
		id: "red",
		name: "Red",
		pigment: "permanent red (naphthol or pyrrole, PR112 to PR254)",
		spectrum: spectrum((l) => 0.03 + 0.77 * step(l, 598, 9)),
		strength: 0.3,
	},
	{
		id: "lake",
		name: "Lake blue",
		pigment: "ultramarine-like blue (PB29)",
		spectrum: spectrum(
			(l) => 0.03 + 0.22 * bump(l, 450, 42) + 0.17 * step(l, 655, 18),
		),
		strength: 0.18,
	},
	{
		id: "phthalo",
		name: "Phthalo blue",
		pigment: "phthalocyanine blue (PB15)",
		spectrum: spectrum((l) => 0.025 + 0.21 * bump(l, 478, 38)),
		strength: 0.4,
	},
	{
		id: "black",
		name: "Black",
		pigment: "carbon black (PBk7)",
		spectrum: spectrum(() => 0.03),
		strength: 0.25,
	},
];
