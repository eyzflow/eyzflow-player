/**
 * Adds key-values to an ad tag's `cust_params` (Google Ad Manager's custom targeting), keeping any the tag already
 * has; the tag's own value wins for the same key. Returns the tag unchanged when there is nothing to add or it is not
 * a URL.
 */
export function withTargeting(adTagUrl: string, targeting: Record<string, string>): string {
  const keys = Object.keys(targeting);
  if (keys.length === 0) return adTagUrl;
  let url: URL;
  try {
    url = new URL(adTagUrl);
  } catch {
    return adTagUrl;
  }
  const params = new URLSearchParams(url.searchParams.get("cust_params") ?? "");
  for (const key of keys) {
    if (!params.has(key)) params.set(key, targeting[key]);
  }
  url.searchParams.set("cust_params", params.toString());
  return url.toString();
}
