import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";

import {
  ACCEPTED_MIME_TYPES,
  MAX_FILE_BYTES,
  type PickedFile,
  type PickOutcome,
} from "@/features/upload/types";

/**
 * Android content providers routinely hand back an undefined mimeType for a
 * perfectly ordinary file — the extension is the only signal left at that
 * point, so this is the fallback rather than an edge case.
 */
const EXTENSION_MIME_TYPES: Record<string, (typeof ACCEPTED_MIME_TYPES)[number]> = {
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
};

function inferMimeType(name: string, mimeType?: string): string | undefined {
  if (mimeType) return mimeType;
  const extension = name.split(".").pop()?.toLowerCase();
  return extension ? EXTENSION_MIME_TYPES[extension] : undefined;
}

function isAcceptedMimeType(value: string): value is (typeof ACCEPTED_MIME_TYPES)[number] {
  return (ACCEPTED_MIME_TYPES as readonly string[]).includes(value);
}

/**
 * The web picker fills its `base64` field from FileReader.readAsDataURL, so
 * despite the name it hands back a whole `data:<mime>;base64,<payload>` URL.
 * Gemini's inline_data and atob both want the payload on its own, and passing
 * the prefixed form to either fails in a way that reads as a network or model
 * fault rather than the encoding mistake it is. Stripped once here, at the
 * only place a PickedFile is ever built, rather than at each consumer.
 */
function stripDataUrl(base64: string): string {
  const marker = ";base64,";
  const at = base64.indexOf(marker);
  return at === -1 ? base64 : base64.slice(at + marker.length);
}

export async function pickDocument(): Promise<PickOutcome> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: [...ACCEPTED_MIME_TYPES],
      copyToCacheDirectory: true,
      multiple: false,
      base64: true,
    });

    if (result.canceled) {
      return { ok: false, reason: "cancelled", message: "NO FILE WAS SELECTED" };
    }

    const asset = result.assets[0];
    const mimeType = inferMimeType(asset.name, asset.mimeType);

    if (!mimeType || !isAcceptedMimeType(mimeType)) {
      return { ok: false, reason: "unsupportedType", message: "USE A PDF, TXT, OR MARKDOWN FILE" };
    }

    if (asset.size !== undefined && asset.size > MAX_FILE_BYTES) {
      return { ok: false, reason: "tooLarge", message: "THAT FILE IS OVER 20 MB" };
    }

    const file: PickedFile = {
      uri: asset.uri,
      name: asset.name,
      size: asset.size,
      mimeType,
      base64: asset.base64 ? stripDataUrl(asset.base64) : undefined,
    };

    return { ok: true, file };
  } catch {
    // The picker throwing (permissions, a flaky content provider, whatever)
    // should read like any other pick failure, not crash the sheet.
    return { ok: false, reason: "failed", message: "COULDN'T OPEN THE FILE PICKER" };
  }
}

/**
 * Web already has base64 from the picker itself (see PickedFile). Native
 * copies the asset into the cache directory instead and reads it on demand,
 * which is cheaper when a large PDF is picked but never actually uploaded.
 */
export async function readFileBase64(file: PickedFile): Promise<string> {
  if (file.base64) return file.base64;
  return await new File(file.uri).base64();
}

function decodeBase64ToUtf8(base64: string): string {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * expo-file-system's native File.text()/base64() are unimplemented on web
 * (ExpoFileSystem.web only stubs the constructor), so the web path has to
 * decode the base64 the picker already handed back instead of reading the
 * uri a second time.
 */
export async function readFileText(file: PickedFile): Promise<string> {
  if (file.base64) return decodeBase64ToUtf8(file.base64);
  return await new File(file.uri).text();
}

export function formatBytes(bytes?: number): string {
  if (bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;

  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(1)} ${units[unitIndex]}`;
}
