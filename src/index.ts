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

type SaveResponseInCacheParams = {
	matchKey: string
	rangedMatchKey?: string
	url: string
	headers: Record<string, string>
	cache: Caches["default"]
	isRanged: boolean
}

type SaveResponseInCache = (
	ctx: ExecutionContext,
	params: SaveResponseInCacheParams,
) => Promise<Response>

async function cacheResponse(ctx: ExecutionContext, url: string, extension: string, headers: Record<string, string>) {
	const cacheKey = new URL(url);
	cacheKey.hostname = "cache.cdn.com";
	const cache = caches.default;

	const matchKey = cacheKey.href + extension;
	console.log({ matchKey });

	const isRanged = Boolean(headers.range);

	const wholeResponse = await cache.match(matchKey);
	if (wholeResponse) {
		console.log("whole cache hit");
		return await getRangedResponse(headers, wholeResponse);
	}

	if (isRanged) {
		const rangedMatchKey = `${cacheKey.href}/range/${headers.range}${extension}`;
		console.log({ rangedMatchKey });

		const rangedResponse = await cache.match(rangedMatchKey);
		if (rangedResponse) {
			console.log("ranged cache hit");
			return rangedResponse;
		}
		console.log("ranged response not found");

		return await saveResponseInCache(ctx, {
			isRanged,
			matchKey,
			rangedMatchKey,
			url,
			headers,
			cache,
		});
	}

	console.log("whole response not found");
	return await saveResponseInCache(ctx, {
		isRanged,
		matchKey,
		url,
		headers,
		cache,
	});
}

const saveResponseInCache: SaveResponseInCache = async (
	ctx,
	{
		cache,
		matchKey,
		rangedMatchKey = "",
		url,
		headers,
		isRanged,
	}
) => {
	if (!isRanged) {
		const wholeResponse = await cache.match(matchKey);
		if (wholeResponse) {
			console.log("cache hit while trying to download");
			return await getRangedResponse(headers, wholeResponse);
		}

		console.log("downloading whole response");
	}

	let response: Response;
	try {
		response = await fetch(url, { headers });
		if (response.ok) {
			const res = new Response(response.body, {
				headers: {
					"Cache-Control": "public, max-age=604800, immutable",
					"Content-Type": response.headers.get("Content-Type") || "application/octet-stream",
					"Content-Disposition": "inline",
				},
			});
			ctx.waitUntil(cache.put(isRanged ? rangedMatchKey : matchKey, res.clone()));
			response = res;
			console.log("cache saved");
		} else {
			response = new Response(response.body, { status: response.status });
		}
	} catch (error) {
		console.error("Error fetching the response:", error);
		throw error;
	}

	return response;
};

const getRangedResponse = async (headers: Record<string, string>, response: Response) => {
	if (headers.range) {
		const rangeHeader = headers.range;
		const rangeMatch = rangeHeader.match(/bytes=(\d+)-(\d+)?/);
		if (rangeMatch) {
			const start = parseInt(rangeMatch[1], 10);
			const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : undefined;

			// Convert ReadableStream to ArrayBuffer
			const reader = response?.body?.getReader();
			const chunks = [];
			let receivedLength = 0;

			while (true) {
				const { done, value } = await reader!.read();
				if (done) break;
				chunks.push(value);
				receivedLength += value.length;
			}

			const arrayBuffer = new Uint8Array(receivedLength);
			let position = 0;
			for (const chunk of chunks) {
				arrayBuffer.set(chunk, position);
				position += chunk.length;
			}

			const finalEnd = end !== undefined ? end : receivedLength - 1;
			const chunk = arrayBuffer.slice(start, finalEnd + 1);

			const partialResponse = new Response(chunk, {
				status: 206,
				statusText: 'Partial Content',
				headers: {
					'Content-Range': `bytes ${start}-${finalEnd}/${receivedLength}`,
					'Content-Length': chunk.length.toString(),
					'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
				},
			});
			return partialResponse;
		}
	}

	return response;
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
			newUrl.port = ''
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