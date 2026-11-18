// The Cloudflare Worker in front of the static files. It runs only for POST /share (see
// `run_worker_first` in wrangler.jsonc). A share normally reaches the service worker, which keeps the
// photos for the page. Before the service worker runs (a share before the app ever opened, or after
// the site data was cleared) Cloudflare's static files would answer 405. This sends the user to the
// app instead. The photos of such a share are not read or kept here: nothing leaves the device.

type Assets = { fetch: (request: Request) => Promise<Response> };

/** Where a request goes: "share" for a POST /share, else the static files. */
export function routeOf(method: string, pathname: string): "share" | "assets" {
	return method === "POST" && pathname === "/share" ? "share" : "assets";
}

export default {
	fetch(request: Request, env: { ASSETS: Assets }): Promise<Response> {
		const url = new URL(request.url);
		if (routeOf(request.method, url.pathname) === "share")
			return Promise.resolve(
				Response.redirect(new URL("/?shared=0", url).href, 303),
			);
		return env.ASSETS.fetch(request);
	},
};
