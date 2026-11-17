// Unit tests of the precache list and the cache version.
import assert from "node:assert/strict";
import { test } from "node:test";
import { precacheList, versionOf } from "./precache.ts";

test("list drops og, headers and keeps the rest sorted", () => {
	assert.deepEqual(
		precacheList([
			"index.html",
			"assets/i-a1.js",
			"assets/c-b2.wasm",
			"og.png",
			"_headers",
			"favicon.svg",
		]),
		["/", "/assets/c-b2.wasm", "/assets/i-a1.js", "/favicon.svg"],
	);
});
test("list drops sw.js and other og files", () => {
	assert.deepEqual(
		precacheList(["sw.js", "og-square.png", "manifest.webmanifest"]),
		["/manifest.webmanifest"],
	);
});
test("list drops maps", () => {
	assert.deepEqual(precacheList(["assets/a.js.map", "assets/a.js"]), [
		"/assets/a.js",
	]);
});
test("test_dedup", () => {
	assert.deepEqual(precacheList(["index.html", "index.html"]), ["/"]);
});
test("test_version_bytes", () => {
	const a = versionOf([["/a", new Uint8Array([1, 2, 3])]]);
	const b = versionOf([["/a", new Uint8Array([1, 2, 4])]]);
	assert.match(a, /^[0-9a-f]{12}$/);
	assert.match(b, /^[0-9a-f]{12}$/);
	assert.notEqual(a, b);
});
test("version ignores entry order", () => {
	const x: [string, Uint8Array] = ["/a", new Uint8Array([1])];
	const y: [string, Uint8Array] = ["/b", new Uint8Array([2])];
	assert.equal(versionOf([x, y]), versionOf([y, x]));
});
