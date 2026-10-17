import { describe, expect, it } from "vitest";
import { describeCounts } from "#/lib/library-overview";

describe("describeCounts", () => {
  it("reads like the spec example", () => {
    expect(
      describeCounts({ name: "samples", photoCount: 5, sidecarCount: 5 })
    ).toBe("5 photos, 5 with Sidecar");
  });

  it("uses the singular for one Photo", () => {
    expect(describeCounts({ name: "x", photoCount: 1, sidecarCount: 0 })).toBe(
      "1 photo, 0 with Sidecar"
    );
  });
});
