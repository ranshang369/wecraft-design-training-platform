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
    return { pairId: pair.id, status: pair.status, reviewerSubmissions: reviewerIds.size, reviewComplete, unanimous, voteCounts, normalizedPreferences, adjudicatedPreference: pair.adjudicatedPreference ?? null };
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
    pairs: pairSummaries,
  };
}
