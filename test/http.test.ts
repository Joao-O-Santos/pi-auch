import assert from "node:assert/strict";
import test from "node:test";
import { boundedFetch } from "../src/http.js";

const jsonHeaders = { "content-type": "application/json" };
const request = (response: Response) => async () => response;

test("parses JSON and HTML, including an empty body", async () => {
	assert.deepEqual(
		await boundedFetch(
			"https://example.test",
			{ expectedType: "json" },
			request(new Response('{"ok":true}', { headers: jsonHeaders })),
		),
		{ ok: true },
	);
	assert.equal(
		await boundedFetch(
			"https://example.test",
			{ expectedType: "html" },
			request(new Response("<p>ok</p>", { headers: { "content-type": "text/html" } })),
		),
		"<p>ok</p>",
	);
	assert.equal(
		await boundedFetch(
			"https://example.test",
			{ expectedType: "html" },
			request(new Response(null, { headers: { "content-type": "text/html" } })),
		),
		"",
	);
});

test("rejects declared and streaming oversized bodies", async () => {
	for (const response of [
		new Response("large", {
			headers: { ...jsonHeaders, "content-length": "99" },
		}),
		new Response('{"ok":true}', { headers: jsonHeaders }),
	]) {
		await assert.rejects(
			boundedFetch(
				"https://example.test",
				{ expectedType: "json", maxBytes: 4 },
				request(response),
			),
			/too large/,
		);
	}
});

test("rejects provider errors, bad content types, and invalid JSON", async () => {
	for (const [options, response, error] of [
		[{ expectedType: "json" }, new Response("", { status: 500 }), /HTTP 500/],
		[
			{ expectedType: "json" },
			new Response("x", { headers: { "content-type": "text/plain" } }),
			/response type/,
		],
		[{ expectedType: "html" }, new Response("x", { headers: jsonHeaders }), /response type/],
		[{ expectedType: "json" }, new Response("{", { headers: jsonHeaders }), /invalid JSON/],
	] as const) {
		await assert.rejects(boundedFetch("https://example.test", options, request(response)), error);
	}
});

test("allows bounded same-origin HTTPS redirects", async () => {
	const urls: string[] = [];
	const value = await boundedFetch(
		"https://example.test/a",
		{ expectedType: "html", allowSameOriginRedirects: true },
		async (input) => {
			urls.push(String(input));
			return urls.length === 1
				? new Response(null, { status: 302, headers: { location: "/b" } })
				: new Response("ok", { headers: { "content-type": "text/html" } });
		},
	);
	assert.equal(value, "ok");
	assert.deepEqual(urls, ["https://example.test/a", "https://example.test/b"]);
});

test("rejects disabled, malformed, unsafe, and excessive redirects", async () => {
	for (const [options, location, error] of [
		[{ expectedType: "html" }, "/next", /unexpected redirect/],
		[{ expectedType: "html", allowSameOriginRedirects: true }, "", /unexpected redirect/],
		[
			{ expectedType: "html", allowSameOriginRedirects: true },
			"http://example.test/next",
			/unsafe redirect/,
		],
		[
			{ expectedType: "html", allowSameOriginRedirects: true },
			"https://evil.test/next",
			/unsafe redirect/,
		],
	] as const) {
		await assert.rejects(
			boundedFetch(
				"https://example.test",
				options,
				request(
					new Response(null, {
						status: 302,
						headers: location ? { location } : {},
					}),
				),
			),
			error,
		);
	}
	await assert.rejects(
		boundedFetch(
			"https://example.test",
			{ expectedType: "html", allowSameOriginRedirects: true },
			request(new Response(null, { status: 302, headers: { location: "/again" } })),
		),
		/unexpected redirect/,
	);
});

test("sanitizes network failures and enforces deadline and caller cancellation", async () => {
	await assert.rejects(
		boundedFetch("https://example.test", { expectedType: "json" }, async () => {
			throw new Error("secret");
		}),
		/network request failed/,
	);
	await assert.rejects(
		boundedFetch(
			"https://example.test",
			{ expectedType: "json", timeoutMs: 5 },
			(_url, init) =>
				new Promise<Response>((_resolve, reject) =>
					init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
						once: true,
					}),
				),
		),
		/timed out or was cancelled/,
	);
	const controller = new AbortController();
	controller.abort();
	await assert.rejects(
		boundedFetch(
			"https://example.test",
			{ expectedType: "json", signal: controller.signal },
			async () => {
				throw new Error("aborted");
			},
		),
		/timed out or was cancelled/,
	);
});
