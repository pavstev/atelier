// Takes photos that the OS hands to the app: the launch queue (Open with on desktop) and the share
// cache (Share on Android, filled by the worker on POST /share). Each batch goes to `add`.
const SHARE_CACHE = "atelier-share";

/** What the real adder is called with (T8 wraps addPhotos into this). */
export type AddFiles = (files: File[]) => void;

type Handle = { getFile: () => Promise<File> };

type ShareCache = {
	keys: () => Promise<readonly Request[]>;
	match: (r: Request) => Promise<Response | undefined>;
	delete: (r: Request) => Promise<boolean>;
};

/** The parts of `window` the intake uses, so a test can fake them. */
export type IntakeWindow = {
	launchQueue?: {
		setConsumer: (c: (p: { files: readonly Handle[] }) => void) => void;
	};
	location: { search: string; pathname: string };
	history: { replaceState: (s: unknown, t: string, url: string) => void };
	caches?: { open: (name: string) => Promise<ShareCache> };
};

const EXT: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
	"image/heic": "heic",
};

async function takeShared(win: IntakeWindow, add: AddFiles) {
	win.history.replaceState(null, "", win.location.pathname);
	if (!win.caches) return;
	const cache = await win.caches.open(SHARE_CACHE);
	const reqs = [...(await cache.keys())];
	const files: File[] = [];
	for (const [i, req] of reqs.entries()) {
		const res = await cache.match(req);
		if (!res) continue;
		const blob = await res.blob();
		const ext = EXT[blob.type] ?? "jpg";
		files.push(new File([blob], `shared-${i + 1}.${ext}`, { type: blob.type }));
	}
	for (const req of reqs) await cache.delete(req);
	if (files.length) add(files);
}

/** Starts listening for launched and shared photos. */
export function startIntake(win: IntakeWindow, add: AddFiles): void {
	win.launchQueue?.setConsumer(async (p) => {
		const files = await Promise.all(p.files.map((h) => h.getFile()));
		if (files.length) add(files);
	});
	if (new URLSearchParams(win.location.search).has("shared")) {
		void takeShared(win, add).catch(() => {});
	}
}
