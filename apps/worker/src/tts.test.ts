// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTtsApp, type TtsProvider, type TtsVoice } from "./tts";

const SECRET = "test-secret";
const FAKE_AUDIO = Buffer.from("fake-audio-bytes");

function createMockProvider(): TtsProvider {
  return {
    synthesize: vi.fn(),
    listVoices: vi.fn(),
  };
}

function app(provider: TtsProvider, synthesizeTimeoutMs = 8_000) {
  return createTtsApp({ provider }, { synthesizeTimeoutMs }, SECRET);
}

async function postTts(
  app: ReturnType<typeof createTtsApp>,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return app.request("/tts", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${SECRET}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

async function getVoices(
  app: ReturnType<typeof createTtsApp>,
  query?: string,
  headers: Record<string, string> = {},
) {
  const path = query ? `/tts/voices?locale=${query}` : "/tts/voices";
  return app.request(path, {
    method: "GET",
    headers: {
      authorization: `Bearer ${SECRET}`,
      ...headers,
    },
  });
}

describe("POST /tts", () => {
  let provider: TtsProvider;

  beforeEach(() => {
    provider = createMockProvider();
  });

  it("returns 401 when the bearer secret is missing", async () => {
    const res = await app(provider).request("/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Hello", voice: "en-US-EmmaNeural" }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("returns 401 when the bearer secret is wrong", async () => {
    const res = await app(provider).request("/tts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer wrong-secret",
      },
      body: JSON.stringify({ text: "Hello", voice: "en-US-EmmaNeural" }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("returns 400 when the body is not valid JSON", async () => {
    const res = await app(provider).request("/tts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${SECRET}`,
      },
      body: "not-json",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_body" });
  });

  it("returns 400 when text is missing", async () => {
    const res = await postTts(app(provider), { voice: "en-US-EmmaNeural" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_body" });
  });

  it("returns 400 when voice is missing", async () => {
    const res = await postTts(app(provider), { text: "Hello" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_body" });
  });

  it("returns 400 when text or voice is not a string", async () => {
    const res = await postTts(app(provider), { text: 123, voice: "en-US-EmmaNeural" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_body" });
  });

  it("returns synthesized audio on the happy path", async () => {
    vi.mocked(provider.synthesize).mockResolvedValue(FAKE_AUDIO);
    const res = await postTts(app(provider), {
      text: "Hello",
      voice: "en-US-EmmaNeural",
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(FAKE_AUDIO);
    expect(provider.synthesize).toHaveBeenCalledWith("Hello", "en-US-EmmaNeural");
  });

  it("returns an error response when the provider rejects", async () => {
    vi.mocked(provider.synthesize).mockRejectedValue(new Error("edge-tts failed"));
    const res = await postTts(app(provider), {
      text: "Hello",
      voice: "en-US-EmmaNeural",
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "synthesis_failed" });
  });

  it("returns an error response when synthesis exceeds the timeout", async () => {
    vi.mocked(provider.synthesize).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(FAKE_AUDIO), 60_000)),
    );
    const res = await postTts(app(provider, 50), {
      text: "Hello",
      voice: "en-US-EmmaNeural",
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "synthesis_failed" });
  });

  it("calls the provider exactly once and does not retry", async () => {
    vi.mocked(provider.synthesize).mockRejectedValue(new Error("edge-tts failed"));
    await postTts(app(provider), { text: "Hello", voice: "en-US-EmmaNeural" });
    expect(provider.synthesize).toHaveBeenCalledTimes(1);
  });
});

describe("GET /tts/voices", () => {
  let provider: TtsProvider;
  const voices: TtsVoice[] = [
    { id: "en-US-EmmaNeural", name: "Emma", locale: "en-US", gender: "Female" },
    { id: "vi-VN-HoaiMyNeural", name: "Hoai My", locale: "vi-VN", gender: "Female" },
  ];

  beforeEach(() => {
    provider = createMockProvider();
  });

  it("returns 401 when the bearer secret is missing", async () => {
    const res = await app(provider).request("/tts/voices", { method: "GET" });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("returns 401 when the bearer secret is wrong", async () => {
    const res = await app(provider).request("/tts/voices", {
      method: "GET",
      headers: { authorization: "Bearer wrong-secret" },
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("returns the provider voice list", async () => {
    vi.mocked(provider.listVoices).mockResolvedValue(voices);
    const res = await getVoices(app(provider));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ voices });
    expect(provider.listVoices).toHaveBeenCalledWith(undefined);
  });

  it("passes the locale query to the provider", async () => {
    vi.mocked(provider.listVoices).mockResolvedValue([voices[0]]);
    const res = await getVoices(app(provider), "en-US");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ voices: [voices[0]] });
    expect(provider.listVoices).toHaveBeenCalledWith("en-US");
  });

  it("returns an error response when the provider rejects", async () => {
    vi.mocked(provider.listVoices).mockRejectedValue(new Error("edge-tts failed"));
    const res = await getVoices(app(provider));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "voices_failed" });
  });
});
