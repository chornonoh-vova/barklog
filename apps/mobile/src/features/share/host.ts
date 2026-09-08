/**
 * Derived from the url the tap opens, never from `source.provider`: that
 * field is a string supplied by whatever site we fetched, so any host can
 * claim to be "YouTube" and get a link that reads YouTube but opens
 * elsewhere. Deriving the label from `pageUrl` keeps label and destination
 * unable to disagree.
 */
export function displayHost(pageUrl: string): string {
  try {
    const host = new URL(pageUrl).hostname.toLowerCase();
    const stripped = host.startsWith("www.") ? host.slice(4) : host;

    // A bare "www." host strips to "", which would render an empty link label.
    return stripped === "" ? host : stripped;
  } catch {
    return pageUrl;
  }
}
