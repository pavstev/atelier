// Tests for the PWA state reducer: update prompt, install prompt and the iOS tip.
import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldReload } from "./register.ts";
import { pwaReducer, START } from "./state.ts";

test("waiting sets needRefresh", () => {
	assert.deepEqual(pwaReducer(START, { type: "waiting" }), {
		...START,
		needRefresh: true,
	});
});

test("test_dismiss: dismiss clears needRefresh", () => {
	const s = pwaReducer(START, { type: "waiting" });
	assert.equal(pwaReducer(s, { type: "dismiss" }).needRefresh, false);
});

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

test("shouldReload: not on a first visit, once on an update", () => {
	assert.equal(shouldReload(false, false), false);
	assert.equal(shouldReload(true, false), true);
	assert.equal(shouldReload(true, true), false);
});
