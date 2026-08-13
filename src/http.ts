const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 512 * 1024;

export interface BoundedFetchOptions extends RequestInit {
	timeoutMs?: number;
	maxBytes?: number;
	expectedType: "json" | "html";
	allowSameOriginRedirects?: boolean;
}

export async function boundedFetch(
	url: string,
	options: BoundedFetchOptions,
	fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
	const {
		timeoutMs = DEFAULT_TIMEOUT_MS,
		maxBytes = DEFAULT_MAX_BYTES,
		expectedType,
		allowSameOriginRedirects = false,
		...init
	} = options;
	const timeout = AbortSignal.timeout(timeoutMs);
	const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
	const originalOrigin = new URL(url).origin;
	let currentUrl = url;

	for (let redirects = 0; redirects <= 2; redirects++) {
		let response: Response;
		try {
			response = await fetchImpl(currentUrl, {
				...init,
				signal,
				redirect: "manual",
			});
		} catch {
			if (signal.aborted) throw new Error("request timed out or was cancelled");
			throw new Error("network request failed");
		}

		if (response.status >= 300 && response.status < 400) {
			const location = response.headers.get("location");
			if (!allowSameOriginRedirects || !location || redirects === 2) {
				throw new Error("unexpected redirect");
			}
			const next = new URL(location, currentUrl);
			if (next.protocol !== "https:" || next.origin !== originalOrigin) {
				throw new Error("unsafe redirect blocked");
			}
			currentUrl = next.href;
			continue;
		}

		if (!response.ok) throw new Error(`provider returned HTTP ${response.status}`);
		const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
		if (expectedType === "json" && !contentType.includes("json"))
			throw new Error("unexpected response type");
		if (expectedType === "html" && !contentType.includes("html"))
			throw new Error("unexpected response type");
		const body = await readLimitedBody(response, maxBytes);
		if (expectedType === "html") return body;
		try {
			return JSON.parse(body) as unknown;
		} catch {
			throw new Error("invalid JSON response");
		}
	}
	throw new Error("too many redirects");
}

async function readLimitedBody(response: Response, maxBytes: number): Promise<string> {
	const declared = Number(response.headers.get("content-length"));
	if (Number.isFinite(declared) && declared > maxBytes) throw new Error("response too large");
	if (!response.body) return "";

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let bytes = 0;
	let output = "";
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			bytes += value.byteLength;
			if (bytes > maxBytes) throw new Error("response too large");
			output += decoder.decode(value, { stream: true });
		}
		return output + decoder.decode();
	} finally {
		await reader.cancel();
	}
}
