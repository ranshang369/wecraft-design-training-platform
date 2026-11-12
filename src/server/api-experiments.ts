import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, body, json } from "@/lib/api";
import { can, assertCapability, type AuthContext } from "@/lib/rbac";
import { appendAudit, requestMeta } from "@/lib/audit";
import { hashObject, sha256 } from "@/lib/hash";
import { saveFile } from "@/lib/storage";
import { executeHardCheckRun } from "@/lib/hard-check";
import { DIMENSION_CODES } from "@/lib/constants";
import { Prisma, type Candidate, type CandidateVersion } from "@prisma/client";
import { parseScreenshotDataUrl } from "@/lib/image";

const candidateSchema = z.object({
  title: z.string().min(1), briefId: z.string().uuid(), experimentId: z.string().uuid().optional().nullable(),
  modelProvider: z.string().min(1), modelName: z.string().min(1), modelVersion: z.string().min(1),
  html: z.string().min(20), screenshotDataUrl: z.string().startsWith("data:image/"),
});
const experimentSchema = z.object({
  name: z.string().min(1), briefId: z.string().uuid(), candidateIds: z.array(z.string().uuid()).min(2),
  reviewerIds: z.array(z.string().uuid()).min(2), adjudicatorId: z.string().uuid(),
});
const blindSubmitSchema = z.object({
  scores: z.object({ left: z.record(z.number().int().min(1).max(5)), right: z.record(z.number().int().min(1).max(5)) }),
  preference: z.enum(["LEFT","RIGHT","TIE"]), rationale: z.string().min(2), confidence: z.number().int().min(1).max(5),
  durationMs: z.number().int().nonnegative().optional(),
  hardCheckAcknowledged: z.boolean(),
  hardCheckNotes: z.string().max(2000).optional(),
});

function fullScores(value: Record<string, number>) {
  for (const code of DIMENSION_CODES) if (!(code in value)) throw new ApiError(400, "VALIDATION_ERROR", "缺少评分维度：" + code);
  for (const [code, score] of Object.entries(value)) {
    if (!DIMENSION_CODES.includes(code as typeof DIMENSION_CODES[number])) throw new ApiError(400, "VALIDATION_ERROR", "未知评分维度");
    if (!Number.isInteger(score) || score < 1 || score > 5) throw new ApiError(400, "VALIDATION_ERROR", "评分必须是 1–5 整数");
  }
}
async function nextNo(prefix: string, count: number) { return prefix + "-" + String(count + 1).padStart(4, "0"); }
function stableFlip(seed: string) {
  return parseInt(sha256(seed).slice(0, 2), 16) % 2 === 0;
}
function hideCandidate(candidate: Candidate) {
  return { id: candidate.id, candidateNo: candidate.candidateNo, status: candidate.status };
}
function isHoldoutAdmin(ctx: AuthContext) {
  return ctx.roles.includes("OWNER") || ctx.roles.includes("ADMIN");
}
function canViewCandidateStatus(roles: string[], status: string) {
  return !roles.includes("VIEWER") || ["READY_FOR_BLIND", "IN_BLIND", "COMPLETED"].includes(status);
}
async function candidateForResponse(candidateId: string, ctx: AuthContext) {
  const candidate = await prisma.candidate.findFirst({ where: { id: candidateId, workspaceId: ctx.workspaceId }, include: { versions: { orderBy: { version: "desc" }, take: 1 }, assets: { include: { storedFile: true } }, hardCheckRuns: { orderBy: { startedAt: "desc" }, take: 1, include: { checks: true } } } });
  if (!candidate) throw new ApiError(404, "NOT_FOUND", "候选不存在");
  const brief = await prisma.brief.findFirst({ where: { id: candidate.briefId, workspaceId: ctx.workspaceId, deletedAt: null }, select: { split: true } });
  if (!brief || (brief.split === "HOLDOUT" && !isHoldoutAdmin(ctx))) throw new ApiError(404, "NOT_FOUND", "候选不存在");
  if (!canViewCandidateStatus(ctx.roles, candidate.status)) throw new ApiError(404, "NOT_FOUND", "候选不存在");
  return candidate;
}
function latestBlockFailure(run: { checks: Array<{ severity: string; status: string; ruleId: string; message: string }> } | undefined) {
  return run?.checks.some((check) => check.severity === "BLOCK" && ["FAIL", "ERROR"].includes(check.status)) ?? true;
}
function canInspectExperiment(roles: string[]) {
  return roles.some((role) => ["OWNER","ADMIN","DESIGN_LEAD","AI_ENGINEER"].includes(role));
}
function publicHardCheck(run: { ruleId: string; severity: string; status: string; message: string }[] | undefined) {
  return (run ?? []).map(({ ruleId, severity, status, message }) => ({ ruleId, severity, status, message }));
}
function blindSide(version: CandidateVersion, assets: Array<{ kind: string; storedFileId: string }>, side: "A"|"B") {
  return {
    side,
    htmlFileId: assets.find((a) => a.kind === "HTML")?.storedFileId ?? null,
    screenshotFileId: assets.find((a) => a.kind === "SCREENSHOT_375")?.storedFileId ?? null,
    version: version.version,
  };
}
export async function handleExperiments(request: Request, segments: string[], method: string, ctx: AuthContext): Promise<Response | null> {
  const path = segments.join("/");
  const meta = requestMeta(request);
  if (path === "candidates" && method === "GET") {
    const where: Prisma.CandidateWhereInput = { workspaceId: ctx.workspaceId };
    if (!isHoldoutAdmin(ctx)) {
      const hiddenBriefs = await prisma.brief.findMany({ where: { workspaceId: ctx.workspaceId, split: "HOLDOUT" }, select: { id: true } });
      where.briefId = { notIn: hiddenBriefs.map((brief) => brief.id) };
    }
    if (ctx.roles.includes("VIEWER")) where.status = { in: ["READY_FOR_BLIND", "IN_BLIND", "COMPLETED"] };
    const list = await prisma.candidate.findMany({ where, include: { versions: { orderBy: { version: "desc" }, take: 1 }, hardCheckRuns: { orderBy: { startedAt: "desc" }, take: 1 } }, orderBy: { createdAt: "desc" } });
    const canSeeModel = ctx.roles.some((r) => ["OWNER","ADMIN","DESIGN_LEAD","AI_ENGINEER"].includes(r));
    return json(list.map((candidate) => ({ ...candidate, versions: candidate.versions.map((version) => ({ ...version, modelProvider: canSeeModel ? version.modelProvider : undefined, modelName: canSeeModel ? version.modelName : undefined, modelVersion: canSeeModel ? version.modelVersion : undefined })) })));
  }
  if (path === "candidates" && method === "POST") {
    assertCapability(can.submitCandidate(ctx.roles), "只有 AI 工程可以提交候选");
    const input = await body(request, candidateSchema);
    const brief = await prisma.brief.findFirst({ where: { id: input.briefId, workspaceId: ctx.workspaceId, deletedAt: null }, select: { split: true } });
    if (!brief || (brief.split === "HOLDOUT" && !isHoldoutAdmin(ctx))) throw new ApiError(404, "NOT_FOUND", "Brief 不存在");
    const screenshot = parseScreenshotDataUrl(input.screenshotDataUrl);
    const count = await prisma.candidate.count({ where: { workspaceId: ctx.workspaceId } });
    const created = await prisma.$transaction(async (tx) => {
      const candidate = await tx.candidate.create({ data: { workspaceId: ctx.workspaceId, candidateNo: await nextNo("CD", count), title: input.title, briefId: input.briefId, experimentId: input.experimentId || null, createdBy: ctx.userId, status: "SUBMITTED", submittedAt: new Date() } });
      const version = await tx.candidateVersion.create({ data: { candidateId: candidate.id, version: 1, html: input.html, modelProvider: input.modelProvider, modelName: input.modelName, modelVersion: input.modelVersion, contentHash: hashObject({ html: input.html, modelProvider: input.modelProvider, modelName: input.modelName, modelVersion: input.modelVersion }), createdBy: ctx.userId } });
      const screenshotFile = await saveFile({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, filename: candidate.candidateNo + "-375.png", mimeType: screenshot.mimeType, purpose: "CANDIDATE_SCREENSHOT", bytes: screenshot.bytes });
      const htmlFile = await saveFile({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, filename: candidate.candidateNo + ".html", mimeType: "text/html", purpose: "CANDIDATE_HTML", bytes: Buffer.from(input.html) });
      await tx.candidateAsset.create({ data: { candidateId: candidate.id, candidateVersionId: version.id, storedFileId: screenshotFile.id, kind: "SCREENSHOT_375", width: 375 } });
      await tx.candidateAsset.create({ data: { candidateId: candidate.id, candidateVersionId: version.id, storedFileId: htmlFile.id, kind: "HTML" } });
      await appendAudit(tx, { workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "CANDIDATE_SUBMITTED", resourceType: "CANDIDATE", resourceId: candidate.id, after: { title: input.title, modelProvider: input.modelProvider, modelName: input.modelName, modelVersion: input.modelVersion }, requestId: meta.requestId, ip: meta.ip, userAgent: meta.userAgent });
      return candidate;
    });
    return json(created, 201);
  }
  const candidateMatch = path.match(/^candidates\/([^/]+)(?:\/(hard-check|submit))?$/);
  if (candidateMatch) {
    const candidate = await candidateForResponse(candidateMatch[1], ctx);
    if (method === "GET" && !candidateMatch[2]) {
      const canSeeModel = ctx.roles.some((r) => ["OWNER","ADMIN","DESIGN_LEAD","AI_ENGINEER"].includes(r));
      return json({ ...candidate, versions: candidate.versions.map((version) => ({ ...version, modelProvider: canSeeModel ? version.modelProvider : undefined, modelName: canSeeModel ? version.modelName : undefined, modelVersion: canSeeModel ? version.modelVersion : undefined })) });
    }
    if (method === "POST" && candidateMatch[2] === "hard-check") {
      assertCapability(can.runHardCheck(ctx.roles), "只有 AI 工程可以运行硬检查");
      const result = await executeHardCheckRun(candidate.id, ctx.userId);
      await appendAudit(prisma, { workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "HARD_CHECK_RUN", resourceType: "CANDIDATE", resourceId: candidate.id, after: { ok: result.ok, runId: result.run.id }, requestId: meta.requestId, ip: meta.ip, userAgent: meta.userAgent });
      return json({ ok: result.ok, run: result.run, checks: result.checks });
    }
    if (method === "POST" && candidateMatch[2] === "submit") {
      assertCapability(can.submitCandidate(ctx.roles));
      const result = await executeHardCheckRun(candidate.id, ctx.userId);
      await appendAudit(prisma, { workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "CANDIDATE_HARD_CHECK_SUBMITTED", resourceType: "CANDIDATE", resourceId: candidate.id, after: { ok: result.ok }, requestId: meta.requestId, ip: meta.ip, userAgent: meta.userAgent });
      return json(result);
    }
  }

  if (path === "experiments" && method === "GET") {
    return json(await prisma.experiment.findMany({ where: { workspaceId: ctx.workspaceId }, include: { _count: { select: { pairs: true, candidates: true } } }, orderBy: { createdAt: "desc" } }));
  }
  if (path === "experiments" && method === "POST") {
    assertCapability(can.manageExperiments(ctx.roles));
    const input = await body(request, experimentSchema);
    const brief = await prisma.brief.findFirst({ where: { id: input.briefId, workspaceId: ctx.workspaceId, split: { not: "HOLDOUT" } }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
    if (!brief) throw new ApiError(404, "NOT_FOUND", "Brief 不存在或不可用于普通实验");
    const candidates = await prisma.candidate.findMany({ where: { id: { in: input.candidateIds }, workspaceId: ctx.workspaceId }, include: { versions: { orderBy: { version: "desc" }, take: 1 }, hardCheckRuns: { orderBy: { startedAt: "desc" }, take: 1, include: { checks: true } } } });
    if (candidates.length < 2) throw new ApiError(400, "VALIDATION_ERROR", "至少需要 2 个候选");
    for (const candidate of candidates) {
      if (candidate.briefId !== brief.id) throw new ApiError(409, "INVALID_STATE", candidate.candidateNo + " 与实验 Brief 不一致");
      if (candidate.status !== "READY_FOR_BLIND") throw new ApiError(409, "INVALID_STATE", candidate.candidateNo + " 尚未通过硬检查进入 READY_FOR_BLIND");
      if (latestBlockFailure(candidate.hardCheckRuns[0])) throw new ApiError(409, "HARD_CHECK_REQUIRED", candidate.candidateNo + " 最新硬检查未通过，不能进入盲测");
      if (!candidate.versions[0]) throw new ApiError(409, "INVALID_STATE", candidate.candidateNo + " 缺少版本");
    }
    for (const reviewerId of input.reviewerIds) {
      const membership = await prisma.membership.findFirst({ where: { userId: reviewerId, workspaceId: ctx.workspaceId, status: "ACTIVE" } });
      if (!membership) throw new ApiError(400, "VALIDATION_ERROR", "评审人不在 Workspace");
    }
    const adjudicatorMembership = await prisma.membership.findFirst({ where: { userId: input.adjudicatorId, workspaceId: ctx.workspaceId, status: "ACTIVE" } });
    if (!adjudicatorMembership) throw new ApiError(400, "VALIDATION_ERROR", "裁决人不在 Workspace");
    const count = await prisma.experiment.count({ where: { workspaceId: ctx.workspaceId } });
    const experiment = await prisma.$transaction(async (tx) => {
      const created = await tx.experiment.create({ data: { workspaceId: ctx.workspaceId, experimentNo: await nextNo("EX", count), name: input.name, status: "RUNNING", protocol: { reviewers: input.reviewerIds.length, adjudicator: 1, adjudicatorId: input.adjudicatorId, hideModel: true, hideSource: true, tieAllowed: true }, createdBy: ctx.userId, frozenAt: new Date(), startsAt: new Date() } });
      await tx.experimentBrief.create({ data: { experimentId: created.id, briefId: brief.id, briefVersionId: brief.versions[0].id } });
      const pair = await tx.experimentPair.create({ data: { workspaceId: ctx.workspaceId, experimentId: created.id, briefId: brief.id, pairNo: "P-0001", leftCandidateId: candidates[0].id, leftCandidateVersionId: candidates[0].versions[0].id, leftContentHash: candidates[0].versions[0].contentHash, rightCandidateId: candidates[1].id, rightCandidateVersionId: candidates[1].versions[0].id, rightContentHash: candidates[1].versions[0].contentHash, status: "READY" } });
      for (const candidate of candidates.slice(0, 2)) await tx.candidate.update({ where: { id: candidate.id }, data: { experimentId: created.id, status: "IN_BLIND" } });
      for (const reviewerId of input.reviewerIds) await tx.reviewTask.create({ data: { workspaceId: ctx.workspaceId, type: "BLIND_PAIRWISE", subjectType: "EXPERIMENT_PAIR", subjectId: pair.id, experimentPairId: pair.id, assigneeId: reviewerId, reviewRole: "REVIEWER", status: "ASSIGNED", assignedBy: ctx.userId, blindPolicySnapshot: { hideModel: true, hideSource: true, hidePreviousScores: true, revealAfterReviewers: 2 } } });
      await tx.reviewTask.create({ data: { workspaceId: ctx.workspaceId, type: "ARBITRATION", subjectType: "EXPERIMENT_PAIR", subjectId: pair.id, experimentPairId: pair.id, assigneeId: input.adjudicatorId, reviewRole: "ADJUDICATOR", status: "ASSIGNED", assignedBy: ctx.userId } });
      await appendAudit(tx, { workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "EXPERIMENT_CREATED", resourceType: "EXPERIMENT", resourceId: created.id, after: input, requestId: meta.requestId, ip: meta.ip, userAgent: meta.userAgent });
      return created;
    });
    return json(experiment, 201);
  }
  const experimentMatch = path.match(/^experiments\/([^/]+)(?:\/(close|blind|results))?$/);
  if (experimentMatch) {
    const experiment = await prisma.experiment.findFirst({ where: { id: experimentMatch[1], workspaceId: ctx.workspaceId }, include: { pairs: true, briefs: { include: { brief: { include: { versions: { orderBy: { version: "desc" }, take: 1 } } } } }, candidates: { include: { versions: { orderBy: { version: "desc" }, take: 1 } } } } });
    if (!experiment) throw new ApiError(404, "NOT_FOUND", "实验不存在");
    if (method === "GET" && !experimentMatch[2]) {
      if (!canInspectExperiment(ctx.roles)) {
        return json({ id: experiment.id, experimentNo: experiment.experimentNo, name: experiment.name, status: experiment.status, rubricVersion: experiment.rubricVersion, protocol: { hideModel: true, hideSource: true, hidePreviousScores: true }, startsAt: experiment.startsAt, closesAt: experiment.closesAt, pairs: experiment.pairs.map((pair) => ({ id: pair.id, pairNo: pair.pairNo, status: pair.status })), briefs: experiment.briefs.map((entry) => ({ briefId: entry.briefId, briefVersionId: entry.briefVersionId })) });
      }
      return json(experiment);
    }
    if (method === "POST" && experimentMatch[2] === "close") {
      assertCapability(can.manageExperiments(ctx.roles));
      const incomplete = experiment.pairs.filter((p) => !["COMPLETED","CANCELLED"].includes(p.status));
      if (incomplete.length) throw new ApiError(409, "INVALID_STATE", "仍有未完成的 pair");
      const updated = await prisma.$transaction(async (tx) => {
        const changed = await tx.experiment.update({ where: { id: experiment.id }, data: { status: "CLOSED", closedAt: new Date() } });
        await tx.candidate.updateMany({ where: { id: { in: experiment.candidates.map((c) => c.id) }, status: "IN_BLIND" }, data: { status: "COMPLETED" } });
        await appendAudit(tx, { workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "EXPERIMENT_CLOSED", resourceType: "EXPERIMENT", resourceId: experiment.id, requestId: meta.requestId, ip: meta.ip, userAgent: meta.userAgent });
        return changed;
      });
      return json(updated);
    }
    if (method === "GET" && experimentMatch[2] === "results") {
      if (!canInspectExperiment(ctx.roles)) throw new ApiError(403, "FORBIDDEN", "盲测结果仅对实验管理角色开放");
      if (experiment.status !== "CLOSED") throw new ApiError(409, "BLIND_ACTIVE", "盲测尚未关闭，不能查看结果");
      const comparisons = await prisma.pairwiseComparison.findMany({ where: { experimentId: experiment.id, status: "SUBMITTED" }, include: { scores: true } });
      return json({ experiment, comparisons });
    }
    if (method === "GET" && experimentMatch[2] === "blind") {
      const assignedPairIds = canInspectExperiment(ctx.roles) ? null : (await prisma.reviewTask.findMany({ where: { workspaceId: ctx.workspaceId, assigneeId: ctx.userId, type: "BLIND_PAIRWISE", experimentPairId: { not: null } }, select: { experimentPairId: true } })).map((task) => task.experimentPairId!).filter(Boolean);
      const pairs = await prisma.experimentPair.findMany({ where: { experimentId: experiment.id, ...(assignedPairIds ? { id: { in: assignedPairIds } } : {}) }, include: { comparisons: { where: { reviewerId: ctx.userId, status: "SUBMITTED" } } } });
      return json({ experiment: { id: experiment.id, experimentNo: experiment.experimentNo, name: experiment.name, status: experiment.status }, pairs: pairs.map((p) => ({ id: p.id, pairNo: p.pairNo, status: p.status, submitted: p.comparisons.length > 0 })) });
    }
  }
  const blindMatch = path.match(/^experiments\/([^/]+)\/pairs\/([^/]+)\/blind$/);
  if (blindMatch) {
    const pair = await prisma.experimentPair.findFirst({ where: { id: blindMatch[2], experimentId: blindMatch[1], workspaceId: ctx.workspaceId } });
    if (!pair) throw new ApiError(404, "NOT_FOUND", "盲测 pair 不存在");
    const task = await prisma.reviewTask.findFirst({ where: { workspaceId: ctx.workspaceId, experimentPairId: pair.id, assigneeId: ctx.userId, type: "BLIND_PAIRWISE" } });
    if (!task) throw new ApiError(403, "FORBIDDEN", "你不是该 pair 的被分配评审");
    const left = await candidateForResponse(pair.leftCandidateId, ctx);
    const right = await candidateForResponse(pair.rightCandidateId, ctx);
    const existing = await prisma.pairwiseComparison.findFirst({ where: { taskId: task.id, status: "SUBMITTED" }, include: { scores: true } });
    const flip = stableFlip(task.id + ctx.userId);
    const leftCandidate = flip ? right : left;
    const rightCandidate = flip ? left : right;
    const leftVersion = leftCandidate.versions[0];
    const rightVersion = rightCandidate.versions[0];
    const payload = {
      pairId: pair.id, pairNo: pair.pairNo, taskId: task.id, taskStatus: task.status,
      experimentStatus: (await prisma.experiment.findUniqueOrThrow({ where: { id: pair.experimentId } })).status,
      submitted: Boolean(existing),
      existing: existing ? { preference: existing.preference, rationale: existing.rationale, confidence: existing.confidence, scores: existing.scores, hardCheckAcknowledged: existing.hardCheckAcknowledged, hardCheckNotes: existing.hardCheckNotes } : null,
      brief: await prisma.brief.findUnique({ where: { id: pair.briefId }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } }).then((b) => b ? { briefNo: b.briefNo, title: b.title, content: b.versions[0] } : null),
      left: blindSide(leftVersion, leftCandidate.assets, "A"),
      right: blindSide(rightVersion, rightCandidate.assets, "B"),
      hardChecks: { left: publicHardCheck(leftCandidate.hardCheckRuns[0]?.checks), right: publicHardCheck(rightCandidate.hardCheckRuns[0]?.checks) },
      reveal: (await prisma.experiment.findUniqueOrThrow({ where: { id: pair.experimentId } })).status === "CLOSED" ? { leftCandidateId: leftCandidate.id, rightCandidateId: rightCandidate.id } : null,
    };
    if (method === "GET") return json(payload);
    if (method === "POST") {
      if (existing) throw new ApiError(409, "INVALID_STATE", "盲测评分已提交，不能原地修改");
      if (task.status === "SUBMITTED") throw new ApiError(409, "INVALID_STATE", "任务已提交");
      const input = await body(request, blindSubmitSchema);
      fullScores(input.scores.left); fullScores(input.scores.right);
      if (input.preference === "TIE" && input.rationale.trim().length < 2) throw new ApiError(400, "VALIDATION_ERROR", "平票必须填写理由");
      if (!input.hardCheckAcknowledged) throw new ApiError(400, "HARD_CHECK_REQUIRED", "必须先核对双方硬检查结果并确认");
      if (latestBlockFailure(left.hardCheckRuns[0]) || latestBlockFailure(right.hardCheckRuns[0])) throw new ApiError(409, "HARD_CHECK_FAILED", "至少一侧候选存在 BLOCK 硬检查失败，不能评分");
      const presentedLeftCandidateId = flip ? pair.rightCandidateId : pair.leftCandidateId;
      const presentedRightCandidateId = flip ? pair.leftCandidateId : pair.rightCandidateId;
      const preferredCandidateId = input.preference === "LEFT" ? presentedLeftCandidateId : input.preference === "RIGHT" ? presentedRightCandidateId : null;
      const comparison = await prisma.$transaction(async (tx) => {
        const created = await tx.pairwiseComparison.create({ data: { workspaceId: ctx.workspaceId, experimentId: pair.experimentId, experimentPairId: pair.id, taskId: task.id, reviewerId: ctx.userId, presentedLeftCandidateId, presentedRightCandidateId, preference: input.preference, preferredCandidateId, rationale: input.rationale, confidence: input.confidence, blindPayloadHash: hashObject({ pairId: pair.id, taskId: task.id, reviewerId: ctx.userId }), durationMs: input.durationMs, hardCheckAcknowledged: true, hardCheckNotes: input.hardCheckNotes } });
        const rows = [];
        for (const [side, scores] of [["LEFT", input.scores.left], ["RIGHT", input.scores.right]] as const) for (const [dimensionCode, score] of Object.entries(scores)) rows.push({ comparisonId: created.id, side, dimensionCode, score });
        await tx.pairwiseScore.createMany({ data: rows });
        await tx.reviewTask.update({ where: { id: task.id }, data: { status: "SUBMITTED", submittedAt: new Date() } });
        await appendAudit(tx, { workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "BLIND_COMPARISON_SUBMITTED", resourceType: "EXPERIMENT_PAIR", resourceId: pair.id, after: { preference: input.preference, confidence: input.confidence }, requestId: meta.requestId, ip: meta.ip, userAgent: meta.userAgent });
        return created;
      });
      const submitted = await prisma.pairwiseComparison.count({ where: { experimentPairId: pair.id, status: "SUBMITTED" } });
      if (submitted >= 2) {
        await prisma.experimentPair.update({ where: { id: pair.id }, data: { status: "IN_PROGRESS" } });
        const existingAdjudicator = await prisma.reviewTask.findFirst({ where: { type: "ARBITRATION", subjectId: pair.id, status: { in: ["ASSIGNED","PENDING","IN_PROGRESS"] } } });
        if (!existingAdjudicator) {
          const experiment = await prisma.experiment.findUniqueOrThrow({ where: { id: pair.experimentId } });
          const protocol = experiment.protocol as Record<string, unknown>;
          const preferred = typeof protocol.adjudicatorId === "string" ? protocol.adjudicatorId : null;
          const owner = preferred ? null : await prisma.user.findFirst({ where: { memberships: { some: { workspaceId: ctx.workspaceId, status: "ACTIVE", roles: { some: { role: { code: "OWNER" } } } } } } });
          const adjudicatorId = preferred ?? owner?.id;
          if (adjudicatorId) await prisma.reviewTask.create({ data: { workspaceId: ctx.workspaceId, type: "ARBITRATION", subjectType: "EXPERIMENT_PAIR", subjectId: pair.id, experimentPairId: pair.id, assigneeId: adjudicatorId, reviewRole: "ADJUDICATOR", status: "ASSIGNED", assignedBy: ctx.userId } });
        }
      }
      return json(comparison, 201);
    }
  }
  return null;
}

