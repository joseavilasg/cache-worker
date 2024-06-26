import { type Context, Hono } from "hono"
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

async function cacheResponse(ctx: ExecutionContext, url: string, extension: string, headers: Record<string, string>) {
	const cacheKey = new URL(url)
	cacheKey.hostname = "cache.cdn.com"
	const cache = caches.default
	let response = await cache.match(cacheKey.href + extension)
	if (!response) {
		response = await fetch(url, { headers })
		if (response.ok) {
			const res = new Response(response.body, {
				headers: {
					"Cache-Control": "public, max-age=604800, immutable",
					"Content-Type":
						response.headers.get("Content-Type") || "application/octet-stream",
					"Content-Disposition": "inline",
				},
			})
			ctx.waitUntil(cache.put(cacheKey.href + extension, res.clone()))
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
		const { mimeType = "", ...rest } = params
		const newUrl = new URL("https://example.com");
		const parts = url.pathname.split("/")
		if (parts.length > 1 && parts[1].includes("http")) {
			parts.shift()
			parts.shift()
		}
		newUrl.host = parts[1]
		newUrl.pathname = parts.slice(2).join("/")
		for (const [key, value] of Object.entries(rest)) {
			newUrl.searchParams.set(key, value)
		}

		let mediaType = mime.getType(filename!) || ""
		let extension = ""
		if (!mediaType && mimeType) {
			const ext = mime.getExtension(mimeType)
			if (ext) {
				extension = "." + ext
			} else {
				extension = ".zip"
			}
		}
		let headers = Object.fromEntries(ctx.req.raw.headers.entries())
		if (mediaType.startsWith("image")) {
			const oldHost = newUrl.host
			newUrl.host = ctx.env.RESIZER_HOST
			newUrl.pathname = `${oldHost}${newUrl.pathname}`
			const resizerToken = ctx.env.RESIZER_TOKEN
			if (resizerToken) {
				headers = {
					...headers,
					Authorization: `Bearer ${resizerToken}`,
					"Content-Type": mediaType,
				}
			}
		}
		newUrl.searchParams.sort()
		const response = await cacheResponse(ctx.executionCtx, newUrl.href, extension, headers)
		return new Response(response.body, response)
	}
}

const app = new Hono({ strict: false })
app.get("*", async (c) => {
	const url = new URL(c.req.url)
	const params = Object.fromEntries(url.searchParams.entries())
	const response = await AssetService.getAsset(c, params)
	return response
})

export default app