import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lookupMock = vi.hoisted(() => vi.fn());
vi.mock("node:dns/promises", () => ({ lookup: lookupMock }));

import { createPdfWebHandler, LIBRARY_PDF_HOSTS } from "./pdf";
import { handleCover, handleDoabItem, handleDoabSearch, handleResolvePdfs } from "./catalog";
import { GET as pdfProxyGET } from "../../pdf-proxy";

const PDF_BYTES = new TextEncoder().encode("%PDF-1.7\n...body...");
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  lookupMock.mockReset();
  lookupMock.mockResolvedValue([{ address: "207.241.224.2", family: 4 }]);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const proxy = createPdfWebHandler("inline", LIBRARY_PDF_HOSTS);
const download = createPdfWebHandler("attachment", LIBRARY_PDF_HOSTS);
const call = (handler: (r: Request) => Promise<Response>, query: string, init?: RequestInit) => handler(new Request(`https://maeacademy.org/api/x?${query}`, init));
const target = (url: string) => `url=${encodeURIComponent(url)}`;

describe("Vercel PDF handler", () => {
  it("allows only the library's PDF hosts", () => {
    expect(LIBRARY_PDF_HOSTS).toEqual(["archive.org", "*.archive.org"]);
  });

  it("refuses hosts outside the library allowlist without fetching", async () => {
    for (const url of ["https://arxiv.org/pdf/1.pdf", "https://example.com/a.pdf", "https://archive.org.evil.com/a.pdf", "http://archive.org/a.pdf"]) {
      const res = await call(proxy, target(url));
      expect(res.status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers 400 when the url parameter is missing", async () => {
    expect((await call(proxy, "")).status).toBe(400);
  });

  it("re-validates redirects: an archive.org redirect to another host is refused", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://evil.example/x.pdf" } }));
    const res = await call(proxy, target("https://archive.org/download/id/a.pdf"));
    expect(res.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("follows an archive.org redirect to a storage node and streams the PDF with the Express headers", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://ia800300.us.archive.org/1/items/id/a.pdf" } }))
      .mockResolvedValueOnce(new Response(PDF_BYTES, { status: 200, headers: { "content-length": String(PDF_BYTES.length), "accept-ranges": "bytes" } }));
    const res = await call(proxy, target("https://archive.org/download/id/a.pdf"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe("inline");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PDF_BYTES);
  });

  it("forwards a single byte range and passes 206 + Content-Range through", async () => {
    fetchMock.mockResolvedValueOnce(new Response(PDF_BYTES.slice(0, 4), { status: 206, headers: { "content-range": "bytes 0-3/100" } }));
    const res = await call(proxy, target("https://archive.org/download/id/a.pdf"), { headers: { range: "bytes=0-3" } });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 0-3/100");
    expect((fetchMock.mock.calls[0]![1]!.headers as Record<string, string>).Range).toBe("bytes=0-3");
  });

  it("refuses a non-PDF payload with 415", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>landing page</html>", { status: 200 }));
    expect((await call(proxy, target("https://archive.org/details/id"))).status).toBe(415);
  });

  it("download mode sets an attachment filename", async () => {
    fetchMock.mockResolvedValueOnce(new Response(PDF_BYTES, { status: 200 }));
    const res = await call(download, `${target("https://archive.org/download/id/a.pdf")}&name=${encodeURIComponent("Signals & Systems")}`);
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="Signals_Systems.pdf"');
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("the deployed function is guarded: a request with no origin signal is refused before any fetch", async () => {
    const res = await pdfProxyGET(new Request(`https://maeacademy.org/api/pdf-proxy?${target("https://archive.org/download/id/a.pdf")}`));
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Vercel library catalog handlers", () => {
  it("resolve-pdfs validates ids and returns the archive.org download URL", async () => {
    expect((await handleResolvePdfs(new Request("https://x/api", { method: "POST", body: JSON.stringify({ ids: ["../etc"] }) }))).status).toBe(400);
    expect((await handleResolvePdfs(new Request("https://x/api", { method: "POST", body: "not json" }))).status).toBe(400);
    fetchMock.mockResolvedValueOnce(Response.json({ files: [{ name: "book.pdf", format: "Text PDF", size: "1000" }] }));
    const res = await handleResolvePdfs(new Request("https://x/api", { method: "POST", body: JSON.stringify({ ids: ["vercel-test-book"] }) }));
    expect(res.status).toBe(200);
    const { results } = (await res.json()) as { results: Record<string, string | null> };
    expect(results["vercel-test-book"]).toBe("https://archive.org/download/vercel-test-book/book.pdf");
    expect(String(fetchMock.mock.calls[0]![0])).toBe("https://archive.org/metadata/vercel-test-book");
  });

  it("cover rejects bad ids and serves archive.org images", async () => {
    expect((await handleCover(new Request("https://x/api?id=../x"))).status).toBe(404);
    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/jpeg" } }));
    const res = await handleCover(new Request("https://x/api?id=some-book"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=604800");
    expect(String(fetchMock.mock.calls[0]![0])).toBe("https://archive.org/services/img/some-book");
  });

  it("doab and doab-item validate input and pin directory.doabooks.org", async () => {
    expect((await handleDoabSearch(new Request("https://x/api?query="))).status).toBe(400);
    expect((await handleDoabItem(new Request("https://x/api?handle=../../x"))).status).toBe(400);
    fetchMock.mockResolvedValueOnce(Response.json([{ handle: "20.500.12854/1" }]));
    const res = await handleDoabSearch(new Request("https://x/api?query=vercel-test-control&limit=5"));
    expect(res.status).toBe(200);
    expect(new URL(String(fetchMock.mock.calls[0]![0])).host).toBe("directory.doabooks.org");
  });
});
