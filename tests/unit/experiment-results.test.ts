import { describe, expect, it } from "vitest";
import { normalizeComparisonPreference, summarizeBlindResults } from "@/lib/experiment-results";

const pair = { id: "pair-1", leftCandidateId: "left", rightCandidateId: "right", status: "COMPLETED", adjudicatedPreference: "LEFT" };
function comparison(reviewerId: string, preferredCandidateId: string | null, presentedLeftCandidateId = "left", presentedRightCandidateId = "right") {
  return { experimentPairId: "pair-1", reviewerId, preference: preferredCandidateId ? (preferredCandidateId === presentedLeftCandidateId ? "LEFT" : "RIGHT") : "TIE", preferredCandidateId, presentedLeftCandidateId, presentedRightCandidateId };
}

describe("盲测结果归一化", () => {
  it("把左右翻转后的呈现偏好还原为候选 A/B", () => {
    expect(normalizeComparisonPreference(comparison("r1", "right", "right", "left"), "left", "right")).toBe("RIGHT");
    expect(normalizeComparisonPreference(comparison("r2", "left", "right", "left"), "left", "right")).toBe("LEFT");
    expect(normalizeComparisonPreference(comparison("r3", null), "left", "right")).toBe("TIE");
  });

  it("输出评审覆盖、一致率和裁决分布", () => {
    const summary = summarizeBlindResults([pair], [comparison("r1", "left"), comparison("r2", "left", "right", "left")], 2);
    expect(summary.completePairs).toBe(1);
    expect(summary.reviewCoverage).toBe(1);
    expect(summary.unanimousPairs).toBe(1);
    expect(summary.agreementRate).toBe(1);
    expect(summary.adjudicationCounts.left).toBe(1);
    expect(summary.pairs[0].reviewerSubmissions).toBe(2);
  });

  it("不足实际评审人数时不把 pair 标记为完成或一致", () => {
    const summary = summarizeBlindResults([pair], [comparison("r1", "left")], 3);
    expect(summary.completePairs).toBe(0);
    expect(summary.unanimousPairs).toBe(0);
    expect(summary.agreementRate).toBeNull();
  });
});
