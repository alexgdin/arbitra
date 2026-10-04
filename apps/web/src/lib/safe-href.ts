/**
 * Product URLs come from user-submitted data, so only plain web links are rendered as links.
 * Returns the URL unchanged when it is http(s), otherwise null.
 */
export function getSafeHref(url: string): string | null {
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}
