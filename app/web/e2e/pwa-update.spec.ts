// A changed worker waits, the page offers it in a toast, and Reload makes it the controller.
// A small proxy (port 0) fronts the built app and, once told, adds a comment line to /sw.js, so the
// browser sees a new worker. (Playwright cannot route the worker script itself.)
// Run with `PREVIEW=1` (the built app with the Cloudflare headers).
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "./studio";

test.use({ serviceWorkers: "allow" });

test("update_toast", async ({ studio, page, baseURL }) => {
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
		await expect(page.getByTestId("update-toast")).toHaveCount(0);

		changed = true;
		await page.evaluate(() => {
			(window as unknown as { __old: boolean }).__old = true;
		});
		await page.evaluate(async () => {
			const reg = await navigator.serviceWorker.getRegistration();
			await reg?.update();
		});

		const toast = page.getByTestId("update-toast");
		await expect(toast).toContainText("A new version is ready");
		await toast.getByRole("button", { name: "Reload" }).click();

		// the new worker takes over and the page reloads once
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
		await expect(page.getByTestId("update-toast")).toHaveCount(0);
	} finally {
		proxy.close();
	}
});
