import { Hono } from "hono";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import type { Voice } from "msedge-tts";

/**
 * Domain representation of a Voice exposed by a Text-to-Speech Provider.
 */
export interface TtsVoice {
  /** Provider-specific voice identifier passed to synthesize(). */
  id: string;
  /** Human-readable voice name. */
  name: string;
  /** BCP-47 style locale, e.g. "en-US". */
  locale: string;
  /** Gender hint for the voice. */
  gender: string;
}

/**
 * Pluggable Text-to-Speech Provider interface.
 */
export interface TtsProvider {
  /** Synthesize `text` using the given `voice` identifier, returning audio bytes. */
  synthesize(text: string, voice: string): Promise<Buffer>;
  /** List the voices this Provider supports, optionally filtered by locale. */
  listVoices(locale?: string): Promise<TtsVoice[]>;
}

export interface TtsAppDeps {
  provider: TtsProvider;
}

export interface TtsAppOptions {
  /** Maximum time in milliseconds to wait for a single synthesis call. */
  synthesizeTimeoutMs: number;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function mapVoice(voice: Voice): TtsVoice {
  return {
    id: voice.ShortName,
    name: voice.FriendlyName,
    locale: voice.Locale,
    gender: voice.Gender,
  };
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

async function withEdgeTts<T>(fn: (tts: MsEdgeTTS) => Promise<T>): Promise<T> {
  const tts = new MsEdgeTTS();
  try {
    return await fn(tts);
  } finally {
    tts.close();
  }
}

/**
 * Edge-tts-backed {@link TtsProvider}.
 */
export class EdgeTtsProvider implements TtsProvider {
  async synthesize(text: string, voice: string): Promise<Buffer> {
    return withEdgeTts(async (tts) => {
      await tts.setMetadata(
        voice,
        OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3,
      );
      const { audioStream } = tts.toStream(escapeXml(text));
      const audio = await streamToBuffer(audioStream);
      return audio;
    });
  }

  async listVoices(locale?: string): Promise<TtsVoice[]> {
    const voices = await withEdgeTts((tts) => tts.getVoices());
    const filtered = locale
      ? voices.filter((v) => v.Locale === locale)
      : voices;
    return filtered.map(mapVoice);
  }
}

function isValidBody(body: unknown): body is { text: string; voice: string } {
  return (
    typeof body === "object" &&
    body !== null &&
    "text" in body &&
    "voice" in body &&
    typeof (body as { text: unknown }).text === "string" &&
    typeof (body as { voice: unknown }).voice === "string" &&
    (body as { text: string }).text.length > 0 &&
    (body as { voice: string }).voice.length > 0
  );
}

export function createTtsApp(
  deps: TtsAppDeps,
  options: TtsAppOptions,
  secret: string,
): Hono {
  const app = new Hono();

  function requireAuth(c: { req: { header: (name: string) => string | undefined } }) {
    return c.req.header("authorization") === `Bearer ${secret}`;
  }

  app.post("/tts", async (c) => {
    if (!requireAuth(c)) {
      return c.json({ error: "unauthorized" }, 401);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_body" }, 400);
    }

    if (!isValidBody(body)) {
      return c.json({ error: "invalid_body" }, 400);
    }

    const { text, voice } = body;

    const synthesis = deps.provider.synthesize(text, voice).catch(() => null);
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<Buffer | null>((resolve) => {
      timeoutId = setTimeout(() => resolve(null), options.synthesizeTimeoutMs);
    });

    const audio = await Promise.race([synthesis, timeout]);
    clearTimeout(timeoutId);

    if (audio === null) {
      return c.json({ error: "synthesis_failed" }, 500);
    }

    return c.body(new Uint8Array(audio), 200, { "content-type": "audio/mpeg" });
  });

  app.get("/tts/voices", async (c) => {
    if (!requireAuth(c)) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const locale = c.req.query("locale") || undefined;

    try {
      const voices = await deps.provider.listVoices(locale);
      return c.json({ voices });
    } catch {
      return c.json({ error: "voices_failed" }, 500);
    }
  });

  return app;
}
