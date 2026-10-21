/**
 * Pull the first JSON array out of a model response that may be wrapped in
 * prose or markdown fences. Retries once after removing trailing commas and
 * control characters, which are the most common defects in model output.
 * Returns null when nothing parseable is found.
 */
export function extractJsonArray(text: string): unknown[] | null {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return null;

  const attempts = [
    match[0],
    match[0]
      .replace(/,\s*([}\]])/g, "$1") // trailing commas
      .replace(/[\x00-\x1f]/g, " "), // control characters
  ];

  for (const candidate of attempts) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      // try the next candidate
    }
  }
  return null;
}
