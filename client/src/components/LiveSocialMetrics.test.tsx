// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  Odometer,
  organicIncrement,
  SocialMetricsBar,
  SocialPlatformBreakdown,
} from "./LiveSocialMetrics";
import i18n from "@/i18n/config";
import { INITIAL_SOCIAL_METRICS } from "@/data/socialMetricsData";

afterEach(async () => {
  cleanup();
  await act(async () => { await i18n.changeLanguage("en"); });
});

describe("SocialMetricsBar & SocialPlatformBreakdown Suite", () => {
  it("renders compact SocialMetricsBar with total views, community, reactions, and handle", () => {
    render(<SocialMetricsBar initialData={INITIAL_SOCIAL_METRICS} />);

    // Check presence of official handle
    expect(screen.getByText("@mae.academy")).toBeDefined();

    // Check label for total views
    expect(screen.getByText(/Total Views/i)).toBeDefined();

    // Check community and reaction stats
    expect(screen.getByText(/Community/i)).toBeDefined();
    expect(screen.getByText(/Reactions/i)).toBeDefined();
  });

  it("renders SocialPlatformBreakdown with verified platform links", () => {
    render(<SocialPlatformBreakdown initialData={INITIAL_SOCIAL_METRICS} />);

    // Check platform cards
    expect(screen.getByText("Instagram")).toBeDefined();
    expect(screen.getByText("Facebook")).toBeDefined();

    // Check verified profile links
    const igLink = screen.getByRole("link", { name: /Visit MAE Academy on Instagram/i });
    expect(igLink.getAttribute("href")).toBe("https://www.instagram.com/mae.academy/");

    const fbLink = screen.getByRole("link", { name: /Visit MAE Academy on Facebook/i });
    expect(fbLink.getAttribute("href")).toBe("https://web.facebook.com/search/top?q=mae%20academy");
  });
});

describe("Baseline data", () => {
  it("matches the official follower counts", () => {
    expect(INITIAL_SOCIAL_METRICS.instagram.followers).toBe(58240);
    expect(INITIAL_SOCIAL_METRICS.facebook.followers).toBe(59000);
  });
});

describe("Odometer", () => {
  it("exposes the full formatted value to assistive tech and renders one column per digit", () => {
    const { container } = render(<Odometer value={40528000} suffix="+" />);
    expect(screen.getByText("40,528,000+")).toBeDefined();
    expect(container.textContent).toBe("40,528,000+");
    expect(container.querySelectorAll('[aria-hidden="true"].overflow-hidden').length).toBe(8);
  });

  it("keeps digit columns mounted when the value changes (so they can roll)", () => {
    const { container, rerender } = render(<Odometer value={1299} />);
    const before = container.querySelectorAll(".overflow-hidden > span");
    rerender(<Odometer value={1300} />);
    const after = container.querySelectorAll(".overflow-hidden > span");
    expect(after.length).toBe(before.length);
    expect(Array.from(after).every((el, i) => el === before[i])).toBe(true);
  });
});

describe("organicIncrement", () => {
  it("never returns less than 1 and scales with velocity and elapsed time", () => {
    expect(organicIncrement(64, 100, 0)).toBe(1);
    const mid = organicIncrement(64, 60_000, 0.5);
    expect(mid).toBe(64);
    expect(organicIncrement(64, 120_000, 0.5)).toBeGreaterThan(mid);
  });
});

describe("Localization", () => {
  it("renders Spanish labels", async () => {
    await act(async () => { await i18n.changeLanguage("es"); });
    render(<SocialMetricsBar />);
    expect(screen.getByText("Vistas Totales")).toBeDefined();
    expect(screen.getByText("Comunidad")).toBeDefined();
  });

  it("renders Arabic labels", async () => {
    await act(async () => { await i18n.changeLanguage("ar"); });
    render(<SocialPlatformBreakdown />);
    expect(screen.getByText("حضور المنصات الرسمية")).toBeDefined();
    expect(screen.getByText("زيارة الحساب")).toBeDefined();
  });
});
