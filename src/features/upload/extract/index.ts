import { mockProvider } from "@/features/upload/extract/mock";
import type { ExtractionOutcome, ExtractionRequest } from "@/features/upload/types";

/**
 * The demo provider keeps the upload flow usable until the authenticated
 * Firebase Function becomes the sole Groq boundary. No model key belongs in
 * the Expo bundle.
 */
export function activeProvider() {
  return mockProvider;
}

export function extractCards(
  request: ExtractionRequest,
  onProgress?: (fraction: number) => void,
): Promise<ExtractionOutcome> {
  return activeProvider().extract(request, onProgress);
}
