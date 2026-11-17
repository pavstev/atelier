// A changed worker takes over by itself and the page reloads once. No toast, no click.
// A small proxy (port 0) fronts the built app and, once told, adds a comment line to /sw.js, so the
// browser sees a new worker. (Playwright cannot route the worker script itself.)
// Run with `PREVIEW=1` (the built app with the Cloudflare headers).
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "./studio";

test.use({ serviceWorkers: "allow" });

test("update_auto", async ({ studio, page, baseURL }) => {
	void studio;
	test.skip(process.env.PREVIEW !== "1", "needs the built app (PREVIEW=1)");
	let changed = false;
	const upstream = new URL(baseURL as string).origin;
	const proxy = createServer(async (req, res) => {
		try {
			const up = await fetch(upstream + (req.url ?? "/"), {
				headers: { "cache-control": "no-cache" },
			});
			let body = Buffer.from(await up.arrayBuffer());
			if (changed && req.url?.startsWith("/sw.js")) {
				body = Buffer.concat([body, Buffer.from("\n// changed\n")]);
			}
			const headers: Record<string, string> = {};
			up.headers.forEach((v, k) => {
				if (
					!["content-encoding", "content-length", "transfer-encoding"].includes(
						k,
					)
				)
					headers[k] = v;
			});
			res.writeHead(up.status, headers);
			res.end(body);
		} catch {
			res.writeHead(502);
			res.end();
		}
	});
	await new Promise<void>((ok) => proxy.listen(0, "127.0.0.1", ok));
	try {
		const origin = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
		await page.goto(`${origin}/`);
		await expect
			.poll(() =>
				page
					.evaluate(() => !!navigator.serviceWorker.controller)
					.catch(() => false),
			)
			.toBe(true);

		changed = true;
		await page.evaluate(() => {
			(window as unknown as { __old: boolean }).__old = true;
		});
		// the page looks for a new version when the tab shows again
		await page.evaluate(() => {
			document.dispatchEvent(new Event("visibilitychange"));
		});

		// the new worker takes over by itself and the page reloads once
		await expect
			.poll(
				() =>
					page
						.evaluate(
							() =>
								!(window as unknown as { __old?: boolean }).__old &&
								!!navigator.serviceWorker.controller,
						)
						.catch(() => false),
				{ timeout: 30_000 },
			)
			.toBe(true);
	} finally {
		proxy.close();
	}
});
