// The Cloudflare Worker: a POST /share with no service worker goes to the app, everything else to the
// static files.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import worker, { routeOf } from "./worker.ts";

test("test_only_post_share_is_ours", () => {
	assert.equal(routeOf("POST", "/share"), "share");
	assert.equal(routeOf("GET", "/share"), "assets");
	assert.equal(routeOf("POST", "/"), "assets");
	assert.equal(routeOf("POST", "/share/x"), "assets");
});

test("test_wrangler_runs_the_worker_first_only_for_share", () => {
	// The Worker answers only what `run_worker_first` sends it. A change to one without the other
	// breaks the share silently.
	const text = readFileSync(
		new URL("../../../../wrangler.jsonc", import.meta.url),
		"utf8",
	)
		.split("\n")
		.filter((line) => !line.trim().startsWith("//"))
		.join("\n")
		.replace(/,(\s*[}\]])/g, "$1");
	const config = JSON.parse(text);
	assert.deepEqual(config.assets.run_worker_first, ["/share"]);
	assert.equal(config.main, "app/web/src/edge/worker.ts");
});

test("test_a_share_redirects_to_the_app_with_303", async () => {
	let passed = 0;
	const env = {
		ASSETS: {
			fetch: async () => {
				passed++;
				return new Response("asset");
			},
		},
	};
	const r = await worker.fetch(
		new Request("https://atelier.example/share", { method: "POST" }),
		env,
	);
	assert.equal(r.status, 303);
	assert.equal(r.headers.get("location"), "https://atelier.example/?shared=0");
	assert.equal(passed, 0);
	const a = await worker.fetch(new Request("https://atelier.example/"), env);
	assert.equal(await a.text(), "asset");
	assert.equal(passed, 1);
});
