import { describe, expect, it } from "vitest";
import { analyzeVoice, normalizePitch } from "./audio-analysis";

describe("voice colour analysis", () => {
  it("maps energy concentrated in low bands to the grave end", () => {
    expect(analyzeVoice([1, 1, 1, 0, 0, 0, 0, 0, 0]).tone).toBeCloseTo(0.125);
  });

  it("maps energy concentrated in high bands to the agudo end", () => {
    expect(analyzeVoice([0, 0, 0, 0, 0, 0, 1, 1, 1]).tone).toBeCloseTo(0.875);
  });

  it("maps 70 Hz to the deepest colour", () => {
    expect(normalizePitch(70)).toBe(0);
  });

  it("maps 350 Hz to the highest colour", () => {
    expect(normalizePitch(350)).toBe(1);
  });

  it("uses pitch instead of band distribution when pitch is available", () => {
    expect(analyzeVoice([1, 1, 1, 0, 0, 0], 350).tone).toBe(1);
  });
});
