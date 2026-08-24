import { groqProvider } from "@/features/upload/extract/groq";
import { mockProvider } from "@/features/upload/extract/mock";
import type { ExtractionOutcome, ExtractionRequest } from "@/features/upload/types";

/**
 * Firebase owns the Groq key. The client enables its job-based provider only
 * when the explicit non-secret feature flag and an authenticated Firebase
 * session are both available; the demo remains a clean-checkout fallback.
 */
export function activeProvider() {
  return groqProvider.isConfigured() ? groqProvider : mockProvider;
}

export function extractCards(
  request: ExtractionRequest,
  onProgress?: (fraction: number) => void,
): Promise<ExtractionOutcome> {
  return activeProvider().extract(request, onProgress);
}
