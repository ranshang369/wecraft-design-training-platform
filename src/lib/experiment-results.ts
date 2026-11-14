export type BlindPairLike = {
  id: string;
  leftCandidateId: string;
  rightCandidateId: string;
  status: string;
  adjudicatedPreference?: string | null;
};

export type BlindComparisonLike = {
  experimentPairId: string;
  reviewerId: string;
  preference: string;
  preferredCandidateId: string | null;
  presentedLeftCandidateId: string;
  presentedRightCandidateId: string;
};

export type NormalizedPreference = "LEFT" | "RIGHT" | "TIE";

export const EXPERIMENT_SAMPLE_TARGET = 30;
export const EXPERIMENT_CONFIDENCE_LEVEL = 0.95;
const BOOTSTRAP_SAMPLES = 10_000;
const TIE_POLICY = "HALF_WIN" as const;

type CandidateInference = {
  candidateId: string;
  pairs: number;
  wins: number;
  losses: number;
  ties: number;
  winRate: number;
  confidenceInterval: { lower: number; upper: number; level: number };
  tieRate: number;
  evidenceStatus: "INSUFFICIENT_SAMPLE" | "OBSERVED_BENEFIT" | "OBSERVED_HARM" | "INCONCLUSIVE";
};

function deterministicSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomGenerator(seedText: string) {
  let state = deterministicSeed(seedText);
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(sorted: number[], ratio: number) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)));
  return sorted[index];
}

function bootstrapMeanInterval(outcomes: number[], seedText: string) {
  if (outcomes.length === 0) return { lower: 0, upper: 0, level: EXPERIMENT_CONFIDENCE_LEVEL };
  const random = randomGenerator(seedText);
  const means: number[] = [];
  for (let sample = 0; sample < BOOTSTRAP_SAMPLES; sample++) {
    let total = 0;
    for (let index = 0; index < outcomes.length; index++) total += outcomes[Math.floor(random() * outcomes.length)];
    means.push(total / outcomes.length);
  }
  means.sort((left, right) => left - right);
  const tail = (1 - EXPERIMENT_CONFIDENCE_LEVEL) / 2;
  return { lower: percentile(means, tail), upper: percentile(means, 1 - tail), level: EXPERIMENT_CONFIDENCE_LEVEL };
}

export function inferCandidateWinRates(pairSummaries: Array<{ status: string; leftCandidateId: string; rightCandidateId: string; adjudicatedPreference: string | null }>) {
  const eligible = pairSummaries.filter((pair) => pair.status === "COMPLETED" && ["LEFT", "RIGHT", "TIE"].includes(pair.adjudicatedPreference ?? ""));
  const byCandidate = new Map<string, number[]>();
  const counts = new Map<string, { wins: number; losses: number; ties: number }>();
  for (const pair of eligible) {
    const leftOutcome = pair.adjudicatedPreference === "LEFT" ? 1 : pair.adjudicatedPreference === "TIE" ? 0.5 : 0;
    const rightOutcome = 1 - leftOutcome;
    for (const [candidateId, outcome] of [[pair.leftCandidateId, leftOutcome], [pair.rightCandidateId, rightOutcome]] as const) {
      byCandidate.set(candidateId, [...(byCandidate.get(candidateId) ?? []), outcome]);
      const current = counts.get(candidateId) ?? { wins: 0, losses: 0, ties: 0 };
      if (outcome === 1) current.wins++;
      else if (outcome === 0) current.losses++;
      else current.ties++;
      counts.set(candidateId, current);
    }
  }
  const candidates: CandidateInference[] = [...byCandidate.entries()].map(([candidateId, outcomes]) => {
    const count = counts.get(candidateId) ?? { wins: 0, losses: 0, ties: 0 };
    const winRate = outcomes.reduce((sum, value) => sum + value, 0) / outcomes.length;
    const confidenceInterval = bootstrapMeanInterval(outcomes, "wecraft-experiment:" + candidateId);
    const sampleSufficient = outcomes.length >= EXPERIMENT_SAMPLE_TARGET;
    const evidenceStatus: CandidateInference["evidenceStatus"] = !sampleSufficient
      ? "INSUFFICIENT_SAMPLE"
      : confidenceInterval.lower > 0.5
        ? "OBSERVED_BENEFIT"
        : confidenceInterval.upper < 0.5
          ? "OBSERVED_HARM"
          : "INCONCLUSIVE";
    return { candidateId, pairs: outcomes.length, ...count, winRate, confidenceInterval, tieRate: count.ties / outcomes.length, evidenceStatus };
  }).sort((left, right) => right.winRate - left.winRate || right.pairs - left.pairs);
  return {
    method: "PAIR_LEVEL_PERCENTILE_BOOTSTRAP",
    bootstrapSamples: BOOTSTRAP_SAMPLES,
    sampleTarget: EXPERIMENT_SAMPLE_TARGET,
    sampleSufficient: eligible.length >= EXPERIMENT_SAMPLE_TARGET,
    pairsUsed: eligible.length,
    tiePolicy: TIE_POLICY,
    confidenceLevel: EXPERIMENT_CONFIDENCE_LEVEL,
    candidates,
  };
}

export function normalizeComparisonPreference(comparison: BlindComparisonLike, pairLeftCandidateId: string, pairRightCandidateId: string): NormalizedPreference {
  if (comparison.preference === "TIE" || !comparison.preferredCandidateId) return "TIE";
  if (comparison.preferredCandidateId === pairLeftCandidateId) return "LEFT";
  if (comparison.preferredCandidateId === pairRightCandidateId) return "RIGHT";
  return "TIE";
}

export function summarizeBlindResults(pairs: BlindPairLike[], comparisons: BlindComparisonLike[], reviewerTarget: number) {
  const byPair = new Map<string, BlindComparisonLike[]>();
  for (const comparison of comparisons) byPair.set(comparison.experimentPairId, [...(byPair.get(comparison.experimentPairId) ?? []), comparison]);
  const pairSummaries = pairs.map((pair) => {
    const rows = byPair.get(pair.id) ?? [];
    const reviewerIds = new Set(rows.map((row) => row.reviewerId));
    const normalizedPreferences = rows.map((row) => normalizeComparisonPreference(row, pair.leftCandidateId, pair.rightCandidateId));
    const voteCounts = {
      left: normalizedPreferences.filter((value) => value === "LEFT").length,
      right: normalizedPreferences.filter((value) => value === "RIGHT").length,
      tie: normalizedPreferences.filter((value) => value === "TIE").length,
    };
    const reviewComplete = reviewerIds.size >= reviewerTarget;
    const unanimous = reviewComplete && normalizedPreferences.length > 0 && normalizedPreferences.every((value) => value === normalizedPreferences[0]) && normalizedPreferences[0] !== "TIE";
    return { pairId: pair.id, status: pair.status, leftCandidateId: pair.leftCandidateId, rightCandidateId: pair.rightCandidateId, reviewerSubmissions: reviewerIds.size, reviewComplete, unanimous, voteCounts, normalizedPreferences, adjudicatedPreference: pair.adjudicatedPreference ?? null };
  });
  const completePairs = pairSummaries.filter((pair) => pair.reviewComplete);
  const adjudicated = pairSummaries.filter((pair) => pair.adjudicatedPreference !== null);
  return {
    pairCount: pairs.length,
    reviewerTarget,
    reviewerSubmissions: comparisons.length,
    completePairs: completePairs.length,
    reviewCoverage: pairs.length ? completePairs.length / pairs.length : 0,
    unanimousPairs: completePairs.filter((pair) => pair.unanimous).length,
    agreementRate: completePairs.length ? completePairs.filter((pair) => pair.unanimous).length / completePairs.length : null,
    adjudicatedPairs: adjudicated.length,
    adjudicationCounts: {
      left: adjudicated.filter((pair) => pair.adjudicatedPreference === "LEFT").length,
      right: adjudicated.filter((pair) => pair.adjudicatedPreference === "RIGHT").length,
      tie: adjudicated.filter((pair) => pair.adjudicatedPreference === "TIE").length,
    },
    inference: inferCandidateWinRates(pairSummaries),
    pairs: pairSummaries,
  };
}
