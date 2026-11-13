import { describe, expect, it } from "vitest";
import { aggregateReviewEvidence, latestReviewsByReviewer, type CaseReviewLike } from "@/lib/review-aggregation";

const dimensions = ["CONTENT_FIT", "VISUAL_MECHANISM", "TYPE_HIERARCHY", "IMAGE_NARRATIVE", "RHYTHM", "COMPLETION"] as const;

function review(reviewerId: string, value: number, overrides: Partial<CaseReviewLike> = {}): CaseReviewLike {
  return {
    reviewerId,
    version: 1,
    submittedAt: "2026-11-13T00:00:00.000Z",
    recommendation: "PUBLISHABLE",
    scores: dimensions.map((dimensionCode) => ({
      dimensionCode,
      score: dimensionCode === "IMAGE_NARRATIVE" ? null : value,
      isNa: dimensionCode === "IMAGE_NARRATIVE",
    })),
    ...overrides,
  };
}

describe("双评聚合", () => {
  it("同一评审修订后只采用最新版本，不能重复凑够两人", () => {
    const latest = latestReviewsByReviewer([
      review("reviewer-a", 5, { version: 1 }),
      review("reviewer-a", 3, { version: 2 }),
      review("reviewer-b", 4, { version: 1 }),
    ]);

    expect(latest).toHaveLength(2);
    expect(latest.find((item) => item.reviewerId === "reviewer-a")?.version).toBe(2);
  });

  it("取各维度中位数并计算六维门槛", () => {
    const evidence = aggregateReviewEvidence([review("reviewer-a", 5), review("reviewer-b", 4)]);

    expect(evidence.reviewers).toBe(2);
    expect(evidence.scores.CONTENT_FIT).toBe(4.5);
    expect(evidence.average).toBe(4.5);
    expect(evidence.publishable).toBe(true);
    expect(evidence.scoresComplete).toBe(true);
    expect(evidence.qualityFloorMet).toBe(true);
  });

  it("非 PUBLISHABLE 或中位分过低时不能成为训练样例", () => {
    const rejected = aggregateReviewEvidence([
      review("reviewer-a", 5),
      review("reviewer-b", 4, { recommendation: "CHANGES_REQUESTED" }),
    ]);
    expect(rejected.publishable).toBe(false);

    const lowQuality = aggregateReviewEvidence([review("reviewer-a", 3), review("reviewer-b", 3)]);
    expect(lowQuality.scoresComplete).toBe(true);
    expect(lowQuality.qualityFloorMet).toBe(false);
  });

  it("图像叙事 N/A 时仍可完成其余五维门槛", () => {
    const evidence = aggregateReviewEvidence([review("reviewer-a", 4), review("reviewer-b", 5)]);

    expect(evidence.scores.IMAGE_NARRATIVE).toBeUndefined();
    expect(evidence.average).toBe(4.5);
    expect(evidence.scoresComplete).toBe(true);
    expect(evidence.qualityFloorMet).toBe(true);
  });

  it("任一评审缺少必需维度或重复评分时不能由另一人的分数补齐", () => {
    const missing = review("reviewer-b", 5);
    missing.scores = missing.scores.filter((score) => score.dimensionCode !== "CONTENT_FIT");
    const incomplete = aggregateReviewEvidence([review("reviewer-a", 5), missing]);
    expect(incomplete.reviewers).toBe(2);
    expect(incomplete.scoresComplete).toBe(false);
    expect(incomplete.qualityFloorMet).toBe(false);

    const duplicated = review("reviewer-b", 5);
    duplicated.scores = [
      ...duplicated.scores,
      { dimensionCode: "CONTENT_FIT", score: 5, isNa: false },
    ];
    const ambiguous = aggregateReviewEvidence([review("reviewer-a", 5), duplicated]);
    expect(ambiguous.scoresComplete).toBe(false);
    expect(ambiguous.qualityFloorMet).toBe(false);
  });
});
