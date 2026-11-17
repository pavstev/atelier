// Asks the browser to keep the photo store from being cleared. Call it after the first added photo
// (Firefox prompts, and the prompt must follow a user act).
export async function askPersist(nav: Navigator): Promise<boolean> {
	const s = nav.storage;
	if (!s?.persist) return false;
	try {
		if (await s.persisted()) return true;
		return await s.persist();
	} catch {
		return false;
	}
}
