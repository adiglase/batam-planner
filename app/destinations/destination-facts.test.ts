import { describe, expect, it } from "vitest";

import {
  describeEntryCost,
  describeOperatingHours,
  formatIdr,
  formatVisitDuration,
} from "./destination-facts";

describe("describeEntryCost", () => {
  it("recognizes free entry", () => {
    expect(describeEntryCost("Free")).toEqual({ kind: "free" });
  });

  it("recognizes a fixed IDR amount", () => {
    expect(describeEntryCost("IDR 10,000")).toEqual({
      kind: "fixed",
      amountIdr: 10000,
    });
  });

  it("recognizes an ungrouped fixed IDR amount", () => {
    expect(describeEntryCost("IDR 50000")).toEqual({
      kind: "fixed",
      amountIdr: 50000,
    });
  });

  it("recognizes an IDR range with a repeated currency", () => {
    expect(describeEntryCost("IDR 30,000 - IDR 50,000")).toEqual({
      kind: "range",
      minIdr: 30000,
      maxIdr: 50000,
    });
  });

  it("recognizes an IDR range with an en dash and one currency", () => {
    expect(describeEntryCost("IDR 30,000–50,000")).toEqual({
      kind: "range",
      minIdr: 30000,
      maxIdr: 50000,
    });
  });

  it("recognizes unknown cost", () => {
    expect(describeEntryCost("Cost unknown")).toEqual({ kind: "unknown" });
  });

  it("keeps an optional qualification separate from the amount", () => {
    expect(describeEntryCost("IDR 150,000 per person")).toEqual({
      kind: "fixed",
      amountIdr: 150000,
      qualification: "per person",
    });
    expect(describeEntryCost("Free for children under five")).toEqual({
      kind: "free",
      qualification: "for children under five",
    });
  });
});

describe("describeOperatingHours", () => {
  it("represents explicitly unknown hours", () => {
    expect(describeOperatingHours("Hours unknown")).toEqual({
      kind: "unknown",
    });
  });

  it("represents hours without meaningful restriction", () => {
    expect(describeOperatingHours("No meaningful restriction")).toEqual({
      kind: "unrestricted",
    });
  });

  it("keeps curated period labels as given", () => {
    expect(describeOperatingHours("08:00-20:00")).toEqual({
      kind: "periods",
      text: "08:00-20:00",
    });
    expect(describeOperatingHours("Open daily, 06:00–18:00")).toEqual({
      kind: "periods",
      text: "Open daily, 06:00–18:00",
    });
  });
});

describe("formatVisitDuration", () => {
  it("formats minutes under an hour", () => {
    expect(formatVisitDuration(45)).toBe("45 min");
  });

  it("formats whole hours", () => {
    expect(formatVisitDuration(60)).toBe("1 hr");
    expect(formatVisitDuration(120)).toBe("2 hr");
  });

  it("formats mixed hours and minutes", () => {
    expect(formatVisitDuration(90)).toBe("1 hr 30 min");
  });
});

describe("formatIdr", () => {
  it("groups thousands with the IDR currency", () => {
    expect(formatIdr(10000)).toBe("IDR 10,000");
    expect(formatIdr(150000)).toBe("IDR 150,000");
  });
});
