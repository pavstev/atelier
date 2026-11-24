// The messages between the page (`coreClient.ts`) and the layers worker (`worker.ts`), as types, so
// both sides agree. No code of the worker is imported here: the page can import this file.
import type { Call, PencilAuto, Rgb } from "./calls";

/** What the page asks of the worker. `id` pairs an answer with its request. */
export type WorkerRequest =
	| {
			id: number;
			kind: "load";
			photo: number;
			rgba: ArrayBuffer;
			width: number;
			height: number;
	  }
	| {
			id: number;
			kind: "draw";
			photo: number;
			long: number;
			call: Call;
	  }
	| { id: number; kind: "pencilAuto"; photo: number; long: number }
	| {
			id: number;
			kind: "pencilSuggest";
			photo: number;
			long: number;
			count: number;
	  };

/** A good answer to a `load`: how many photos the worker holds now. */
export type LoadAnswer = { id: number; ok: true; kind: "load"; held: number };

/** What a draw tells besides the picture: for Values and Shapes the tones or piles, and for Pencil
 * its tones, the share of each in percent and the marked level (By pencil). */
export type DrawExtras = {
	tones?: Rgb[];
	shares?: number[];
	/** The index of the level By pencil is drawn up to; missing for every other look. */
	mark?: number;
};

/** A good answer to a `draw`: the picture and its `DrawExtras`. */
export type DrawAnswer = DrawExtras & {
	id: number;
	ok: true;
	kind: "draw";
	width: number;
	height: number;
	rgba: ArrayBuffer;
	ms: number;
};

/** A good answer to `pencilAuto`: what Auto found in the photo. */
export type AutoAnswer = {
	id: number;
	ok: true;
	kind: "pencilAuto";
	auto: PencilAuto;
};

/** A good answer to `pencilSuggest`: the mask of the suggested pencils. */
export type SuggestAnswer = {
	id: number;
	ok: true;
	kind: "pencilSuggest";
	mask: number;
};

type FailAnswer = { id: number; ok: false; error: string };

export type WorkerResponse =
	| LoadAnswer
	| DrawAnswer
	| AutoAnswer
	| SuggestAnswer
	| FailAnswer;

/** The error text when a draw asks for a photo the worker no longer holds. The page matches it. */
export const PHOTO_GONE = "the photo is gone from the worker";
