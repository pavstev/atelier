// Tests for the PWA state reducer (install prompt and the iOS tip) and the update checks.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CHECK_MS, shouldReload, watchForUpdates } from "./register.ts";
import { pwaReducer, START } from "./state.ts";

test("test_ios_tip: ios and not standalone shows the tip", () => {
	const s = pwaReducer(START, { type: "env", ios: true, standalone: false });
	assert.equal(s.showIosTip, true);
	assert.equal(s.ios, true);
});

test("standalone hides the iOS tip", () => {
	const s = pwaReducer(START, { type: "env", ios: true, standalone: true });
	assert.equal(s.showIosTip, false);
	assert.equal(s.standalone, true);
});

test("canInstall sets canInstall", () => {
	assert.equal(pwaReducer(START, { type: "canInstall" }).canInstall, true);
});

test("installed clears canInstall and sets standalone", () => {
	assert.deepEqual(
		pwaReducer({ ...START, canInstall: true }, { type: "installed" }),
		{ ...START, standalone: true },
	);
});

test("installDismissed only clears canInstall", () => {
	assert.deepEqual(
		pwaReducer({ ...START, canInstall: true }, { type: "installDismissed" }),
		{ ...START, canInstall: false },
	);
});

test("installed hides the iOS tip", () => {
	const s = pwaReducer(
		{ ...START, ios: true, showIosTip: true },
		{ type: "installed" },
	);
	assert.equal(s.showIosTip, false);
});

function fakes(visible: boolean) {
	let calls = 0;
	const reg = {
		update: () => {
			calls++;
			return Promise.resolve();
		},
	};
	const doc = {
		visibilityState: visible ? "visible" : "hidden",
		fire: () => {},
		addEventListener(_: string, f: () => void) {
			this.fire = f;
		},
	};
	let tick = () => {};
	let every = 0;
	const timer = (f: () => void, ms: number) => {
		tick = f;
		every = ms;
	};
	return {
		reg,
		doc,
		timer,
		calls: () => calls,
		tick: () => tick(),
		every: () => every,
	};
}

test("watchForUpdates: checks on open, every 30 minutes, and on return to the tab", () => {
	const f = fakes(false);
	watchForUpdates(f.reg, f.doc, f.timer);
	assert.equal(f.calls(), 1);
	assert.equal(f.every(), CHECK_MS);
	assert.equal(CHECK_MS, 30 * 60 * 1000);
	f.tick();
	assert.equal(f.calls(), 2);
	f.doc.fire();
	assert.equal(f.calls(), 2); // hidden: no check
	f.doc.visibilityState = "visible";
	f.doc.fire();
	assert.equal(f.calls(), 3);
});

test("watchForUpdates: a failed check does not throw", async () => {
	const f = fakes(true);
	const reg = { update: () => Promise.reject(new Error("offline")) };
	assert.doesNotThrow(() => watchForUpdates(reg, f.doc, f.timer));
	await new Promise((r) => setTimeout(r, 0));
});

test("shouldReload: not on a first visit, once on an update", () => {
	assert.equal(shouldReload(false, false), false);
	assert.equal(shouldReload(true, false), true);
	assert.equal(shouldReload(true, true), false);
});
