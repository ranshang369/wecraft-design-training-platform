import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, body, json } from "@/lib/api";
import { can, assertCapability, type AuthContext } from "@/lib/rbac";
import { appendAudit, requestMeta } from "@/lib/audit";
import { createExport, validateDataset } from "@/lib/dataset";
import { readStoredFile } from "@/lib/storage";
import { safeHtml, PREVIEW_CSP } from "@/lib/sanitize";
import { DIMENSIONS } from "@/lib/constants";
import { allocateDocumentNumber } from "@/lib/document-number";

const datasetCreateSchema = z.object({
  name: z.string().min(1), type: z.enum(["TRAIN","EVAL"]),
  caseIds: z.array(z.string().uuid()).default([]), briefIds: z.array(z.string().uuid()).default([]),
  counterexampleIds: z.array(z.string().uuid()).default([]), candidateIds: z.array(z.string().uuid()).default([]),
});
function isHoldoutAdmin(ctx: AuthContext) {
  return ctx.roles.includes("OWNER") || ctx.roles.includes("ADMIN");
}
async function canAccessStoredFile(ctx: AuthContext, fileId: string) {
  const file = await prisma.storedFile.findFirst({
    where: { id: fileId, workspaceId: ctx.workspaceId, deletedAt: null },
    include: {
      caseAssets: { include: { case: { select: { status: true, brief: { select: { split: true } } } } } },
      counterexampleAssets: { include: { counterexample: { select: { status: true, brief: { select: { split: true } } } } } },
      candidateAssets: { include: { candidate: { select: { status: true, briefId: true } } } },
    },
  });
  if (!file || file.purpose === "DATASET") return false;
  const holdoutAdmin = isHoldoutAdmin(ctx);
  const viewer = ctx.roles.includes("VIEWER");
  for (const asset of file.caseAssets) {
    if (asset.case.brief?.split === "HOLDOUT" && !holdoutAdmin) continue;
    if (viewer && asset.case.status !== "ELIGIBLE") continue;
    return true;
  }
  for (const asset of file.counterexampleAssets) {
    if (asset.counterexample.brief?.split === "HOLDOUT" && !holdoutAdmin) continue;
    if (viewer && asset.counterexample.status !== "APPROVED") continue;
    return true;
  }
  const candidateBriefs = file.candidateAssets.length ? await prisma.brief.findMany({ where: { id: { in: file.candidateAssets.map((asset) => asset.candidate.briefId) }, split: "HOLDOUT" }, select: { id: true } }) : [];
  const holdoutCandidateBriefIds = new Set(candidateBriefs.map((brief) => brief.id));
  const holdoutCandidateIds = new Set(file.candidateAssets.filter((asset) => holdoutCandidateBriefIds.has(asset.candidate.briefId)).map((asset) => asset.candidateId));
  const assignedHoldoutCandidateIds = new Set<string>();
  if (!holdoutAdmin && holdoutCandidateIds.size) {
    const pairs = await prisma.experimentPair.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        experiment: { status: "RUNNING" },
        OR: [{ leftCandidateId: { in: [...holdoutCandidateIds] } }, { rightCandidateId: { in: [...holdoutCandidateIds] } }],
      },
      select: { id: true, leftCandidateId: true, rightCandidateId: true },
    });
    const assignedPairIds = new Set((await prisma.reviewTask.findMany({
      where: { workspaceId: ctx.workspaceId, assigneeId: ctx.userId, type: "BLIND_PAIRWISE", experimentPairId: { in: pairs.map((pair) => pair.id) } },
      select: { experimentPairId: true },
    })).map((task) => task.experimentPairId).filter(Boolean));
    for (const pair of pairs) {
      if (!assignedPairIds.has(pair.id)) continue;
      assignedHoldoutCandidateIds.add(pair.leftCandidateId);
      assignedHoldoutCandidateIds.add(pair.rightCandidateId);
    }
  }
  for (const asset of file.candidateAssets) {
    if (holdoutCandidateBriefIds.has(asset.candidate.briefId) && !holdoutAdmin && !assignedHoldoutCandidateIds.has(asset.candidateId)) continue;
    if (viewer && !["READY_FOR_BLIND", "IN_BLIND", "COMPLETED"].includes(asset.candidate.status)) continue;
    return true;
  }
  return false;
}
export async function handleData(request: Request, segments: string[], method: string, ctx: AuthContext): Promise<Response | null> {
  const path = segments.join("/");
  const meta = requestMeta(request);
  if (path === "dashboard" && method === "GET") {
    const canSeeHoldout = ctx.roles.includes("OWNER") || ctx.roles.includes("ADMIN");
    const holdoutBrief = canSeeHoldout ? {} : { split: { not: "HOLDOUT" as const } };
    const holdoutCase = canSeeHoldout ? {} : { OR: [{ briefId: null }, { brief: { split: { not: "HOLDOUT" as const } } }] };
    const holdoutCounterexample = canSeeHoldout ? {} : { OR: [{ briefId: null }, { brief: { split: { not: "HOLDOUT" as const } } }] };
    const hiddenBriefIds = canSeeHoldout ? [] : (await prisma.brief.findMany({ where: { workspaceId: ctx.workspaceId, split: "HOLDOUT" }, select: { id: true } })).map((brief) => brief.id);
    const holdoutCandidate = canSeeHoldout ? {} : { briefId: { notIn: hiddenBriefIds } };
    const holdoutDataset = canSeeHoldout ? {} : { items: { none: { split: "HOLDOUT" as const } } };
    const [briefs, cases, counterexamples, candidates, comparisons, datasetCount] = await Promise.all([
      prisma.brief.findMany({ where: { workspaceId: ctx.workspaceId, deletedAt: null, ...holdoutBrief } }),
      prisma.case.findMany({ where: { workspaceId: ctx.workspaceId, deletedAt: null, ...holdoutCase }, include: { versions: { orderBy: { version: "desc" }, take: 1 }, reviews: { where: { status: "SUBMITTED" }, include: { scores: true } } } }),
      prisma.counterexample.findMany({ where: { workspaceId: ctx.workspaceId, deletedAt: null, ...holdoutCounterexample } }),
      prisma.candidate.findMany({ where: { workspaceId: ctx.workspaceId, ...holdoutCandidate }, include: { hardCheckRuns: { orderBy: { startedAt: "desc" }, take: 1, include: { checks: true } } } }),
      prisma.pairwiseComparison.findMany({ where: { workspaceId: ctx.workspaceId, status: "SUBMITTED" } }),
      prisma.dataset.count({ where: { workspaceId: ctx.workspaceId, deletedAt: null, ...holdoutDataset } }),
    ]);
    const grants = await prisma.authorizationGrant.findMany({ where: { workspaceId: ctx.workspaceId, subjectType: "CASE" } });
    const grantMap = new Map(grants.map((g) => [g.subjectId, g]));
    const coverage = Object.fromEntries(["SELF_REFERENTIAL","MATERIAL","SCENE","GENRE","SCHEMA","INTERFACE","CITATION","PSYCHOLOGICAL","PROCESS"].map((archetype) => [archetype, { approved: cases.filter((c) => c.archetype === archetype && c.status === "ELIGIBLE").length, target: 4 }]));
    const eligible = cases.filter((c) => c.status === "ELIGIBLE");
    const authorizationComplete = eligible.filter((c) => { const g = grantMap.get(c.id); return g?.evidenceStatus === "VERIFIED"; }).length;
    const currentReviews = (c: typeof cases[number]) => c.reviews.filter((review) => review.caseVersionId === c.versions[0]?.id);
    const reviewComplete = cases.filter((c) => new Set(currentReviews(c).map((r) => r.reviewerId)).size >= 2).length;
    let pairs = 0, agreements = 0, diffSum = 0, diffCount = 0;
    const byCase = new Map<string, typeof cases[number]["reviews"]>();
    for (const c of cases) { const reviews = currentReviews(c); if (reviews.length >= 2) byCase.set(c.id, reviews); }
    for (const reviews of byCase.values()) {
      const a = reviews[0], b = reviews[1]; pairs++;
      if (a?.recommendation === b?.recommendation) agreements++;
      for (const dim of DIMENSIONS) {
        const sa = a?.scores.find((s) => s.dimensionCode === dim.code)?.score;
        const sb = b?.scores.find((s) => s.dimensionCode === dim.code)?.score;
        if (sa != null && sb != null) { diffSum += Math.abs(sa - sb); diffCount++; }
      }
    }
    const checked = candidates.filter((c) => c.hardCheckRuns.length > 0);
    const hardFailures = checked.filter((c) => c.hardCheckRuns[0].checks.some((check) => check.severity === "BLOCK" && ["FAIL","ERROR"].includes(check.status))).length;
    const decisive = comparisons.filter((c) => c.preference !== "TIE").length;
    const ties = comparisons.filter((c) => c.preference === "TIE").length;
    const appearances = new Map<string, number>();
    const preferenceWins = new Map<string, number>();
    for (const comparison of comparisons) {
      for (const id of [comparison.presentedLeftCandidateId, comparison.presentedRightCandidateId]) appearances.set(id, (appearances.get(id) ?? 0) + 1);
      if (comparison.preferredCandidateId) preferenceWins.set(comparison.preferredCandidateId, (preferenceWins.get(comparison.preferredCandidateId) ?? 0) + 1);
    }
    const winners = candidates.filter((candidate) => appearances.has(candidate.id)).map((candidate) => { const wins = preferenceWins.get(candidate.id) ?? 0; const shown = appearances.get(candidate.id) ?? 0; return { candidateNo: candidate.candidateNo, title: candidate.title, wins, appearances: shown, winRate: shown ? wins / shown : 0 }; }).sort((a, b) => b.winRate - a.winRate);
    const readiness = {
      cases: { current: eligible.length, target: 30 },
      counterexamples: { current: counterexamples.filter((c) => c.status === "APPROVED").length, target: 10 },
      goldenBriefs: { current: briefs.filter((b) => b.purpose !== "CASE_SOURCE").length, target: 60 },
    };
    const coveredArchetypes = Object.values(coverage).filter((row) => row.approved >= 3).length;
    const gateChecks = [
      { id: "eligible_cases", label: "优质案例达到 30 个", current: readiness.cases.current, target: readiness.cases.target, passed: readiness.cases.current >= readiness.cases.target },
      { id: "counterexamples", label: "已批准反例达到 10 个", current: readiness.counterexamples.current, target: readiness.counterexamples.target, passed: readiness.counterexamples.current >= readiness.counterexamples.target },
      { id: "golden_briefs", label: "黄金 Brief 达到 60 个", current: readiness.goldenBriefs.current, target: readiness.goldenBriefs.target, passed: readiness.goldenBriefs.current >= readiness.goldenBriefs.target },
      { id: "archetype_coverage", label: "9 个主型各至少 3 个已批准案例", current: coveredArchetypes, target: 9, passed: coveredArchetypes === 9 },
      { id: "authorization", label: "已批准案例授权证据 100% 核验", current: authorizationComplete, target: eligible.length, passed: eligible.length > 0 && authorizationComplete === eligible.length },
      { id: "reviews", label: "全部案例完成两名独立评审", current: reviewComplete, target: cases.length, passed: cases.length > 0 && reviewComplete === cases.length },
    ];
    return json({
      workspaceId: ctx.workspaceId,
      counts: { briefs: briefs.length, cases: cases.length, counterexamples: counterexamples.length, eligibleCases: eligible.length, candidates: candidates.length, datasets: datasetCount },
      coverage,
      authorization: { complete: authorizationComplete, eligible: eligible.length, rate: eligible.length ? authorizationComplete / eligible.length : 0 },
      reviews: { complete: reviewComplete, total: cases.length, rate: cases.length ? reviewComplete / cases.length : 0 },
      consistency: { pairs, agreement: pairs ? agreements / pairs : 0, meanAbsoluteDifference: diffCount ? diffSum / diffCount : null, sampleSufficient: pairs >= 2 },
      hardChecks: { checked: checked.length, failed: hardFailures, failureRate: checked.length ? hardFailures / checked.length : 0 },
      blind: { comparisons: comparisons.length, ties, decisive, tieRate: comparisons.length ? ties / comparisons.length : 0, decisiveRate: comparisons.length ? decisive / comparisons.length : 0, winners },
      readiness,
      dataGate: { ready: gateChecks.every((check) => check.passed), checks: gateChecks },
    });
  }

  if (path === "datasets" && method === "GET") {
    const holdoutFilter = isHoldoutAdmin(ctx) ? {} : { items: { none: { split: "HOLDOUT" as const } } };
    return json(await prisma.dataset.findMany({ where: { workspaceId: ctx.workspaceId, deletedAt: null, ...holdoutFilter }, include: { _count: { select: { items: true, exports: true } } }, orderBy: { createdAt: "desc" } }));
  }
  if (path === "datasets" && method === "POST") {
    assertCapability(can.createDataset(ctx.roles));
    const input = await body(request, datasetCreateSchema);
    const canSeeHoldout = isHoldoutAdmin(ctx);
    const dataset = await prisma.$transaction(async (tx) => {
      const created = await tx.dataset.create({ data: { workspaceId: ctx.workspaceId, datasetNo: await allocateDocumentNumber(tx, ctx.workspaceId, "DS"), name: input.name, type: input.type, status: "DRAFT", filterSnapshot: input, createdBy: ctx.userId } });
      let order = 0;
      for (const caseId of input.caseIds ?? []) {
        const c = await tx.case.findFirst({ where: { id: caseId, workspaceId: ctx.workspaceId, deletedAt: null }, include: { brief: { select: { split: true } }, versions: { orderBy: { version: "desc" }, take: 1 } } });
        if (!c || (c.brief?.split === "HOLDOUT" && !canSeeHoldout)) throw new ApiError(404, "NOT_FOUND", "案例不存在");
        await tx.datasetItem.create({ data: { workspaceId: ctx.workspaceId, datasetId: created.id, itemType: "CASE", caseId, split: c.brief?.split ?? "DEV", snapshot: { caseId, caseNo: c.caseNo, title: c.title, version: c.currentVersion }, contentHash: c.versions[0]?.contentHash ?? "", rightsSnapshot: {}, sortOrder: order++ } });
      }
      for (const briefId of input.briefIds ?? []) {
        const b = await tx.brief.findFirst({ where: { id: briefId, workspaceId: ctx.workspaceId, deletedAt: null }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
        if (!b || (b.split === "HOLDOUT" && !canSeeHoldout)) throw new ApiError(404, "NOT_FOUND", "Brief 不存在");
        await tx.datasetItem.create({ data: { workspaceId: ctx.workspaceId, datasetId: created.id, itemType: "BRIEF", briefId, split: b.split, snapshot: { briefId, briefNo: b.briefNo, title: b.title, version: b.currentVersion }, contentHash: b.versions[0]?.contentHash ?? "", rightsSnapshot: { split: b.split, purpose: b.purpose }, sortOrder: order++ } });
      }
      for (const counterexampleId of input.counterexampleIds ?? []) {
        const ce = await tx.counterexample.findFirst({ where: { id: counterexampleId, workspaceId: ctx.workspaceId, deletedAt: null }, include: { brief: { select: { split: true } }, versions: { orderBy: { version: "desc" }, take: 1 } } });
        if (!ce || (ce.brief?.split === "HOLDOUT" && !canSeeHoldout)) throw new ApiError(404, "NOT_FOUND", "反例不存在");
        await tx.datasetItem.create({ data: { workspaceId: ctx.workspaceId, datasetId: created.id, itemType: "COUNTEREXAMPLE", counterexampleId, split: ce.brief?.split ?? "DEV", snapshot: { counterexampleId, counterexampleNo: ce.counterexampleNo, title: ce.title, version: ce.currentVersion }, contentHash: ce.versions[0]?.contentHash ?? "", rightsSnapshot: {}, sortOrder: order++ } });
      }
      for (const candidateId of input.candidateIds ?? []) {
        const c = await tx.candidate.findFirst({ where: { id: candidateId, workspaceId: ctx.workspaceId } });
        if (!c) throw new ApiError(404, "NOT_FOUND", "候选不存在");
        const candidateBrief = await tx.brief.findFirst({ where: { id: c.briefId, workspaceId: ctx.workspaceId, deletedAt: null }, select: { split: true } });
        if (!candidateBrief || (candidateBrief.split === "HOLDOUT" && !canSeeHoldout)) throw new ApiError(404, "NOT_FOUND", "候选不存在");
        await tx.datasetItem.create({ data: { workspaceId: ctx.workspaceId, datasetId: created.id, itemType: "CANDIDATE", candidateId, split: candidateBrief.split, snapshot: { candidateId, candidateNo: c.candidateNo, title: c.title, status: c.status }, contentHash: "", rightsSnapshot: {}, sortOrder: order++ } });
      }
      await tx.dataset.update({ where: { id: created.id }, data: { itemCount: order } });
      await appendAudit(tx, { workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "DATASET_CREATED", resourceType: "DATASET", resourceId: created.id, after: input, requestId: meta.requestId, ip: meta.ip, userAgent: meta.userAgent });
      return created;
    });
    return json(dataset, 201);
  }
  const datasetMatch = path.match(/^datasets\/([^/]+)(?:\/(validate|approve|export))?$/);
  if (datasetMatch) {
    const dataset = await prisma.dataset.findFirst({ where: { id: datasetMatch[1], workspaceId: ctx.workspaceId, deletedAt: null }, include: { items: true, exports: { orderBy: { createdAt: "desc" } } } });
    if (!dataset) throw new ApiError(404, "NOT_FOUND", "数据集不存在");
    if (!isHoldoutAdmin(ctx) && dataset.items.some((item) => item.split === "HOLDOUT")) throw new ApiError(404, "NOT_FOUND", "数据集不存在");
    if (method === "GET" && !datasetMatch[2]) return json(dataset);
    if (method === "POST" && datasetMatch[2] === "validate") {
      assertCapability(can.createDataset(ctx.roles));
      if (["APPROVED", "READY"].includes(dataset.status)) throw new ApiError(409, "INVALID_STATE", "已批准的数据集已冻结，不能重新校验；请创建新版本");
      const result = await validateDataset(dataset);
      await appendAudit(prisma, { workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "DATASET_VALIDATED", resourceType: "DATASET", resourceId: dataset.id, after: { status: result.dataset.status, blockers: result.blockers.length }, requestId: meta.requestId, ip: meta.ip, userAgent: meta.userAgent });
      return json(result);
    }
    if (method === "POST" && datasetMatch[2] === "approve") {
      assertCapability(can.approveDataset(ctx.roles));
      if (dataset.status !== "READY_FOR_APPROVAL") throw new ApiError(409, "INVALID_STATE", "数据集必须先通过校验");
      if (!dataset.manifestHash) throw new ApiError(409, "INVALID_STATE", "数据集缺少冻结清单");
      const updated = await prisma.dataset.update({ where: { id: dataset.id }, data: { status: "APPROVED", approvedBy: ctx.userId, approvedAt: new Date(), frozenAt: new Date() } });
      await appendAudit(prisma, { workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "DATASET_APPROVED", resourceType: "DATASET", resourceId: dataset.id, requestId: meta.requestId, ip: meta.ip, userAgent: meta.userAgent });
      return json(updated);
    }
    if (method === "POST" && datasetMatch[2] === "export") {
      assertCapability(can.exportDataset(ctx.roles), "只有 Owner/Admin/Design Lead 可以导出");
      const result = await createExport(dataset.id, ctx.userId);
      await appendAudit(prisma, { workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "DATASET_EXPORTED", resourceType: "DATASET", resourceId: dataset.id, after: { exportId: result.exportRecord.id, exportNo: result.exportRecord.exportNo, contentHash: result.exportRecord.contentHash, bytes: result.bytes }, requestId: meta.requestId, ip: meta.ip, userAgent: meta.userAgent });
      return json({ export: result.exportRecord, downloadUrl: "/api/v1/datasets/" + dataset.id + "/exports/" + result.exportRecord.id + "/download" }, 201);
    }
  }
  const downloadMatch = path.match(/^datasets\/([^/]+)\/exports\/([^/]+)\/download$/);
  if (downloadMatch && method === "GET") {
    assertCapability(can.exportDataset(ctx.roles), "没有下载权限");
    const holdoutFilter = isHoldoutAdmin(ctx) ? {} : { items: { none: { split: "HOLDOUT" as const } } };
    const exportRecord = await prisma.datasetExport.findFirst({ where: { id: downloadMatch[2], datasetId: downloadMatch[1], status: "SUCCEEDED", dataset: { workspaceId: ctx.workspaceId, ...holdoutFilter } } });
    if (!exportRecord?.fileId) throw new ApiError(404, "NOT_FOUND", "导出文件不存在");
    if (exportRecord.expiresAt && exportRecord.expiresAt < new Date()) throw new ApiError(410, "EXPIRED", "下载链接已过期");
    const stored = await readStoredFile(exportRecord.fileId, ctx.workspaceId);
    await prisma.datasetExport.update({ where: { id: exportRecord.id }, data: { downloadCount: { increment: 1 }, lastDownloadedAt: new Date(), lastDownloadedBy: ctx.userId } });
    await appendAudit(prisma, { workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "DATASET_DOWNLOADED", resourceType: "DATASET_EXPORT", resourceId: exportRecord.id, after: { exportNo: exportRecord.exportNo, bytes: stored.file.sizeBytes.toString() }, requestId: meta.requestId, ip: meta.ip, userAgent: meta.userAgent });
    return new Response(new Uint8Array(stored.bytes), { headers: { "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="' + exportRecord.exportNo + '.zip"', "X-Content-Type-Options": "nosniff" } });
  }

  if (path === "audit-logs" && method === "GET") {
    assertCapability(can.viewAudit(ctx.roles), "没有审计读取权限");
    const logs = await prisma.auditLog.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { occurredAt: "desc" }, take: 200 });
    return json(logs);
  }
  if (path === "notifications" && method === "GET") {
    return json(await prisma.notification.findMany({ where: { workspaceId: ctx.workspaceId, recipientId: ctx.userId }, orderBy: { createdAt: "desc" }, take: 100 }));
  }
  if (path === "notifications/read-all" && method === "POST") {
    const updated = await prisma.notification.updateMany({ where: { workspaceId: ctx.workspaceId, recipientId: ctx.userId, readAt: null }, data: { readAt: new Date() } });
    return json({ ok: true, count: updated.count });
  }
  const notificationMatch = path.match(/^notifications\/([^/]+)\/read$/);
  if (notificationMatch && method === "PATCH") {
    const updated = await prisma.notification.updateMany({ where: { id: notificationMatch[1], workspaceId: ctx.workspaceId, recipientId: ctx.userId }, data: { readAt: new Date() } });
    return json({ ok: updated.count > 0 });
  }

  const fileMatch = path.match(/^files\/([^/]+)\/content$/);
  if (fileMatch && method === "GET") {
    if (!(await canAccessStoredFile(ctx, fileMatch[1]))) throw new ApiError(404, "NOT_FOUND", "文件不存在");
    const stored = await readStoredFile(fileMatch[1], ctx.workspaceId);
    if (stored.file.mimeType === "text/html") {
      const html = safeHtml(stored.bytes.toString("utf8"));
      return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": PREVIEW_CSP, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=60" } });
    }
    return new Response(new Uint8Array(stored.bytes), { headers: { "Content-Type": stored.file.mimeType, "Content-Security-Policy": PREVIEW_CSP, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=60" } });
  }
  return null;
}

