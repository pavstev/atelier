// The page's line to the layers worker: each request gets an id, and its answer finds it again.
// The types come from `messages.ts`, so a `load` request is answered with a `LoadAnswer` and a
// `draw` request with a `DrawAnswer`. Once the worker died, every call rejects.
import type {
	DrawAnswer,
	LoadAnswer,
	WorkerRequest,
	WorkerResponse,
} from "./messages";

/** A request without its id. */
type Body<K extends WorkerRequest["kind"]> = Omit<
	Extract<WorkerRequest, { kind: K }>,
	"id"
>;

/** The good answer to each kind of request. */
type Answers = { load: LoadAnswer; draw: DrawAnswer };

export type Link = <K extends WorkerRequest["kind"]>(
	req: Body<K> & { kind: K },
	transfer?: Transferable[],
) => Promise<Answers[K]>;

type Waiting = {
	resolve: (a: Exclude<WorkerResponse, { ok: false }>) => void;
	reject: (e: Error) => void;
};

export function connect(worker: Worker): Link {
	const waiting = new Map<number, Waiting>();
	let dead: Error | null = null;
	let nextId = 1;
	worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
		const a = e.data;
		const w = waiting.get(a.id);
		waiting.delete(a.id);
		if (!w) return;
		if (a.ok) w.resolve(a);
		else w.reject(new Error(a.error));
	};
	const die = (text: string) => {
		dead = new Error(text);
		const all = [...waiting.values()];
		waiting.clear();
		for (const w of all) w.reject(dead);
	};
	worker.onerror = (e: ErrorEvent) => {
		die(`The worker failed: ${e.message || "unknown error"}`);
	};
	worker.onmessageerror = () => {
		die("The worker sent a message the page could not read");
	};
	return (req, transfer = []) => {
		if (dead) return Promise.reject(dead);
		const id = nextId++;
		return new Promise((resolve, reject) => {
			// The worker answers a request of kind K with an answer of kind K, so this cast is the one
			// place that pairs them.
			waiting.set(id, { resolve, reject } as Waiting);
			worker.postMessage({ ...req, id }, transfer);
		});
	};
}
