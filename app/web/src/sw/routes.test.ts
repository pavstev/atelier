// Unit tests of `routeOf`: which way the service worker answers a request.
import assert from "node:assert/strict";
import { test } from "node:test";
import { routeOf } from "./routes.ts";

const o = "https://a.b";

test("precache hit", () => {
	assert.equal(
		routeOf("GET", `${o}/assets/x.js`, "cors", o, ["/assets/x.js"]),
		"precache",
	);
});
test("test_query", () => {
	assert.equal(
		routeOf("GET", `${o}/assets/x.js?v=1`, "cors", o, ["/assets/x.js"]),
		"precache",
	);
});
test("navigate gives shell", () => {
	assert.equal(
		routeOf("GET", `${o}/studio?x=1`, "navigate", o, ["/"]),
		"shell",
	);
});
test("a POST to /share is not the worker's", () => {
	assert.equal(routeOf("POST", `${o}/share`, "navigate", o, []), "pass");
});
test("test_cross_origin", () => {
	assert.equal(
		routeOf("GET", "https://c.d/assets/x.js", "cors", o, ["/assets/x.js"]),
		"pass",
	);
});
test("test_post_other", () => {
	assert.equal(routeOf("POST", `${o}/api`, "cors", o, []), "pass");
});
test("navigate to a file passes", () => {
	assert.equal(
		routeOf("GET", `${o}/version.txt`, "navigate", o, ["/"]),
		"pass",
	);
	assert.equal(routeOf("GET", `${o}/og.png`, "navigate", o, ["/"]), "pass");
	assert.equal(routeOf("GET", `${o}/sw.js`, "navigate", o, ["/"]), "pass");
	assert.equal(routeOf("GET", `${o}/studio`, "navigate", o, ["/"]), "shell");
});
test("unlisted non-navigate GET passes", () => {
	assert.equal(routeOf("GET", `${o}/other.png`, "cors", o, ["/"]), "pass");
});
