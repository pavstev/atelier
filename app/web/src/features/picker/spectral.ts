// The color science under the paint mixer: spectra, the eye, and color difference. No paint
// knowledge lives here. A spectrum is the share of light a surface gives back at each wavelength,
// 400 to 700 nm in steps of 10 nm (31 bands).
//
// Sources, so each number can be checked:
// - Kubelka and Munk: the K/S law of an opaque paint layer. K (absorption) and S (scattering) of a
//   mix add up by share. R = 1 + K/S - sqrt((K/S)^2 + 2 K/S). Berns, "Artist paint spectral
//   modeling", RIT, and Wikipedia "Kubelka-Munk theory".
// - Saunderson: the paint surface reflects a little light before the paint does. With k1 (outer
//   surface, 0.03 to 0.04) and k2 (inner surface, about 0.6 for a binder of index 1.5):
//   Rs = (1 - k1)(1 - k2) R / (1 - k2 R) for a view that leaves out the shine.
// - CIE 1931 2 degree observer: Wyman, Sloan and Shirley (2013), "Simple analytic approximations
//   to the CIE XYZ color matching functions", multi-lobe fit.
// - CIE standard illuminant D65 (daylight, the white of an sRGB screen), 10 nm table.
// - sRGB: IEC 61966-2-1 matrices and curve.
// - CIEDE2000: Sharma, Wu and Dalal (2005). The tests check it against their published pairs.

export type Rgb = readonly [number, number, number];
export type Lab = readonly [number, number, number];

/** The wavelengths in nm. */
export const BANDS: readonly number[] = Array.from(
	{ length: 31 },
	(_, i) => 400 + 10 * i,
);

/** CIE D65, relative power at each band (560 nm is 100). */
const D65 = [
	82.7549, 91.486, 93.4318, 86.6823, 104.865, 117.008, 117.812, 114.861,
	115.923, 108.811, 109.354, 107.802, 104.79, 107.689, 104.405, 104.046, 100,
	96.3342, 95.788, 88.6856, 90.0062, 89.5991, 87.6987, 83.2886, 83.6992,
	80.0268, 80.2146, 82.2778, 78.2842, 69.7213, 71.6091,
];

const lobe = (x: number, mu: number, s1: number, s2: number) => {
	const t = (x - mu) / (x < mu ? s1 : s2);
	return Math.exp(-0.5 * t * t);
};

const xbar = (l: number) =>
	1.056 * lobe(l, 599.8, 37.9, 31) +
	0.362 * lobe(l, 442, 16, 26.7) -
	0.065 * lobe(l, 501.1, 20.4, 26.2);
const ybar = (l: number) =>
	0.821 * lobe(l, 568.8, 46.9, 40.5) + 0.286 * lobe(l, 530.9, 16.3, 31.1);
const zbar = (l: number) =>
	1.217 * lobe(l, 437, 11.8, 36) + 0.681 * lobe(l, 459, 26, 13.8);

/** The D65 white point, Y = 1. */
export const D65_WHITE: Lab = [0.95047, 1, 1.08883];
const WHITE = D65_WHITE;

/** The weight of each band for X, Y and Z: D65 times the observer, scaled so a perfect white
 * (reflectance 1 everywhere) is exactly the D65 white point. The band sum stands in for the
 * integral, and the scaling takes out the error of the short range and the 10 nm step. */
const W = (() => {
	const raw = BANDS.map((l, i) => {
		const d = D65[i] as number;
		return [d * xbar(l), d * ybar(l), d * zbar(l)] as const;
	});
	const sum = [0, 1, 2].map((k) => raw.reduce((s, w) => s + w[k as 0], 0));
	const scale = [0, 1, 2].map((k) => (WHITE[k] as number) / (sum[k] as number));
	return raw.map(
		(w) =>
			[
				w[0] * (scale[0] as number),
				w[1] * (scale[1] as number),
				w[2] * (scale[2] as number),
			] as const,
	);
})();

/** CIE XYZ of a spectrum (reflectance by band), D65, Y = 1 for a perfect white. */
export function xyzOf(r: ArrayLike<number>): Lab {
	let x = 0;
	let y = 0;
	let z = 0;
	for (let i = 0; i < BANDS.length; i++) {
		const w = W[i] as readonly [number, number, number];
		const v = r[i] as number;
		x += v * w[0];
		y += v * w[1];
		z += v * w[2];
	}
	return [x, y, z];
}

const f = (t: number) =>
	t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116;

/** CIE L*a*b* of an XYZ color (D65). */
export function labOfXyz([x, y, z]: Lab): Lab {
	const fx = f(x / WHITE[0]);
	const fy = f(y);
	const fz = f(z / WHITE[2]);
	return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export const linearOf = (c: number) => {
	const v = c / 255;
	return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
/** The sRGB value (0 to 255, not rounded) of a linear-light value. */
export const encodeOf = (v: number) =>
	(v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055) * 255;

/** XYZ of an sRGB color. */
export function xyzOfRgb([r, g, b]: Rgb): Lab {
	const [lr, lg, lb] = [linearOf(r), linearOf(g), linearOf(b)];
	return [
		0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb,
		0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb,
		0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb,
	];
}

/** The sRGB color (whole numbers, clipped to the screen) of an XYZ color. */
export function rgbOfXyz([x, y, z]: Lab): Rgb {
	const lr = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
	const lg = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
	const lb = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
	const c = (v: number) =>
		Math.round(Math.min(255, Math.max(0, encodeOf(Math.max(0, v)))));
	return [c(lr), c(lg), c(lb)];
}

export const labOfRgb = (c: Rgb): Lab => labOfXyz(xyzOfRgb(c));

/** Saunderson settings: the paint surface, as Berns used for acrylic. */
const K1 = 0.035;
const K2 = 0.6;

/** The reflectance seen from outside (no shine) for an inside reflectance r. */
export const surface = (r: number) => ((1 - K1) * (1 - K2) * r) / (1 - K2 * r);

/** The inside reflectance of an opaque layer with absorption k and scattering s (K and S). */
export function kubelkaMunk(k: number, s: number): number {
	const q = k / s;
	return 1 + q - Math.sqrt(q * q + 2 * q);
}

/** K/S of an inside reflectance r (the inverse of `kubelkaMunk`). */
export const ksOf = (r: number) => ((1 - r) * (1 - r)) / (2 * r);

/** The inside reflectance of a surface reflectance (the inverse of `surface`). */
export const inside = (rs: number) => rs / ((1 - K1) * (1 - K2) + K2 * rs);

/** CIEDE2000 color difference (kL = kC = kH = 1). 1 is a just visible difference. */
export function deltaE2000(a: Lab, b: Lab): number {
	const [l1, a1, b1] = a;
	const [l2, a2, b2] = b;
	const rad = Math.PI / 180;
	const c1 = Math.hypot(a1, b1);
	const c2 = Math.hypot(a2, b2);
	const cm7 = ((c1 + c2) / 2) ** 7;
	const g = 0.5 * (1 - Math.sqrt(cm7 / (cm7 + 25 ** 7)));
	const a1p = (1 + g) * a1;
	const a2p = (1 + g) * a2;
	const c1p = Math.hypot(a1p, b1);
	const c2p = Math.hypot(a2p, b2);
	const hue = (y: number, x: number) => {
		if (x === 0 && y === 0) return 0;
		const h = Math.atan2(y, x) / rad;
		return h < 0 ? h + 360 : h;
	};
	const h1p = hue(b1, a1p);
	const h2p = hue(b2, a2p);
	const dl = l2 - l1;
	const dc = c2p - c1p;
	let dh = 0;
	if (c1p * c2p !== 0) {
		dh = h2p - h1p;
		if (dh > 180) dh -= 360;
		else if (dh < -180) dh += 360;
	}
	const dH = 2 * Math.sqrt(c1p * c2p) * Math.sin((dh * rad) / 2);
	const lb = (l1 + l2) / 2;
	const cb = (c1p + c2p) / 2;
	let hb = h1p + h2p;
	if (c1p * c2p !== 0) {
		if (Math.abs(h1p - h2p) <= 180) hb /= 2;
		else hb = hb < 360 ? (hb + 360) / 2 : (hb - 360) / 2;
	}
	const t =
		1 -
		0.17 * Math.cos((hb - 30) * rad) +
		0.24 * Math.cos(2 * hb * rad) +
		0.32 * Math.cos((3 * hb + 6) * rad) -
		0.2 * Math.cos((4 * hb - 63) * rad);
	const dTheta = 30 * Math.exp(-(((hb - 275) / 25) ** 2));
	const cb7 = cb ** 7;
	const rc = 2 * Math.sqrt(cb7 / (cb7 + 25 ** 7));
	const sl = 1 + (0.015 * (lb - 50) ** 2) / Math.sqrt(20 + (lb - 50) ** 2);
	const sc = 1 + 0.045 * cb;
	const sh = 1 + 0.015 * cb * t;
	const rt = -Math.sin(2 * dTheta * rad) * rc;
	const x = dl / sl;
	const y = dc / sc;
	const z = dH / sh;
	return Math.sqrt(x * x + y * y + z * z + rt * y * z);
}
