import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAIAdapter } from "./openai-adapter.js";

describe("OpenAIAdapter image generation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the compatible transport but omits the legacy response_format field", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ b64_json: "image" }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new OpenAIAdapter();
    await adapter.imageGeneration({
      model: "gpt-image-2",
      prompt: "Un astronauta tomando mate",
      n: 1,
      size: "1024x1024",
      quality: "high",
      response_format: "b64_json",
    }, {
      providerId: "openai-1",
      providerType: "openai",
      providerName: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      credentialValue: "secret",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/images/generations");
    expect(JSON.parse(String(init.body))).toEqual({
      model: "gpt-image-2",
      prompt: "Un astronauta tomando mate",
      n: 1,
      size: "1024x1024",
      quality: "high",
    });
    expect(adapter.imageGenerationCapabilities.supportedResponseFormats).toEqual(["b64_json"]);
  });
});
