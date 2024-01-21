export interface Env {
	RESIZER_URL: string
}

const handler: ExportedHandler<Env> = {
	async fetch(request, env, ctx) {
		const url = new URL(request.url)
		const resizerUrl = env.RESIZER_URL
		// Only use the path for the cache key, removing query strings
		// and always store using HTTPS, for example, https://www.example.com/file-uri-here
		const cacheKey = `https://${resizerUrl}${url.pathname}${url.search}`
		let response = await fetch(`${resizerUrl}${url.pathname}${url.search}`, {
			cf: {
				// Always cache this fetch regardless of content type
				// for a max of 604800 seconds (1 week) before revalidating the resource
				cacheTtl: 604800,
				cacheEverything: true,
				//Enterprise only feature, see Cache API for other plans
				cacheKey,
			},
		})
		// Reconstruct the Response object to make its headers mutable.
		response = new Response(response.body, response)
		// Set cache control headers to cache on browser for 25 minutes
		response.headers.set("Cache-Control", "public, max-age=1500, s-maxage=1500")
		return response
	},
}

export default handler
