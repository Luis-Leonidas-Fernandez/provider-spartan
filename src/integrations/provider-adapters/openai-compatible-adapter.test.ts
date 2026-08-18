import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAICompatibleAdapter } from "./openai-compatible-adapter.js";

describe("OpenAICompatibleAdapter imageGeneration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes OpenAI-compatible image generation requests through", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      created: 123,
      data: [{ b64_json: "base64-image", revised_prompt: "revised" }],
    }), {
      status: 200,
      headers: { "content-type": "application/json", "x-request-id": "req_img_1" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new OpenAICompatibleAdapter();
    const response = await adapter.imageGeneration!({
      model: "gpt-image-1",
      prompt: "imagen editorial",
      n: 2,
      size: "1024x1024",
      quality: "high",
      response_format: "b64_json",
    }, {
      providerId: "provider-1",
      providerType: "custom_openai_compatible",
      providerName: "OpenAI compatible",
      baseUrl: "https://provider.local/v1",
      credentialValue: "secret",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://provider.local/v1/images/generations");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer secret");
    expect(JSON.parse(String(init.body))).toEqual({
      model: "gpt-image-1",
      prompt: "imagen editorial",
      n: 2,
      size: "1024x1024",
      quality: "high",
      response_format: "b64_json",
    });
    expect(response.ok).toBe(true);
    expect(response.created).toBe(123);
    expect(response.data).toEqual([{ b64_json: "base64-image", revised_prompt: "revised" }]);
  });

  it("preserves provider-reported image usage without inventing missing values", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      created: 123,
      data: [{ url: "https://provider.local/image.png" }],
      usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 },
    }), { status: 200, headers: { "content-type": "application/json" } })));

    const response = await new OpenAICompatibleAdapter().imageGeneration!({
      model: "image-model",
      prompt: "imagen",
      response_format: "url",
    }, {
      providerId: "provider-1",
      providerType: "custom_openai_compatible",
      providerName: "Compatible",
      baseUrl: "https://provider.local/v1",
      credentialValue: null,
    });

    expect(response.usage).toEqual({
      promptTokens: 7,
      completionTokens: 3,
      totalTokens: 10,
      cachedInputTokens: 0,
    });
  });

  it("rejects empty image records instead of reporting a false success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{}, { url: "   " }, { b64_json: "" }],
    }), { status: 200, headers: { "content-type": "application/json" } })));

    const response = await new OpenAICompatibleAdapter().imageGeneration!({
      model: "image-model",
      prompt: "imagen",
    }, {
      providerId: "provider-1",
      providerType: "custom_openai_compatible",
      providerName: "Compatible",
      baseUrl: "https://provider.local/v1",
      credentialValue: null,
    });

    expect(response).toMatchObject({
      ok: false,
      status: "failed",
      data: [],
      error: "Provider returned no image data",
    });
  });

  it("cancels the upstream request when the client aborts", async () => {
    vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason ?? new DOMException("Aborted", "AbortError")), { once: true });
    })));
    const controller = new AbortController();
    const request = new OpenAICompatibleAdapter().imageGeneration!({
      model: "image-model",
      prompt: "imagen",
    }, {
      providerId: "provider-1",
      providerType: "custom_openai_compatible",
      providerName: "Compatible",
      baseUrl: "https://provider.local/v1",
      credentialValue: null,
      signal: controller.signal,
    });

    controller.abort(new Error("Client disconnected"));

    await expect(request).rejects.toMatchObject({
      code: "process_cancelled",
      statusCode: 502,
    });
  });

  it("distinguishes provider timeout from client cancellation", async () => {
    vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason ?? new DOMException("Aborted", "AbortError")), { once: true });
    })));

    const request = new OpenAICompatibleAdapter().imageGeneration!({
      model: "image-model",
      prompt: "imagen",
    }, {
      providerId: "provider-1",
      providerType: "custom_openai_compatible",
      providerName: "Compatible",
      baseUrl: "https://provider.local/v1",
      credentialValue: null,
      timeoutMs: 5,
    });

    await expect(request).rejects.toMatchObject({
      code: "gateway_timeout",
      statusCode: 504,
    });
  });
});
