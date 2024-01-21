export interface Env {
	RESIZER_URL: string
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
		const requestUrl = new URL(request.url)

		// Construct the cache key from the cache URL
		const cacheKey = new Request(requestUrl.toString(), request)
		// const cache = caches.default
		const cache = await caches.open("resizer")

		// Check whether the value is already available in the cache
		// if not, you will need to fetch it from origin, and store it in the cache
		console.log({ cache })
		let response = await cache.match(cacheKey)

		if (!response) {
			console.log(
				`Response for request url: ${request.url} not present in cache. Fetching and caching request.`
			)

			const resizerUrl = env.RESIZER_URL
			// If not in cache, get it from origin
			response = await fetch(
				`${resizerUrl}${requestUrl.pathname}${requestUrl.search}`,
				{
					method: "GET",
					body: request.body,
				}
			)

			if (response.status == 200) {
				// Must use Response constructor to inherit all of response's fields
				response = new Response(response.body, response)

				// Cache API respects Cache-Control headers. Setting s-max-age to 10
				// will limit the response to be in cache for 10 seconds max

				// Any changes made to the response here will be reflected in the cached value
				response.headers.append("Cache-Control", "s-maxage=604800")

				ctx.waitUntil(cache.put(cacheKey, response.clone()))
			}
		} else {
			console.log(`Cache hit for: ${request.url}.`)
		}
		return response
	},
}

export default handler
