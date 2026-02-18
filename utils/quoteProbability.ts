import { ROUND_LOCK_WINDOW_MS } from "../constants/shorts";

interface ProbabilityBounds {
  min: number;
  max: number;
}

export interface UpProbabilityParams {
  openPrice: number | null;
  latestPrice: number | null;
  roundProgress: number;
  roundDurationMs: number;
  noise?: number;
}

const QUOTE_SENSITIVITY = 1000;
const QUOTE_URGENCY_MIN = 0.6;
const QUOTE_URGENCY_MAX = 3.0;
const QUOTE_URGENCY_POWER = 2.6;
const EARLY_MIN_PROBABILITY = 0.2;
const EARLY_MAX_PROBABILITY = 0.8;
const FINAL_MIN_PROBABILITY = 0.15;
const FINAL_MAX_PROBABILITY = 0.85;
const BOUNDS_RELEASE_WINDOW_MS = 5000;
const BOUNDS_RELEASE_POWER = 1.6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getQuoteUrgency(roundProgress: number): number {
  const normalizedProgress = clamp(roundProgress, 0, 1);
  const easedProgress = Math.pow(normalizedProgress, QUOTE_URGENCY_POWER);
  return (
    QUOTE_URGENCY_MIN + (QUOTE_URGENCY_MAX - QUOTE_URGENCY_MIN) * easedProgress
  );
}

function getProbabilityBounds(
  roundProgress: number,
  roundDurationMs: number,
): ProbabilityBounds {
  // Keep quotes in a human range most of the round, then widen gradually near expiry.
  const normalizedProgress = clamp(roundProgress, 0, 1);
  const releaseWindowMs = Math.max(
    BOUNDS_RELEASE_WINDOW_MS,
    ROUND_LOCK_WINDOW_MS,
  );
  const safeDurationMs = Math.max(roundDurationMs, releaseWindowMs);
  const boundsReleaseStartProgress = clamp(
    1 - releaseWindowMs / safeDurationMs,
    0,
    1,
  );

  if (normalizedProgress <= boundsReleaseStartProgress) {
    return {
      min: EARLY_MIN_PROBABILITY,
      max: EARLY_MAX_PROBABILITY,
    };
  }

  const normalizedLateProgress = clamp(
    (normalizedProgress - boundsReleaseStartProgress) /
      Math.max(1 - boundsReleaseStartProgress, Number.EPSILON),
    0,
    1,
  );
  const lateProgress = Math.pow(normalizedLateProgress, BOUNDS_RELEASE_POWER);

  return {
    min:
      EARLY_MIN_PROBABILITY +
      (FINAL_MIN_PROBABILITY - EARLY_MIN_PROBABILITY) * lateProgress,
    max:
      EARLY_MAX_PROBABILITY +
      (FINAL_MAX_PROBABILITY - EARLY_MAX_PROBABILITY) * lateProgress,
  };
}

export function getUpProbability({
  openPrice,
  latestPrice,
  roundProgress,
  roundDurationMs,
  noise = 0,
}: UpProbabilityParams): number {
  if (
    typeof openPrice !== "number" ||
    typeof latestPrice !== "number" ||
    openPrice <= 0
  ) {
    return 0.5;
  }

  const pctChange = (latestPrice - openPrice) / openPrice;
  const urgency = getQuoteUrgency(roundProgress);
  const signal = pctChange * QUOTE_SENSITIVITY * urgency;
  const bounds = getProbabilityBounds(roundProgress, roundDurationMs);
  return clamp(0.5 + signal + noise, bounds.min, bounds.max);
}
