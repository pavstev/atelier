// The messages between the page (`coreClient.ts`) and the layers worker (`worker.ts`), as types, so
// both sides agree. No code of the worker is imported here: the page can import this file.
import type { Call, Rgb } from "./calls";

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
	  };

/** A good answer to a `load`: how many photos the worker holds now. */
export type LoadAnswer = { id: number; ok: true; kind: "load"; held: number };

/** A good answer to a `draw`: the picture, and for Values and Shapes its tones or piles. */
export type DrawAnswer = {
	id: number;
	ok: true;
	kind: "draw";
	width: number;
	height: number;
	rgba: ArrayBuffer;
	tones?: Rgb[];
	ms: number;
};

type FailAnswer = { id: number; ok: false; error: string };

export type WorkerResponse = LoadAnswer | DrawAnswer | FailAnswer;

/** The error text when a draw asks for a photo the worker no longer holds. The page matches it. */
export const PHOTO_GONE = "the photo is gone from the worker";
