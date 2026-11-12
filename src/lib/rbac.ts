import type { RoleCode } from "@prisma/client";
import { ApiError } from "./api";

export type AuthContext = {
  userId: string;
  workspaceId: string;
  email: string;
  name: string;
  roles: RoleCode[];
};

export const can = {
  manageMembers: (roles: RoleCode[]) => roles.some((r) => ["OWNER", "ADMIN"].includes(r)),
  viewMembers: (roles: RoleCode[]) => roles.some((r) => ["OWNER", "ADMIN", "DESIGN_LEAD", "CONTENT_LEAD", "AI_ENGINEER"].includes(r)),
  editBriefs: (roles: RoleCode[]) => roles.some((r) => ["OWNER", "CONTENT_LEAD", "EDITOR"].includes(r)),
  approveBriefs: (roles: RoleCode[]) => roles.some((r) => ["OWNER", "DESIGN_LEAD", "CONTENT_LEAD"].includes(r)),
  editCases: (roles: RoleCode[]) => roles.some((r) => ["OWNER", "DESIGN_LEAD", "ANNOTATOR"].includes(r)),
  editCounterexamples: (roles: RoleCode[]) => roles.some((r) => ["OWNER", "DESIGN_LEAD", "ANNOTATOR", "AI_ENGINEER"].includes(r)),
  approveCases: (roles: RoleCode[]) => roles.some((r) => ["OWNER", "DESIGN_LEAD"].includes(r)),
  editAuthorization: (roles: RoleCode[]) => roles.some((r) => ["OWNER", "DESIGN_LEAD"].includes(r)),
  assignReviews: (roles: RoleCode[]) => roles.some((r) => ["OWNER", "DESIGN_LEAD", "CONTENT_LEAD"].includes(r)),
  submitCandidate: (roles: RoleCode[]) => roles.includes("AI_ENGINEER"),
  runHardCheck: (roles: RoleCode[]) => roles.includes("AI_ENGINEER"),
  manageExperiments: (roles: RoleCode[]) => roles.some((r) => ["OWNER", "DESIGN_LEAD", "AI_ENGINEER"].includes(r)),
  createDataset: (roles: RoleCode[]) => roles.some((r) => ["OWNER", "DESIGN_LEAD", "AI_ENGINEER"].includes(r)),
  approveDataset: (roles: RoleCode[]) => roles.some((r) => ["OWNER", "DESIGN_LEAD"].includes(r)),
  exportDataset: (roles: RoleCode[]) => roles.some((r) => ["OWNER", "ADMIN", "DESIGN_LEAD"].includes(r)),
  viewAudit: (roles: RoleCode[]) => roles.some((r) => ["OWNER", "ADMIN", "DESIGN_LEAD", "CONTENT_LEAD"].includes(r)),
  adjudicate: (roles: RoleCode[]) => roles.some((r) => ["OWNER", "DESIGN_LEAD", "CONTENT_LEAD"].includes(r)),
};

export function hasAnyRole(roles: RoleCode[], allowed: RoleCode[]) {
  return roles.some((role) => allowed.includes(role));
}

export function assertCapability(value: boolean, message = "权限不足") {
  if (!value) throw new ApiError(403, "FORBIDDEN", message);
}

