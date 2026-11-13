import { DIMENSION_CODES } from "./constants";

export const MIN_CASE_REVIEWERS = 2;
export const MIN_REVIEW_AVERAGE = 4;
export const MIN_REVIEW_DIMENSION = 3;

const REQUIRED_SCORE_DIMENSIONS = DIMENSION_CODES.filter((code) => code !== "IMAGE_NARRATIVE");

export interface ReviewScoreLike {
  dimensionCode: string;
  score: number | null;
  isNa: boolean;
}

export interface CaseReviewLike {
  reviewerId: string;
  version?: number;
  submittedAt?: Date | string;
  recommendation: string;
  scores: ReviewScoreLike[];
}

export interface AggregatedReviewEvidence {
  reviewers: number;
  recommendations: string[];
  scores: Record<string, number>;
  average: number | null;
  publishable: boolean;
  scoresComplete: boolean;
  qualityFloorMet: boolean;
}

function submittedTime(review: CaseReviewLike): number {
  if (!review.submittedAt) return 0;
  const value = new Date(review.submittedAt).getTime();
  return Number.isFinite(value) ? value : 0;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (!sorted.length) return 0;
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function validDimensionScore(score: ReviewScoreLike): boolean {
  return !score.isNa
    && score.score !== null
    && Number.isFinite(score.score)
    && score.score >= 1
    && score.score <= 5;
}

/**
 * A reviewer may revise a review. Only the newest submitted version from each
 * reviewer counts, otherwise one person could satisfy the two-review gate.
 */
export function latestReviewsByReviewer<T extends CaseReviewLike>(reviews: readonly T[]): T[] {
  const latest = new Map<string, T>();
  for (const review of [...reviews].sort((left, right) => (
    (right.version ?? 0) - (left.version ?? 0)
    || submittedTime(right) - submittedTime(left)
    || left.reviewerId.localeCompare(right.reviewerId)
  ))) {
    if (!latest.has(review.reviewerId)) latest.set(review.reviewerId, review);
  }
  return [...latest.values()].sort((left, right) => left.reviewerId.localeCompare(right.reviewerId));
}

/**
 * Turns independent reviews into one audit-friendly signal. Medians resist a
 * single generous or harsh reviewer, and the publication/score floors stop a
 * merely "acceptable" case from becoming a design exemplar.
 */
export function aggregateReviewEvidence(
  reviews: readonly CaseReviewLike[],
): AggregatedReviewEvidence {
  const latest = latestReviewsByReviewer(reviews);
  const scores: Record<string, number> = {};
  for (const code of DIMENSION_CODES) {
    const values = latest.flatMap((review) => review.scores
      .filter((score) => score.dimensionCode === code && validDimensionScore(score))
      .map((score) => score.score as number));
    if (values.length) scores[code] = median(values);
  }
  const recommendations = latest.map((review) => review.recommendation.trim().toUpperCase());
  const scoreValues = Object.values(scores);
  const average = scoreValues.length
    ? scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length
    : null;
  const everyReviewerComplete = latest.length >= MIN_CASE_REVIEWERS && latest.every((review) => (
    REQUIRED_SCORE_DIMENSIONS.every((code) => (
      review.scores.filter((score) => score.dimensionCode === code && validDimensionScore(score)).length === 1
    ))
  ));
  const scoresComplete = everyReviewerComplete
    && REQUIRED_SCORE_DIMENSIONS.every((code) => scores[code] !== undefined);
  return {
    reviewers: latest.length,
    recommendations,
    scores,
    average,
    publishable: latest.length >= MIN_CASE_REVIEWERS
      && recommendations.length >= MIN_CASE_REVIEWERS
      && recommendations.every((value) => value === "PUBLISHABLE"),
    scoresComplete,
    qualityFloorMet: scoresComplete
      && average !== null
      && average >= MIN_REVIEW_AVERAGE
      && scoreValues.every((score) => score >= MIN_REVIEW_DIMENSION),
  };
}
