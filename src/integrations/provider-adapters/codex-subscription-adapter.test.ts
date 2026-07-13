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
});
