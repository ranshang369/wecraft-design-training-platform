import { ApiError } from "./api";

export const EXPERIMENT_PROTOCOL_VERSION = "blind-v2";
export const MIN_BLIND_REVIEWERS = 2;
export const MAX_BLIND_REVIEWERS = 3;

export type ExperimentProtocolType = "DEV" | "HOLDOUT";

export type ExperimentProtocol = {
  version: typeof EXPERIMENT_PROTOCOL_VERSION;
  type: ExperimentProtocolType;
  reviewers: number;
  reviewerIds: string[];
  adjudicator: 1;
  adjudicatorId: string;
  hideModel: true;
  hideSource: true;
  hidePreviousScores: true;
  revealAfterReviewers: number;
  tieAllowed: true;
  arbitrationTrigger: "ALL_REVIEWERS_SUBMITTED";
  frozenAt: string;
};

export function assertIndependentExperimentParticipants(reviewerIds: string[], adjudicatorId: string) {
  if (reviewerIds.length < MIN_BLIND_REVIEWERS || reviewerIds.length > MAX_BLIND_REVIEWERS) {
    throw new ApiError(400, "VALIDATION_ERROR", `盲测必须配置 ${MIN_BLIND_REVIEWERS}–${MAX_BLIND_REVIEWERS} 名独立评审`);
  }
  if (new Set(reviewerIds).size !== reviewerIds.length) {
    throw new ApiError(400, "VALIDATION_ERROR", "同一成员不能重复担任评审");
  }
  if (reviewerIds.includes(adjudicatorId)) {
    throw new ApiError(400, "VALIDATION_ERROR", "裁决人不能同时担任该实验的评审");
  }
}

export function buildExperimentProtocol(input: {
  type: ExperimentProtocolType;
  reviewerIds: string[];
  adjudicatorId: string;
  now?: Date;
}): ExperimentProtocol {
  assertIndependentExperimentParticipants(input.reviewerIds, input.adjudicatorId);
  const reviewerIds = [...input.reviewerIds];
  return {
    version: EXPERIMENT_PROTOCOL_VERSION,
    type: input.type,
    reviewers: reviewerIds.length,
    reviewerIds,
    adjudicator: 1,
    adjudicatorId: input.adjudicatorId,
    hideModel: true,
    hideSource: true,
    hidePreviousScores: true,
    revealAfterReviewers: reviewerIds.length,
    tieAllowed: true,
    arbitrationTrigger: "ALL_REVIEWERS_SUBMITTED",
    frozenAt: (input.now ?? new Date()).toISOString(),
  };
}

export function experimentReviewerCount(protocol: unknown) {
  if (!protocol || typeof protocol !== "object") return MIN_BLIND_REVIEWERS;
  const reviewers = (protocol as { reviewers?: unknown }).reviewers;
  return Number.isInteger(reviewers) && Number(reviewers) >= MIN_BLIND_REVIEWERS ? Number(reviewers) : MIN_BLIND_REVIEWERS;
}

export function experimentProtocolType(protocol: unknown): ExperimentProtocolType {
  return protocol && typeof protocol === "object" && (protocol as { type?: unknown }).type === "HOLDOUT" ? "HOLDOUT" : "DEV";
}

export function isBlindProtocolComplete(protocol: unknown, submittedReviewers: number) {
  return submittedReviewers >= experimentReviewerCount(protocol);
}

export function blindPolicySnapshot(protocol: ExperimentProtocol) {
  return {
    protocolVersion: protocol.version,
    type: protocol.type,
    hideModel: protocol.hideModel,
    hideSource: protocol.hideSource,
    hidePreviousScores: protocol.hidePreviousScores,
    revealAfterReviewers: protocol.revealAfterReviewers,
    arbitrationTrigger: protocol.arbitrationTrigger,
  };
}
