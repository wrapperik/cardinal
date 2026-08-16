/**
 * Gemini reads the PDF directly as inline base64 rather than needing text
 * extracted from it first — the whole reason this provider exists, since
 * there is no usable client-side PDF text extractor in React Native.
 * Configured whenever EXPO_PUBLIC_GEMINI_API_KEY is set; unset it and the
 * pipeline falls through to Groq or the mock extractor (see extract/index.ts).
 */

import { parseExtractionResponse } from "@/features/upload/extract/parse";
import { buildExtractionPrompt } from "@/features/upload/extract/prompt";
import { readFileBase64 } from "@/features/upload/picker";
import type { ExtractionOutcome, ExtractionProvider, ExtractionRequest } from "@/features/upload/types";

const ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

/** Generous enough for a multi-page PDF upload plus a full generation pass. */
const TIMEOUT_MS = 30000;

function apiKey(): string | undefined {
  return process.env.EXPO_PUBLIC_GEMINI_API_KEY;
}

async function extract(
  request: ExtractionRequest,
  onProgress?: (fraction: number) => void,
): Promise<ExtractionOutcome> {
  const key = apiKey();
  if (!key) return { ok: false, reason: "noKey", message: "NO GEMINI API KEY IS CONFIGURED" };

  const { system, user } = buildExtractionPrompt(request);

  let base64: string;
  try {
    base64 = await readFileBase64(request.file);
  } catch {
    return { ok: false, reason: "network", message: "COULDN'T READ THAT FILE" };
  }
  onProgress?.(0.2);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: user },
              { inline_data: { mime_type: request.file.mimeType, data: base64 } },
            ],
          },
        ],
        systemInstruction: { parts: [{ text: system }] },
        generationConfig: { responseMimeType: "application/json", temperature: 0.3 },
      }),
      signal: controller.signal,
    });
  } catch {
    return { ok: false, reason: "network", message: "COULDN'T REACH GEMINI — CHECK YOUR CONNECTION" };
  } finally {
    clearTimeout(timeout);
  }

  onProgress?.(0.8);

  if (!response.ok) {
    return { ok: false, reason: "network", message: `GEMINI RETURNED AN ERROR (${response.status})` };
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return { ok: false, reason: "badResponse", message: "GEMINI'S RESPONSE WASN'T VALID JSON" };
  }

  const text = (json as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
    .candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") {
    return { ok: false, reason: "badResponse", message: "GEMINI'S RESPONSE HAD NO TEXT IN IT" };
  }

  onProgress?.(1);
  return parseExtractionResponse(text, {
    courses: request.courses,
    provider: "gemini",
    template: request.template,
  });
}

export const geminiProvider: ExtractionProvider = {
  id: "gemini",
  label: "GEMINI",
  isConfigured: () => Boolean(apiKey()),
  extract,
};
