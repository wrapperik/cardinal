/**
 * EXPO_PUBLIC_ variables are inlined into the shipped JS bundle at build
 * time, so a Gemini or Groq key set this way is readable by anyone who
 * unpacks the app. That is fine for a prototype but must move behind a
 * Cloud Function proxy before release — the client would call the function,
 * and the function would hold the real key server-side.
 */

import { geminiProvider } from "@/features/upload/extract/gemini";
import { groqProvider } from "@/features/upload/extract/groq";
import { mockProvider } from "@/features/upload/extract/mock";
import type { ExtractionOutcome, ExtractionProvider, ExtractionRequest } from "@/features/upload/types";

/** Priority order: a real key beats the demo, and Gemini beats Groq because it can read PDFs. */
export const EXTRACTION_PROVIDERS: ExtractionProvider[] = [geminiProvider, groqProvider, mockProvider];

export function activeProvider(): ExtractionProvider {
  return EXTRACTION_PROVIDERS.find((provider) => provider.isConfigured()) ?? mockProvider;
}

export function extractCards(
  request: ExtractionRequest,
  onProgress?: (fraction: number) => void,
): Promise<ExtractionOutcome> {
  return activeProvider().extract(request, onProgress);
}
