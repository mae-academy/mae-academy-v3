import { beforeEach, describe, expect, it, vi } from "vitest";

const lookupMock = vi.hoisted(() => vi.fn());
vi.mock("node:dns/promises", () => ({ lookup: lookupMock }));

import { fetchWithValidatedRedirects } from "./pdfProxy";
import { ALL_LIBRARY_HOSTS, assertSafeTarget, configuredProxyAllowlist, HOST_ALLOWLISTS, hostMatches, isPrivateAddress, parseSafeUrl, readLimited, safeFetch, SsrfError } from "./ssrf";

const publicDns = () => lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
const refused = async (promise: Promise<unknown>) => { const error = await promise.then(() => null, (e: unknown) => e); expect(error).toBeInstanceOf(SsrfError); return (error as SsrfError).status; };

beforeEach(() => { lookupMock.mockReset(); publicDns(); });

describe("syntactic policy", () => {
  it.each([
    "http://archive.org/x", "file:///etc/passwd", "ftp://archive.org/x", "gopher://archive.org", "javascript:alert(1)", "data:text/plain,hi",
  ])("refuses the %s scheme", (url) => expect(() => parseSafeUrl(url)).toThrow(SsrfError));

  it.each([
    "https://127.0.0.1/", "https://10.0.0.5/", "https://172.16.0.1/", "https://192.168.1.1/", "https://169.254.169.254/latest/meta-data/",
    "https://[::1]/", "https://[fd00::1]/", "https://[::ffff:127.0.0.1]/",
    "https://2130706433/", "https://0x7f000001/", "https://017700000001/", "https://127.1/", "https://0/", "https://8.8.8.8/",
  ])("refuses the IP literal %s in every spelling", (url) => expect(() => parseSafeUrl(url)).toThrow(SsrfError));

  it.each([
    "https://localhost/", "https://localhost./", "https://app.localhost/", "https://printer.local/", "https://db.internal/", "https://metadata.google.internal/", "https://intranet/",
  ])("refuses the internal hostname %s", (url) => expect(() => parseSafeUrl(url)).toThrow(SsrfError));

  it("refuses credentials and non-default ports", () => {
    expect(() => parseSafeUrl("https://user:pw@archive.org/")).toThrow(SsrfError);
    expect(() => parseSafeUrl("https://archive.org:8443/")).toThrow(SsrfError);
    expect(() => parseSafeUrl("https://archive.org:443/x")).not.toThrow();
  });

  it("every refusal is a 400 Bad Request", () => {
    for (const url of ["http://archive.org/", "https://127.0.0.1/", "https://localhost/", "not a url"]) {
      try { parseSafeUrl(url); } catch (error) { expect((error as SsrfError).status).toBe(400); }
    }
  });

  it("allowlist matches exact hosts and real subdomains only", () => {
    expect(hostMatches("archive.org", HOST_ALLOWLISTS.archive)).toBe(true);
    expect(hostMatches("ia800000.us.archive.org", HOST_ALLOWLISTS.archive)).toBe(true);
    expect(hostMatches("covers.openlibrary.org", HOST_ALLOWLISTS.openLibrary)).toBe(true);
    expect(hostMatches("api.openalex.org", HOST_ALLOWLISTS.openAlex)).toBe(true);
    expect(hostMatches("directory.doabooks.org", HOST_ALLOWLISTS.doab)).toBe(true);
    for (const host of ["evilarchive.org", "archive.org.evil.com", "notarchive.org", "archive.org.", "xarchive.org", "evil.com"]) expect(hostMatches(host, ALL_LIBRARY_HOSTS) && !host.endsWith(".")).toBe(false);
    expect(() => parseSafeUrl("https://evil.com/", ALL_LIBRARY_HOSTS)).toThrow(SsrfError);
    expect(() => parseSafeUrl("https://archive.org.evil.com/", ALL_LIBRARY_HOSTS)).toThrow(SsrfError);
    expect(() => parseSafeUrl("https://covers.openlibrary.org/b/id/1-L.jpg", ALL_LIBRARY_HOSTS)).not.toThrow();
  });

  it("classifies private address ranges", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "fd12::1", "fe80::1", "::ffff:10.0.0.1"]) expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ["8.8.8.8", "93.184.216.34", "172.32.0.1", "2606:4700:4700::1111"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it("reads the optional proxy allowlist from the environment", () => {
    expect(configuredProxyAllowlist({})).toBeUndefined();
    expect(configuredProxyAllowlist({ PDF_PROXY_ALLOWED_HOSTS: " Archive.org, *.example.edu " })).toEqual(["archive.org", "*.example.edu"]);
  });
});

describe("DNS rebinding and redirects", () => {
  it("refuses a public-looking hostname that resolves to a private address (400)", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }, { address: "169.254.169.254", family: 4 }]);
    expect(await refused(assertSafeTarget("https://rebind.example.com/x"))).toBe(400);
    lookupMock.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    expect(await refused(assertSafeTarget("https://archive.org/x", ALL_LIBRARY_HOSTS))).toBe(400);
  });

  it("an unresolvable host is a 502, not a pass", async () => {
    lookupMock.mockRejectedValue(new Error("ENOTFOUND"));
    expect(await refused(assertSafeTarget("https://nope.example.com/"))).toBe(502);
  });

  it("re-validates every redirect hop: http, internal and non-allowlisted targets are refused", async () => {
    const redirectTo = (location: string) => vi.fn(async () => new Response(null, { status: 302, headers: { location } }));
    for (const location of ["http://archive.org/x", "https://169.254.169.254/latest", "https://localhost/admin", "https://evil.com/x", "https://archive.org.evil.com/x"])
      expect(await refused(safeFetch("https://archive.org/start", { allowlist: HOST_ALLOWLISTS.archive, fetchImpl: redirectTo(location) as unknown as typeof fetch })), location).toBe(400);
  });

  it("follows legitimate redirects inside the allowlist, always with redirect:manual", async () => {
    const calls: Array<{ url: string; redirect: unknown }> = [];
    const fetchImpl = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      calls.push({ url: String(input), redirect: init?.redirect });
      return calls.length === 1 ? new Response(null, { status: 301, headers: { location: "https://ia800.us.archive.org/file.pdf" } }) : new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;
    const response = await safeFetch("https://archive.org/download/x", { allowlist: HOST_ALLOWLISTS.archive, fetchImpl });
    expect(await response.text()).toBe("ok");
    expect(calls.map((c) => c.url)).toEqual(["https://archive.org/download/x", "https://ia800.us.archive.org/file.pdf"]);
    expect(calls.every((c) => c.redirect === "manual")).toBe(true);
  });

  it("gives up after too many redirects", async () => {
    const loop = vi.fn(async () => new Response(null, { status: 302, headers: { location: "https://archive.org/again" } })) as unknown as typeof fetch;
    expect(await refused(safeFetch("https://archive.org/a", { allowlist: HOST_ALLOWLISTS.archive, fetchImpl: loop }))).toBe(508);
  });
});

describe("the PDF proxy applies the same policy", () => {
  it("rejects http, IP literals, loopback and metadata targets before any request is made", async () => {
    const signal = new AbortController().signal;
    for (const url of ["http://archive.org/x.pdf", "https://127.0.0.1/x.pdf", "https://localhost/x.pdf", "https://169.254.169.254/x.pdf", "file:///etc/passwd"]) {
      const error = await fetchWithValidatedRedirects(url, signal).then(() => null, (e: unknown) => e);
      expect((error as { status?: number }).status, url).toBe(400);
    }
  });
});

describe("response size ceilings", () => {
  const bodyOf = (bytes: number, headers: Record<string, string> = {}) => new Response(new Uint8Array(bytes), { headers });
  it("reads bodies under the cap", async () => expect((await readLimited(bodyOf(1000), 2000)).length).toBe(1000));
  it("refuses a declared Content-Length over the cap without reading", async () => {
    expect(await refused(readLimited(bodyOf(10, { "content-length": "999999999" }), 1000))).toBe(502);
  });
  it("aborts a streamed body that exceeds the cap", async () => {
    expect(await refused(readLimited(bodyOf(5000), 1000))).toBe(502);
  });
});
