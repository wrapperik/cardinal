/**
 * Groq's chat completions endpoint takes text messages only — there is no
 * file-upload equivalent for these text models, so they cannot see a PDF's
 * binary layout the way Gemini can. Text and markdown files are read as
 * plain text and inlined into the prompt instead; a PDF pick is rejected up
 * front with 'unsupportedFile' rather than sent as noise the model cannot use.
 *
 * That rejection is deliberately a dead end rather than a silent downgrade:
 * with only a Groq key set, extractCards has no better provider to try, and
 * quietly handing the job to the mock extractor would fabricate cards from the
 * app's sample data while the user believes their PDF was read. The message
 * says to configure Gemini instead, which is the only real fix.
 */

import { parseExtractionResponse } from "@/features/upload/extract/parse";
import { buildExtractionPrompt } from "@/features/upload/extract/prompt";
import { readFileText } from "@/features/upload/picker";
import type { ExtractionOutcome, ExtractionProvider, ExtractionRequest } from "@/features/upload/types";

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

/** Generous enough for a long text file plus a full generation pass. */
const TIMEOUT_MS = 30000;

function apiKey(): string | undefined {
  return process.env.EXPO_PUBLIC_GROQ_API_KEY;
}

async function extract(
  request: ExtractionRequest,
  onProgress?: (fraction: number) => void,
): Promise<ExtractionOutcome> {
  const key = apiKey();
  if (!key) return { ok: false, reason: "noKey", message: "NO GROQ API KEY IS CONFIGURED" };

  if (request.file.mimeType === "application/pdf") {
    return {
      ok: false,
      reason: "unsupportedFile",
      message: "GROQ CAN'T READ PDFS — SWITCH TO GEMINI FOR THIS FILE",
    };
  }

  const { system, user } = buildExtractionPrompt(request);

  let text: string;
  try {
    text = await readFileText(request.file);
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
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: `${user}\n\n---\n\n${text}` },
        ],
      }),
      signal: controller.signal,
    });
  } catch {
    return { ok: false, reason: "network", message: "COULDN'T REACH GROQ — CHECK YOUR CONNECTION" };
  } finally {
    clearTimeout(timeout);
  }

  onProgress?.(0.8);

  if (!response.ok) {
    return { ok: false, reason: "network", message: `GROQ RETURNED AN ERROR (${response.status})` };
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return { ok: false, reason: "badResponse", message: "GROQ'S RESPONSE WASN'T VALID JSON" };
  }

  const content = (json as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message
    ?.content;
  if (typeof content !== "string") {
    return { ok: false, reason: "badResponse", message: "GROQ'S RESPONSE HAD NO CONTENT IN IT" };
  }

  onProgress?.(1);
  return parseExtractionResponse(content, {
    courses: request.courses,
    provider: "groq",
    template: request.template,
  });
}

export const groqProvider: ExtractionProvider = {
  id: "groq",
  label: "GROQ",
  isConfigured: () => Boolean(apiKey()),
  extract,
};
