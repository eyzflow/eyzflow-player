import { describe, expect, it } from "vitest";
import { withTargeting } from "./ad-tag";

describe("withTargeting", () => {
  it("adds cust_params to a tag without any", () => {
    const out = new URL(withTargeting("https://ads.example.com/gampad/ads?iu=/1/x&sz=640x480", { plan: "basic-ads", access: "svod" }));
    expect(out.searchParams.get("iu")).toBe("/1/x");
    expect(new URLSearchParams(out.searchParams.get("cust_params")!).get("plan")).toBe("basic-ads");
    expect(new URLSearchParams(out.searchParams.get("cust_params")!).get("access")).toBe("svod");
  });

  it("keeps the tag's own cust_params and lets them win", () => {
    const tag = "https://ads.example.com/ads?cust_params=" + encodeURIComponent("genre=drama&plan=fixed");
    const params = new URLSearchParams(new URL(withTargeting(tag, { plan: "basic-ads", access: "svod" })).searchParams.get("cust_params")!);
    expect(params.get("genre")).toBe("drama");
    expect(params.get("plan")).toBe("fixed");
    expect(params.get("access")).toBe("svod");
  });

  it("leaves the tag alone with nothing to add or when it is not a URL", () => {
    expect(withTargeting("https://ads.example.com/ads?a=1", {})).toBe("https://ads.example.com/ads?a=1");
    expect(withTargeting("not a url", { plan: "x" })).toBe("not a url");
  });
});
