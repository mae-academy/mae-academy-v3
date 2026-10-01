import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SIMULATOR_SEO } from "./simulatorSeoData";

const publicDir = resolve(__dirname, "../../public");

describe("sitemap and robots", () => {
  it("lists every simulator tool canonical URL", () => {
    const xml = readFileSync(resolve(publicDir, "sitemap.xml"), "utf8");
    const missing = SIMULATOR_SEO.filter((e) => !xml.includes(`<loc>https://maeacademy.org${e.path}</loc>`)).map((e) => e.path);
    expect(missing).toEqual([]);
  });
  it("points robots.txt at the sitemap without blocking simulators", () => {
    const robots = readFileSync(resolve(publicDir, "robots.txt"), "utf8");
    expect(robots).toContain("Sitemap: https://maeacademy.org/sitemap.xml");
    const disallows = robots.split("\n").filter((l) => l.startsWith("Disallow:") && l.trim() !== "Disallow:");
    expect(disallows).toEqual(["Disallow: /api/"]);
  });
});
