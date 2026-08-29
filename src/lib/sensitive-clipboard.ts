export const SENSITIVE_CLIPBOARD_TTL_MS = 30_000;

/**
 * Copies a revealed credential and clears it after a short window when the
 * clipboard still contains the same value. A later clipboard item is never
 * overwritten, and platform permission failures are intentionally ignored.
 */
export async function copySensitiveText(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
  window.setTimeout(() => {
    void clearIfUnchanged(value);
  }, SENSITIVE_CLIPBOARD_TTL_MS);
}

async function clearIfUnchanged(expected: string): Promise<void> {
  try {
    if (await navigator.clipboard.readText() === expected) {
      await navigator.clipboard.writeText("");
    }
  } catch {
    // Clipboard reads can be denied by the OS or WebView. Copy remains useful,
    // and the UI describes the timed clear as best effort in the security docs.
  }
}
