import { describe, expect, it } from "vitest";
import { can } from "@/lib/rbac";
import type { RoleCode } from "@prisma/client";

const roles = (...values: RoleCode[]) => values;

describe("权限矩阵", () => {
  it("只有 Owner / Design Lead 可以修改训练授权", () => {
    expect(can.editAuthorization(roles("OWNER"))).toBe(true);
    expect(can.editAuthorization(roles("DESIGN_LEAD"))).toBe(true);
    expect(can.editAuthorization(roles("ADMIN"))).toBe(false);
    expect(can.editAuthorization(roles("ANNOTATOR"))).toBe(false);
  });

  it("只有 Owner / Admin / Design Lead 可以导出数据集", () => {
    expect(can.exportDataset(roles("OWNER"))).toBe(true);
    expect(can.exportDataset(roles("ADMIN"))).toBe(true);
    expect(can.exportDataset(roles("DESIGN_LEAD"))).toBe(true);
    expect(can.exportDataset(roles("AI_ENGINEER"))).toBe(false);
  });

  it("AI 工程可提交候选但不能批准案例", () => {
    expect(can.submitCandidate(roles("AI_ENGINEER"))).toBe(true);
    expect(can.runHardCheck(roles("AI_ENGINEER"))).toBe(true);
    expect(can.approveCases(roles("AI_ENGINEER"))).toBe(false);
  });

  it("只读观察者没有写权限", () => {
    expect(can.editBriefs(roles("VIEWER"))).toBe(false);
    expect(can.editCases(roles("VIEWER"))).toBe(false);
    expect(can.manageExperiments(roles("VIEWER"))).toBe(false);
  });
});
