import { describe, expect, it } from "vitest";
import {
  EXPERIMENT_PROTOCOL_VERSION,
  blindPolicySnapshot,
  buildExperimentProtocol,
  experimentProtocolType,
  experimentReviewerCount,
  isBlindProtocolComplete,
} from "@/lib/experiment-protocol";

const reviewers = [
  "00000000-0000-4000-8000-000000000101",
  "00000000-0000-4000-8000-000000000102",
  "00000000-0000-4000-8000-000000000103",
];
const adjudicator = "00000000-0000-4000-8000-000000000104";

describe("盲测实验协议", () => {
  it("冻结 2–3 名独立评审的实际人数和揭示阈值", () => {
    const protocol = buildExperimentProtocol({ type: "DEV", reviewerIds: reviewers, adjudicatorId: adjudicator, now: new Date("2026-11-14T00:00:00Z") });
    expect(protocol.version).toBe(EXPERIMENT_PROTOCOL_VERSION);
    expect(protocol.reviewers).toBe(3);
    expect(protocol.revealAfterReviewers).toBe(3);
    expect(protocol.arbitrationTrigger).toBe("ALL_REVIEWERS_SUBMITTED");
    expect(blindPolicySnapshot(protocol).revealAfterReviewers).toBe(3);
  });

  it("拒绝重复评审和兼任裁决人", () => {
    expect(() => buildExperimentProtocol({ type: "DEV", reviewerIds: [reviewers[0], reviewers[0]], adjudicatorId: adjudicator })).toThrow("不能重复");
    expect(() => buildExperimentProtocol({ type: "DEV", reviewerIds: reviewers.slice(0, 2), adjudicatorId: reviewers[1] })).toThrow("裁决人不能同时");
  });

  it("拒绝少于 2 名或多于 3 名评审", () => {
    expect(() => buildExperimentProtocol({ type: "DEV", reviewerIds: [reviewers[0]], adjudicatorId: adjudicator })).toThrow("2–3");
    expect(() => buildExperimentProtocol({ type: "DEV", reviewerIds: [...reviewers, adjudicator], adjudicatorId: "00000000-0000-4000-8000-000000000105" })).toThrow("2–3");
  });

  it("兼容历史实验的两人协议，并只承认全部评审提交后完成", () => {
    expect(experimentReviewerCount({ reviewers: 2 })).toBe(2);
    expect(experimentReviewerCount({})).toBe(2);
    expect(isBlindProtocolComplete({ reviewers: 3 }, 2)).toBe(false);
    expect(isBlindProtocolComplete({ reviewers: 3 }, 3)).toBe(true);
  });

  it("HOLDOUT 类型可被稳定识别", () => {
    const protocol = buildExperimentProtocol({ type: "HOLDOUT", reviewerIds: reviewers.slice(0, 2), adjudicatorId: adjudicator });
    expect(experimentProtocolType(protocol)).toBe("HOLDOUT");
    expect(blindPolicySnapshot(protocol).type).toBe("HOLDOUT");
  });
});
