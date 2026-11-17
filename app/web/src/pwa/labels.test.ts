// Tests for the install button label.
import assert from "node:assert/strict";
import { test } from "node:test";
import { installLabel } from "./labels.ts";
import { START } from "./state.ts";

test("test_label_none: the start state gives none", () => {
	assert.equal(installLabel(START), "none");
});

test("test_label_standalone: standalone gives none", () => {
	assert.equal(
		installLabel({ ...START, standalone: true, canInstall: true }),
		"none",
	);
});

test("canInstall gives install", () => {
	assert.equal(installLabel({ ...START, canInstall: true }), "install");
});

test("showIosTip gives ios-tip", () => {
	assert.equal(installLabel({ ...START, showIosTip: true }), "ios-tip");
});
