import { type Context } from "hono"
import { HTTPException } from "hono/http-exception"
import mime from "mime"

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

async function cacheResponse(ctx: ExecutionContext, url: string) {
	const cacheKey = new URL(url)
	cacheKey.hostname = "cache.cdn.com"
	const cache = caches.default
	let response = await cache.match(cacheKey.href)
	if (!response) {
		response = await fetch(url)
		if (response.ok) {
			const res = new Response(response.body, {
				headers: {
					"Cache-Control": "public, max-age=604800, immutable",
					"Content-Type":
						response.headers.get("Content-Type") || "application/octet-stream",
					"Content-Disposition": "inline",
				},
			})
			ctx.waitUntil(cache.put(cacheKey.href, res.clone()))
			response = res
		} else {
			response = new Response(response.body, { status: response.status })
		}
	}

	return response
}

export class AssetService {
	public static async getAsset(
		ctx: Context,
		params: Record<string, string>
	): Promise<Response> {
		const url = new URL(ctx.req.url)

		if (url.pathname === "" || url.pathname === "/") {
			return new Response("hello from server")
		}
		const filename = url.pathname.split("/").pop()
		if (filename === "favicon.ico") {
			throw new HTTPException(404, {})
		}
		const { type, ...rest } = params

		const newUrl = new URL(ctx.env.RESIZER_URL)
		const parts = url.pathname.split("/")
		newUrl.host = parts[1]
		newUrl.pathname = parts.slice(2).join("/")
		for (const [key, value] of Object.entries(rest)) {
			newUrl.searchParams.set(key, value)
		}

		let mediaType = mime.getType(filename!) || ""

		if (mediaType.startsWith("image") || type === "image") {
			const oldHost = newUrl.host
			newUrl.host = ctx.env.RESIZER_HOST
			newUrl.pathname = `${oldHost}${newUrl.pathname}`
		}
		newUrl.searchParams.sort()
		const response = await cacheResponse(ctx.executionCtx, newUrl.href)
		return new Response(response.body, response)
	}
}
