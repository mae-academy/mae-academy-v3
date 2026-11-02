/**
 * Outbound-request guard shared by every proxy (Express under server/ and the Vercel functions under api/). One policy, applied to the first URL and to every redirect hop:
 *   - https only, no embedded credentials, default port only, no raw IP literals (decimal / hex / octal / IPv6 forms included);
 *   - well-known internal hostnames (localhost, *.local, *.internal, cloud metadata names) are refused;
 *   - when a host allowlist applies, the host must match it exactly or as a `*.suffix` entry;
 *   - the resolved addresses must all be public (loopback, RFC 1918, CGNAT, link-local / 169.254.169.254 metadata, multicast and IPv6 ULA are refused).
 * Every refusal is a 400, so callers cannot probe which internal addresses exist.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class SsrfError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Fixed upstreams of the library and metadata endpoints; entries are exact hosts or `*.suffix`. */
export const HOST_ALLOWLISTS = {
  archive: ["archive.org", "*.archive.org"],
  openLibrary: ["openlibrary.org", "*.openlibrary.org"],
  openAlex: ["api.openalex.org"],
  doab: ["doabooks.org", "*.doabooks.org"],
} as const;

export const ALL_LIBRARY_HOSTS: readonly string[] = [...HOST_ALLOWLISTS.archive, ...HOST_ALLOWLISTS.openLibrary, ...HOST_ALLOWLISTS.openAlex, ...HOST_ALLOWLISTS.doab];

const MAX_REDIRECTS = 5;
const BLOCKED_HOSTNAME = /(^|\.)(localhost|local|localdomain|internal|intranet|lan|home|corp)$|^metadata(\.google\.internal)?$/i;

export function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) || // IETF protocol assignments / TEST-NET-1
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast / reserved
  );
}

export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) return isPrivateIPv4(ip);
  const v6 = ip.toLowerCase();
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb") || v6.startsWith("ff");
}

export function hostMatches(host: string, allowlist: readonly string[]): boolean {
  const name = host.toLowerCase();
  return allowlist.some((entry) => (entry.startsWith("*.") ? name.endsWith(entry.slice(1)) && name.length > entry.length - 1 : name === entry));
}

/** Syntactic checks only (no DNS): scheme, credentials, port, IP literal, internal names, allowlist. */
export function parseSafeUrl(raw: string, allowlist?: readonly string[]): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SsrfError(400, "Invalid URL");
  }
  if (url.protocol !== "https:") throw new SsrfError(400, "Only https URLs are allowed");
  if (url.username || url.password) throw new SsrfError(400, "Invalid URL");
  if (url.port && url.port !== "443") throw new SsrfError(400, "Invalid URL");
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  // new URL() normalises 2130706433, 0x7f.1, 017700000001 ... into dotted quads, so isIP() sees every IPv4 literal form.
  if (isIP(host) !== 0 || host.includes(":")) throw new SsrfError(400, "IP addresses are not allowed");
  if (!host.includes(".") || BLOCKED_HOSTNAME.test(host)) throw new SsrfError(400, "Target host is not allowed");
  if (allowlist && !hostMatches(host, allowlist)) throw new SsrfError(400, "Target host is not allowed");
  return url;
}

/** Resolves the host and refuses it when any address is private. Unresolvable hosts are a 502 (nothing to refuse). */
export async function assertPublicHost(url: URL): Promise<void> {
  const addresses = await lookup(url.hostname.replace(/\.$/, ""), { all: true }).catch(() => []);
  if (addresses.length === 0) throw new SsrfError(502, "Host could not be resolved");
  if (addresses.some((entry) => isPrivateAddress(entry.address))) throw new SsrfError(400, "Target host is not allowed");
}

export async function assertSafeTarget(raw: string, allowlist?: readonly string[]): Promise<URL> {
  const url = parseSafeUrl(raw, allowlist);
  await assertPublicHost(url);
  return url;
}

/** Host allowlist for the PDF proxy, from `PDF_PROXY_ALLOWED_HOSTS` (comma-separated). Unset = any public https host. */
export function configuredProxyAllowlist(env: NodeJS.ProcessEnv = process.env): readonly string[] | undefined {
  const entries = (env.PDF_PROXY_ALLOWED_HOSTS ?? "").split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  return entries.length > 0 ? entries : undefined;
}

export interface SafeFetchOptions extends Omit<RequestInit, "redirect"> {
  allowlist?: readonly string[];
  /** Per-hop fetch, injectable for tests. */
  fetchImpl?: typeof fetch;
}

/** GET with every hop (including redirects) re-validated against the policy above. */
export async function safeFetch(start: string, options: SafeFetchOptions = {}): Promise<Response> {
  const { allowlist, fetchImpl = fetch, ...init } = options;
  let current = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = await assertSafeTarget(current, allowlist);
    const response = await fetchImpl(url, { ...init, redirect: "manual" });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new SsrfError(502, "Redirect without location");
      current = new URL(location, url).toString();
      await response.body?.cancel();
      continue;
    }
    return response;
  }
  throw new SsrfError(508, "Too many redirects");
}

/** Reads a response body with a hard byte ceiling (a declared Content-Length over the cap is refused before reading). */
export async function readLimited(response: Response, maxBytes: number): Promise<Buffer> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > maxBytes) {
    await response.body?.cancel();
    throw new SsrfError(502, "Upstream response too large");
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    total += chunk.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new SsrfError(502, "Upstream response too large");
    }
    chunks.push(chunk.value);
  }
  return Buffer.concat(chunks);
}
