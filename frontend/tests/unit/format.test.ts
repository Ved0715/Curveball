import { describe, expect, it } from "vitest";
import { ApiError, friendlyError, toApiError } from "@/lib/errors";
import { formatClock, shortRound, streamPercent, toneFor } from "@/lib/format";

describe("format helpers", () => {
  it("tones match the prototype thresholds", () => {
    expect(toneFor(75, 100)).toBe("good");
    expect(toneFor(5, 10)).toBe("warn");
    expect(toneFor(4, 10)).toBe("bad");
  });

  it("formats clock and progress", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(125)).toBe("2:05");
    expect(streamPercent(100_000, 5000)).toBe(97);
    expect(shortRound("Coding (talk through your approach)")).toBe("Coding");
  });
});

describe("errors", () => {
  it("never shows raw errors", () => {
    expect(friendlyError(new Error("boom stack trace"))).not.toContain("boom");
    expect(friendlyError(new ApiError("rate_limited"))).toMatch(/wait/i);
  });

  it("classifies aborts and network failures", () => {
    expect(toApiError(new DOMException("x", "AbortError")).code).toBe("cancelled");
    expect(toApiError(new TypeError("Failed to fetch")).code).toBe("network");
  });
});
