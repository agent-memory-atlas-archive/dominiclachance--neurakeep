import { describe, expect, it } from "vitest";
import { buildCtaPayload, trackCtaEvent } from "../src/web/src/analytics.js";

describe("web analytics CTA events", () => {
  it("builds payloads with page context, app surface, and event params", () => {
    const payload = buildCtaPayload(
      { section: "auth_gate", method: "google", skipped: undefined },
      { path: "/app", title: "NeuraKeep" }
    );
    expect(payload).toEqual({
      page_path: "/app",
      page_title: "NeuraKeep",
      app_surface: "hosted_app",
      section: "auth_gate",
      method: "google"
    });
  });

  it("sends events through gtag when the GA4 bootstrap is configured", () => {
    const calls: unknown[][] = [];
    const win = {
      gtag: (...args: unknown[]) => calls.push(args),
      location: { pathname: "/app" },
      document: { title: "NeuraKeep" }
    };
    expect(trackCtaEvent("hosted_beta_login_click", { section: "auth_gate", method: "google" }, win)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe("event");
    expect(calls[0][1]).toBe("hosted_beta_login_click");
    expect(calls[0][2]).toMatchObject({
      section: "auth_gate",
      method: "google",
      page_path: "/app",
      app_surface: "hosted_app"
    });
  });

  it("no-ops safely when gtag is absent or throws", () => {
    expect(trackCtaEvent("demo_sample_import_click", { section: "inbox" }, {})).toBe(false);
    expect(
      trackCtaEvent("demo_sample_import_click", { section: "inbox" }, {
        gtag: () => {
          throw new Error("blocked");
        }
      })
    ).toBe(false);
  });
});
