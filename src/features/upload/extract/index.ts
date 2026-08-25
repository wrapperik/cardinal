import { geminiProvider } from "@/features/upload/extract/gemini";
import { mockProvider } from "@/features/upload/extract/mock";
import type { ExtractionOutcome, ExtractionProgress, ExtractionRequest } from "@/features/upload/types";

/**
 * Firebase owns the Gemini key. The client enables its job-based provider only
 * when the explicit non-secret feature flag and an authenticated Firebase
 * session are both available; the demo remains a clean-checkout fallback.
 */
export function activeProvider() {
  return geminiProvider.isConfigured() ? geminiProvider : mockProvider;
}

export function extractCards(
  request: ExtractionRequest,
  onProgress?: (progress: ExtractionProgress) => void,
): Promise<ExtractionOutcome> {
  return activeProvider().extract(request, onProgress);
}
