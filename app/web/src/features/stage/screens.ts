// The built-in MacBook screens the Lock zoom knows: their "Looks like" sizes in points and the lit
// width in cm, so the app can fill in the screen width itself.

/** A built-in MacBook screen: its "Looks like" sizes in points and the lit width in cm. */
type ScreenModel = { name: string; cm: number; sizes: [number, number][] };

// The width is the panel diagonal Apple states, cut to the native pixel shape, so it is right to
// well under 1 percent. A browser sees one of the "Looks like" sizes of System Settings, Displays.
const MODELS: ScreenModel[] = [
	{
		name: "MacBook Air 13-inch (2020 and older), MacBook Pro 13-inch",
		cm: 28.65, // 13.3 in, 2560 x 1600
		sizes: [
			[1024, 640],
			[1280, 800],
			[1440, 900],
			[1680, 1050],
		],
	},
	{
		name: "MacBook Air 13-inch",
		cm: 28.96, // 13.6 in, 2560 x 1664
		sizes: [
			[1024, 665],
			[1280, 832],
			[1470, 956],
			[1710, 1112],
		],
	},
	{
		name: "MacBook Air 15-inch",
		cm: 32.62, // 15.3 in, 2880 x 1864
		sizes: [
			[1224, 792],
			[1440, 932],
			[1680, 1087],
			[1920, 1243],
		],
	},
	{
		name: "MacBook Pro 14-inch",
		cm: 30.25, // 14.2 in, 3024 x 1964
		sizes: [
			[1147, 745],
			[1352, 878],
			[1512, 982],
			[1800, 1169],
		],
	},
	{
		name: "MacBook Pro 16-inch (2019)",
		cm: 34.46, // 16.0 in, 3072 x 1920
		sizes: [
			[1344, 840],
			[1536, 960],
			[1792, 1120],
			[2048, 1280],
		],
	},
	{
		name: "MacBook Pro 16-inch",
		cm: 34.56, // 16.2 in, 3456 x 2234
		sizes: [
			[1312, 848],
			[1496, 967],
			[1728, 1117],
			[2056, 1329],
		],
	},
];

/**
 * The built-in MacBook screen this page is on, or null. It needs the browser at 100 percent
 * (pixel ratio 2), since a browser zoom changes the sizes the page sees.
 */
export function guessScreen(): { name: string; cm: number } | null {
	if (typeof window === "undefined" || window.devicePixelRatio !== 2)
		return null;
	const { width, height } = window.screen;
	const key = `${width}x${height}`;
	if (key !== guessedFor) {
		const hit = MODELS.find((p) =>
			p.sizes.some(([w, h]) => w === width && h === height),
		);
		guessed = hit ? { name: hit.name, cm: hit.cm } : null;
		guessedFor = key;
	}
	return guessed;
}

let guessedFor = "";
let guessed: { name: string; cm: number } | null = null;
