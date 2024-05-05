export interface Env {
	RESIZER_URL: string
	RESIZER_TOKEN: string
}
export interface Caches {
	default: {
		put(request: Request | string, response: Response): Promise<undefined>
		match(request: Request | string): Promise<Response | undefined>
	}
	open: (cacheName: string) => Promise<Cache>
}

declare let caches: Caches

const handler: ExportedHandler<Env> = {
	async fetch(request, env, ctx) {
		const url = new URL(request.url)
		console.log({ url })

		if (url.pathname === "" || url.pathname === "/") {
			return new Response("hello from server")
		}

		const filename = url.pathname.split("/").pop()
		if (filename === "favicon.ico") {
			return new Response("favicon not found", { status: 404 })
		}

		// Construct the cache key from the cache URL
		const cacheKey = new URL(url)
		cacheKey.hostname = "cache.cdn.com"
		const cache = caches.default
		// const cache = await caches.open("resizer")

		// Check whether the value is already available in the cache
		// if not, you will need to fetch it from origin, and store it in the cache
		let response = await cache.match(cacheKey.href)

		if (!response) {
			console.log(
				`Response for request url: ${request.url} not present in cache. Fetching and caching request.`
			)

			const newUrl = new URL(env.RESIZER_URL)
			newUrl.pathname = url.pathname
			newUrl.search = url.search

			const resizerToken = env.RESIZER_TOKEN
			let headers = {}
			if (resizerToken) {
				headers = {
					Authorization: `Bearer ${resizerToken}`,
				}
			}

			// If not in cache, get it from origin
			response = await fetch(newUrl.href, {
				headers
			})

			if (response.ok) {
				const res = new Response(response.body, response)
				res.headers.set("Cache-Control", "public, max-age=604800, immutable")
				res.headers.set(
					"Content-Type",
					response.headers.get("Content-Type") || "application/octet-stream"
				)
				res.headers.set("Content-Disposition", "inline")

				ctx.waitUntil(cache.put(cacheKey.href, res.clone()))
				response = res
			} else {
				response = new Response(response.body, { status: response.status })
			}
		} else {
			console.log(`Cache hit for: ${request.url}.`)
		}
		return response
	},
}

export default handler
