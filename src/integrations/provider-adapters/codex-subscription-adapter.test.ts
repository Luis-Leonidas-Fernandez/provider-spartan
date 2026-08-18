import { afterEach, describe, expect, it, vi } from "vitest";
import { CodexSubscriptionAdapter } from "./codex-subscription-adapter.js";

describe("CodexSubscriptionAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps chat completions into Codex responses payload", async () => {
    const streamPayload = [
      "event: response.output_text.delta",
      "data: {\"type\":\"response.output_text.delta\",\"delta\":\"hola desde codex\"}",
      "",
      "event: response.completed",
      "data: {\"type\":\"response.completed\",\"response\":{\"id\":\"resp_123\",\"model\":\"gpt-5.5\",\"output_text\":\"hola desde codex\",\"usage\":{\"input_tokens\":12,\"output_tokens\":5,\"total_tokens\":17,\"input_tokens_details\":{\"cached_tokens\":3}}}}",
      "",
    ].join("\n");
    const fetchMock = vi.fn().mockResolvedValue(new Response(streamPayload, {
      status: 200,
      headers: { "content-type": "text/event-stream", "x-request-id": "req_123" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new CodexSubscriptionAdapter();
    const response = await adapter.chatCompletion({
      model: "gpt-5",
      messages: [
        { role: "system", content: "respondé corto" },
        { role: "user", content: "decí hola" },
      ],
    }, {
      providerId: "provider-1",
      providerType: "codex_subscription",
      providerName: "Codex",
      baseUrl: null,
      credentialValue: "token-123",
      credentialMetadata: { workspaceId: "ws_123" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://chatgpt.com/backend-api/codex/responses");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer token-123");
    expect((init.headers as Record<string, string>)["chatgpt-account-id"]).toBe("ws_123");
    expect(JSON.parse(String(init.body))).toEqual({
      model: "gpt-5",
      stream: true,
      store: false,
      input: [
        { role: "developer", content: [{ type: "input_text", text: "respondé corto" }] },
        { role: "user", content: [{ type: "input_text", text: "decí hola" }] },
      ],
    });
    expect(response.ok).toBe(true);
    expect(response.model).toBe("gpt-5.5");
    expect(response.content).toBe("hola desde codex");
    expect(response.usage).toEqual({
      promptTokens: 12,
      completionTokens: 5,
      totalTokens: 17,
      cachedInputTokens: 3,
    });
  });

  it("maps image generations into Codex image_generation tool payload", async () => {
    const responsePayload = {
      id: "resp_img_123",
      model: "gpt-image-1",
      output: [
        { type: "image_generation_call", result: "base64-image" },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: { "content-type": "application/json", "x-request-id": "req_img_123" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new CodexSubscriptionAdapter();
    const response = await adapter.imageGeneration!({
      model: "gpt-image-1",
      prompt: "imagen editorial",
      size: "1024x1024",
      response_format: "b64_json",
    }, {
      providerId: "provider-1",
      providerType: "codex_subscription",
      providerName: "Codex",
      baseUrl: null,
      credentialValue: "token-123",
      credentialMetadata: { workspaceId: "ws_123" },
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://chatgpt.com/backend-api/codex/responses");
    expect(JSON.parse(String(init.body))).toEqual({
      model: "gpt-image-1",
      stream: true,
      store: false,
      input: [
        { role: "user", content: [{ type: "input_text", text: "imagen editorial" }] },
      ],
      tools: [{ type: "image_generation", size: "1024x1024" }],
      tool_choice: "required",
    });
    expect(response.ok).toBe(true);
    expect(response.data).toEqual([{ b64_json: "base64-image" }]);
  });

  it("declares the parameters that the Codex image tool actually supports", () => {
    const adapter = new CodexSubscriptionAdapter();
    expect(adapter.imageGenerationCapabilities).toEqual({
      maxImages: 1,
      supportsSize: true,
      supportsQuality: true,
      supportedResponseFormats: ["b64_json"],
    });
  });

  it("rejects empty Codex image results", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "resp_empty",
      model: "gpt-5.5",
      output: [
        { type: "image_generation_call", result: "" },
        { type: "message", content: [{ b64_json: "  " }, { url: "" }] },
      ],
    }), { status: 200, headers: { "content-type": "application/json" } })));

    const response = await new CodexSubscriptionAdapter().imageGeneration!({
      model: "gpt-5.5",
      prompt: "imagen",
    }, {
      providerId: "provider-1",
      providerType: "codex_subscription",
      providerName: "Codex",
      baseUrl: null,
      credentialValue: "token",
    });

    expect(response.ok).toBe(false);
    expect(response.data).toEqual([]);
    expect(response.error).toContain("did not include image data");
  });

  it("cancels Codex image generation when the client aborts", async () => {
    vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason ?? new DOMException("Aborted", "AbortError")), { once: true });
    })));
    const controller = new AbortController();
    const request = new CodexSubscriptionAdapter().imageGeneration!({
      model: "gpt-5.5",
      prompt: "imagen",
    }, {
      providerId: "provider-1",
      providerType: "codex_subscription",
      providerName: "Codex",
      baseUrl: null,
      credentialValue: "token",
      signal: controller.signal,
    });

    controller.abort(new Error("Client disconnected"));

    await expect(request).rejects.toMatchObject({
      code: "process_cancelled",
      statusCode: 502,
    });
  });

});
