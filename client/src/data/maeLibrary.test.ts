import { describe, expect, it } from "vitest";
import { MAE_LIBRARY, findMaeItem, maeTypesWithItems, visibleMaeItems } from "./maeLibrary";

describe("MAE Library publishing rules", () => {
  it("shows no drafts in production, so no empty or placeholder entry is ever public", () => {
    expect(visibleMaeItems(false).every((item) => item.status === "published")).toBe(true);
    expect(findMaeItem("control-systems-course", false)).toBeUndefined();
  });

  it("gives every item a unique slug", () => {
    const slugs = MAE_LIBRARY.map((item) => item.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("never publishes an item that still has an owner placeholder, or lacks contents and a sample", () => {
    for (const item of MAE_LIBRARY.filter((entry) => entry.status === "published")) {
      const text = JSON.stringify(item);
      expect(text, item.slug).not.toContain("[OWNER TO WRITE]");
      expect(item.contents.length, item.slug).toBeGreaterThan(0);
      expect(item.sample.length, item.slug).toBeGreaterThan(0);
      expect(item.published && item.updated, item.slug).toBeTruthy();
      if (item.rights === "permission") expect(item.authors.length, item.slug).toBeGreaterThan(0);
    }
  });

  it("lists only categories that have items", () => {
    expect(maeTypesWithItems(visibleMaeItems(false))).toEqual([]);
    expect(maeTypesWithItems(visibleMaeItems(true)).length).toBeGreaterThan(0);
  });
});
