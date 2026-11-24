export type VoiceProfile = {
  low: number;
  mid: number;
  high: number;
  tone: number;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const average = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

/** Maps the fundamental voice frequency (70–350 Hz) to the grave–agudo palette. */
export function normalizePitch(pitch: number) {
  return clamp01(Math.log2(pitch / 70) / Math.log2(350 / 70));
}

export function analyzeVoice(bands: number[], pitch?: number): VoiceProfile {
  const clean = bands.map((value) =>
    Number.isFinite(value) ? clamp01(value) : 0,
  );

  if (!clean.length) return { low: 0, mid: 0, high: 0, tone: 0.35 };

  const groupSize = Math.max(1, Math.ceil(clean.length / 3));
  const low = average(clean.slice(0, groupSize));
  const mid = average(clean.slice(groupSize, groupSize * 2));
  const high = average(clean.slice(groupSize * 2));
  const total = clean.reduce((sum, value) => sum + value, 0);
  const weightedTone = clean.reduce(
    (sum, value, index) =>
      sum + value * (clean.length > 1 ? index / (clean.length - 1) : 0.5),
    0,
  );
  const spectralTone = total > 0.0001 ? weightedTone / total : 0.35;

  return {
    low,
    mid,
    high,
    tone:
      typeof pitch === "number" && Number.isFinite(pitch) && pitch > 0
        ? normalizePitch(pitch)
        : spectralTone,
  };
}
