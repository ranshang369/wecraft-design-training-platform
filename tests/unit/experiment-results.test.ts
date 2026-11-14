import { describe, expect, it } from "vitest";
import { EXPERIMENT_SAMPLE_TARGET, inferCandidateWinRates, normalizeComparisonPreference, summarizeBlindResults } from "@/lib/experiment-results";

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

  it("按 pair 级裁决计算候选胜率，平票计半分且小样本不得宣称优势", () => {
    const summary = summarizeBlindResults([pair], [comparison("r1", "left"), comparison("r2", "right")], 2);
    const left = summary.inference.candidates.find((candidate) => candidate.candidateId === "left");
    expect(left?.winRate).toBe(1);
    expect(left?.pairs).toBe(1);
    expect(left?.evidenceStatus).toBe("INSUFFICIENT_SAMPLE");
    expect(summary.inference.sampleSufficient).toBe(false);
    expect(summary.inference.tiePolicy).toBe("HALF_WIN");
  });

  it("达到 30 个完整 pair 后才允许进入可解释区间", () => {
    const pairs = Array.from({ length: EXPERIMENT_SAMPLE_TARGET }, (_, index) => ({ status: "COMPLETED", leftCandidateId: "left", rightCandidateId: "right", adjudicatedPreference: index < 27 ? "LEFT" : index < 29 ? "TIE" : "RIGHT" }));
    const inference = inferCandidateWinRates(pairs);
    const left = inference.candidates.find((candidate) => candidate.candidateId === "left");
    expect(inference.sampleSufficient).toBe(true);
    expect(left?.pairs).toBe(EXPERIMENT_SAMPLE_TARGET);
    expect(left?.wins).toBe(27);
    expect(left?.ties).toBe(2);
    expect(left?.winRate).toBeCloseTo(28 / 30, 5);
    expect(left?.confidenceInterval.lower).toBeGreaterThan(0.5);
    expect(left?.evidenceStatus).toBe("OBSERVED_BENEFIT");
  });

  it("确定性 bootstrap 在相同数据上返回相同区间", () => {
    const pairs = Array.from({ length: EXPERIMENT_SAMPLE_TARGET }, (_, index) => ({ status: "COMPLETED", leftCandidateId: "left", rightCandidateId: "right", adjudicatedPreference: index % 3 === 0 ? "RIGHT" : index % 3 === 1 ? "TIE" : "LEFT" }));
    expect(inferCandidateWinRates(pairs)).toEqual(inferCandidateWinRates(pairs));
  });
});
