import archiver from "archiver";
import { Prisma, type Dataset, type DatasetItem } from "@prisma/client";
import { prisma } from "./db";
import { hashObject, sha256 } from "./hash";
import { readStoredFile, saveFile } from "./storage";
import { ApiError } from "./api";

type Blocker = { itemId: string; code: string; message: string };
type ValidationOptions = { persist?: boolean; enforceSnapshot?: boolean };

function json(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function requiredGrant(datasetType: "TRAIN" | "EVAL", grant: { canUseForTraining: boolean; canUseForEvaluation: boolean }) {
  return datasetType === "TRAIN" ? grant.canUseForTraining : grant.canUseForEvaluation;
}

function grantSnapshot(grant: { id: string; canDeriveMechanism: boolean; canUseForGeneration: boolean; canUseForDisplay: boolean; canUseForTraining: boolean; canUseForEvaluation: boolean; canShowPublicly: boolean; evidenceStatus: string; evidenceNote: string | null; updatedAt: Date } | null) {
  if (!grant) return {};
  return {
    id: grant.id,
    canDeriveMechanism: grant.canDeriveMechanism,
    canUseForGeneration: grant.canUseForGeneration,
    canUseForDisplay: grant.canUseForDisplay,
    canUseForTraining: grant.canUseForTraining,
    canUseForEvaluation: grant.canUseForEvaluation,
    canShowPublicly: grant.canShowPublicly,
    evidenceStatus: grant.evidenceStatus,
    evidenceNote: grant.evidenceNote,
    updatedAt: grant.updatedAt.toISOString(),
  };
}

function rightsDrift(stored: unknown, current: ReturnType<typeof grantSnapshot>) {
  if (!stored || typeof stored !== "object") return true;
  const value = stored as Record<string, unknown>;
  return value.id !== current.id || value.canUseForTraining !== current.canUseForTraining || value.canUseForEvaluation !== current.canUseForEvaluation || value.canUseForGeneration !== current.canUseForGeneration || value.canUseForDisplay !== current.canUseForDisplay || value.evidenceStatus !== current.evidenceStatus;
}

function blockFailure(run: { checks: Array<{ severity: string; status: string; message: string }> } | undefined) {
  return run?.checks.some((check) => check.severity === "BLOCK" && ["FAIL", "ERROR"].includes(check.status)) ?? true;
}

function csvCell(value: unknown) {
  if (value == null) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return '"' + text.replace(/"/g, '""') + '"';
}

function toCsv(rows: Array<Record<string, unknown>>, columns: string[]) {
  return [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\n") + "\n";
}

function extension(mimeType: string) {
  if (mimeType === "text/html") return "html";
  if (mimeType === "image/svg+xml") return "svg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "bin";
}

export async function validateDataset(dataset: Dataset, options: ValidationOptions = {}) {
  const persist = options.persist ?? true;
  const enforceSnapshot = options.enforceSnapshot ?? false;
  const items = await prisma.datasetItem.findMany({ where: { datasetId: dataset.id }, orderBy: { sortOrder: "asc" } });
  const blockers: Blocker[] = [];
  const rights: Record<string, unknown> = {};
  const eligibility: Array<Record<string, unknown>> = [];
  const normalizedItems: Array<{ item: DatasetItem; snapshot: Record<string, unknown>; rights: Record<string, unknown>; status: "READY" | "QUARANTINED" }> = [];

  if (items.length === 0) blockers.push({ itemId: "", code: "EMPTY_DATASET", message: "数据集至少需要 1 个条目" });
  const activeHold = await prisma.legalHold.count({ where: { workspaceId: dataset.workspaceId, status: "ACTIVE" } });
  if (activeHold > 0) blockers.push({ itemId: "", code: "LEGAL_HOLD", message: "Workspace 存在生效中的法律冻结" });

  for (const item of items) {
    const itemBlockers: Blocker[] = [];
    let snapshot: Record<string, unknown> = (item.snapshot ?? {}) as Record<string, unknown>;
    let itemRights: Record<string, unknown> = {};
    try {
      if (item.itemType === "CASE" && item.caseId) {
        const value = await prisma.case.findFirst({
          where: { id: item.caseId, workspaceId: dataset.workspaceId, deletedAt: null },
          include: { versions: { orderBy: { version: "desc" }, take: 1 }, reviews: { where: { status: "SUBMITTED" } } },
        });
        if (!value) throw new ApiError(422, "DATASET_BLOCKED", "案例不存在或不在当前 Workspace");
        const version = value.versions[0];
        const grant = await prisma.authorizationGrant.findUnique({ where: { subjectType_subjectId: { subjectType: "CASE", subjectId: value.id } } });
        const currentRights = grantSnapshot(grant);
        itemRights = currentRights;
        const currentReviews = value.reviews.filter((review) => review.caseVersionId === version?.id);
        if (!version) itemBlockers.push({ itemId: item.id, code: "MISSING_VERSION", message: value.caseNo + " 缺少版本" });
        if (value.status !== "ELIGIBLE") itemBlockers.push({ itemId: item.id, code: "NOT_ELIGIBLE", message: value.caseNo + " 尚未进入 ELIGIBLE" });
        if (!grant || !requiredGrant(dataset.type, grant)) itemBlockers.push({ itemId: item.id, code: "RIGHTS_MISSING", message: value.caseNo + " 缺少" + (dataset.type === "TRAIN" ? "训练" : "评测") + "授权" });
        if (new Set(currentReviews.map((review) => review.reviewerId)).size < 2) itemBlockers.push({ itemId: item.id, code: "REVIEW_INCOMPLETE", message: value.caseNo + " 未完成两名评审" });
        if (enforceSnapshot && version && item.snapshot && typeof item.snapshot === "object") {
          const frozen = item.snapshot as Record<string, unknown>;
          if (frozen.caseVersionId !== version.id) itemBlockers.push({ itemId: item.id, code: "VERSION_DRIFT", message: value.caseNo + " 在批准后产生了新版本，请重新校验并批准" });
          if (rightsDrift(item.rightsSnapshot, currentRights)) itemBlockers.push({ itemId: item.id, code: "RIGHTS_CHANGED", message: value.caseNo + " 的授权在批准后发生变化，请重新校验并批准" });
        }
        snapshot = {
          itemType: "CASE", caseId: value.id, caseNo: value.caseNo, title: value.title, archetype: value.archetype,
          status: value.status, caseVersionId: version?.id, version: version?.version, contentHash: version?.contentHash,
          applicableConditions: version?.applicableConditions, designMechanism: version?.designMechanism,
          antiPatterns: version?.antiPatterns, mechanismTags: version?.mechanismTags, selfScores: version?.selfScores,
          sourceType: version?.sourceType, sourceNote: version?.sourceNote,
          reviewSummary: {
            reviewers: new Set(currentReviews.map((review) => review.reviewerId)).size,
            recommendations: currentReviews.map((review) => review.recommendation),
          },
          rights: currentRights,
        };
      } else if (item.itemType === "COUNTEREXAMPLE" && item.counterexampleId) {
        const value = await prisma.counterexample.findFirst({ where: { id: item.counterexampleId, workspaceId: dataset.workspaceId, deletedAt: null }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
        if (!value) throw new ApiError(422, "DATASET_BLOCKED", "反例不存在");
        const version = value.versions[0];
        const grant = await prisma.authorizationGrant.findUnique({ where: { subjectType_subjectId: { subjectType: "COUNTEREXAMPLE", subjectId: value.id } } });
        const currentRights = grantSnapshot(grant);
        itemRights = currentRights;
        if (value.status !== "APPROVED") itemBlockers.push({ itemId: item.id, code: "NOT_APPROVED", message: value.counterexampleNo + " 尚未批准" });
        if (!grant || !requiredGrant(dataset.type, grant)) itemBlockers.push({ itemId: item.id, code: "RIGHTS_MISSING", message: value.counterexampleNo + " 缺少授权" });
        if (!version) itemBlockers.push({ itemId: item.id, code: "MISSING_VERSION", message: value.counterexampleNo + " 缺少版本" });
        if (enforceSnapshot && version) {
          const frozen = item.snapshot as Record<string, unknown>;
          if (frozen.counterexampleVersionId !== version.id) itemBlockers.push({ itemId: item.id, code: "VERSION_DRIFT", message: value.counterexampleNo + " 在批准后产生了新版本" });
          if (rightsDrift(item.rightsSnapshot, currentRights)) itemBlockers.push({ itemId: item.id, code: "RIGHTS_CHANGED", message: value.counterexampleNo + " 的授权在批准后发生变化" });
        }
        snapshot = {
          itemType: "COUNTEREXAMPLE", counterexampleId: value.id, counterexampleNo: value.counterexampleNo, title: value.title,
          archetype: value.archetype, status: value.status, counterexampleVersionId: version?.id, version: version?.version,
          contentHash: version?.contentHash, failureSummary: version?.failureSummary, failureLabels: version?.failureLabels,
          reproductionSteps: version?.reproductionSteps, rootCause: version?.rootCause, repairSuggestion: version?.repairSuggestion,
          applicableConditions: version?.applicableConditions, sourceType: version?.sourceType, sourceNote: version?.sourceNote,
          rights: currentRights,
        };
      } else if (item.itemType === "BRIEF" && item.briefId) {
        const value = await prisma.brief.findFirst({ where: { id: item.briefId, workspaceId: dataset.workspaceId, deletedAt: null }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
        if (!value) throw new ApiError(422, "DATASET_BLOCKED", "Brief 不存在");
        const version = value.versions[0];
        if (value.status !== "READY") itemBlockers.push({ itemId: item.id, code: "BRIEF_NOT_READY", message: value.briefNo + " 尚未就绪" });
        if (dataset.type === "TRAIN" && value.split === "HOLDOUT") itemBlockers.push({ itemId: item.id, code: "HOLDOUT_IN_TRAIN", message: value.briefNo + " 是 Holdout，不得进入训练集" });
        if (dataset.type === "EVAL" && !["GOLDEN_EVAL", "BOTH"].includes(value.purpose)) itemBlockers.push({ itemId: item.id, code: "NOT_GOLDEN", message: value.briefNo + " 不是黄金评测 Brief" });
        if (enforceSnapshot && version) {
          const frozen = item.snapshot as Record<string, unknown>;
          if (frozen.briefVersionId !== version.id) itemBlockers.push({ itemId: item.id, code: "VERSION_DRIFT", message: value.briefNo + " 在批准后产生了新版本" });
        }
        itemRights = { split: value.split, purpose: value.purpose };
        snapshot = {
          itemType: "BRIEF", briefId: value.id, briefNo: value.briefNo, title: value.title, split: value.split, purpose: value.purpose,
          briefVersionId: version?.id, version: version?.version, contentHash: version?.contentHash,
          manuscriptMarkdown: version?.manuscriptMarkdown, images: version?.images, targetAudience: version?.targetAudience,
          designCommission: version?.designCommission, brandRequirements: version?.brandRequirements, prohibitedItems: version?.prohibitedItems,
          userIntent: version?.userIntent, hardConstraints: version?.hardConstraints, acceptableArchetypes: version?.acceptableArchetypes,
          mustAvoid: version?.mustAvoid, rubricTargets: version?.rubricTargets, acceptanceNotes: version?.acceptanceNotes,
          rights: itemRights,
        };
      } else if (item.itemType === "CANDIDATE" && item.candidateId) {
        const value = await prisma.candidate.findFirst({ where: { id: item.candidateId, workspaceId: dataset.workspaceId }, include: { versions: { orderBy: { version: "desc" }, take: 1 }, hardCheckRuns: { orderBy: { startedAt: "desc" }, take: 1, include: { checks: true } } } });
        if (!value) throw new ApiError(422, "DATASET_BLOCKED", "候选不存在");
        const version = value.versions[0];
        if (!["COMPLETED", "READY_FOR_BLIND", "IN_BLIND"].includes(value.status)) itemBlockers.push({ itemId: item.id, code: "CANDIDATE_NOT_READY", message: value.candidateNo + " 状态不允许导出" });
        if (blockFailure(value.hardCheckRuns[0])) itemBlockers.push({ itemId: item.id, code: "HARD_CHECK_FAILED", message: value.candidateNo + " 最新硬检查未通过" });
        if (enforceSnapshot && version) {
          const frozen = item.snapshot as Record<string, unknown>;
          if (frozen.candidateVersionId !== version.id) itemBlockers.push({ itemId: item.id, code: "VERSION_DRIFT", message: value.candidateNo + " 在批准后产生了新版本" });
        }
        snapshot = {
          itemType: "CANDIDATE", candidateId: value.id, candidateNo: value.candidateNo, title: value.title, status: value.status,
          briefId: value.briefId, candidateVersionId: version?.id, version: version?.version, contentHash: version?.contentHash,
          modelProvider: version?.modelProvider, modelName: version?.modelName, modelVersion: version?.modelVersion,
          hardChecks: value.hardCheckRuns[0]?.checks.map((check) => ({ ruleId: check.ruleId, severity: check.severity, status: check.status, message: check.message })) ?? [],
        };
      } else {
        itemBlockers.push({ itemId: item.id, code: "UNSUPPORTED_ITEM", message: "不支持的条目类型" });
      }
    } catch (error) {
      itemBlockers.push({ itemId: item.id, code: "VALIDATION_ERROR", message: error instanceof Error ? error.message : "校验失败" });
    }
    blockers.push(...itemBlockers);
    rights[item.id] = itemRights;
    eligibility.push({ itemId: item.id, snapshot, ok: itemBlockers.length === 0 });
    normalizedItems.push({ item, snapshot, rights: itemRights, status: itemBlockers.length === 0 ? "READY" : "QUARANTINED" });
  }

  const computedManifestHash = hashObject({ items: normalizedItems.map(({ item, snapshot, rights: itemRights }) => ({ id: item.id, type: item.itemType, snapshot, rights: itemRights })) });
  if (enforceSnapshot && dataset.manifestHash && dataset.manifestHash !== computedManifestHash) {
    blockers.push({ itemId: "", code: "MANIFEST_DRIFT", message: "条目集合在批准后发生变化，请重新校验并批准" });
  }

  if (persist) {
    for (const row of normalizedItems) {
      await prisma.datasetItem.update({ where: { id: row.item.id }, data: { contentHash: hashObject(row.snapshot), snapshot: json(row.snapshot), rightsSnapshot: json(row.rights), status: row.status } });
    }
  }

  const status = blockers.length ? "BLOCKED" : "READY_FOR_APPROVAL";
  const snapshot = { checkedAt: new Date().toISOString(), blockers, eligibility };
  const updated = persist ? await prisma.dataset.update({
    where: { id: dataset.id },
    data: { status, rightsSnapshot: json(rights), eligibilitySnapshot: json(snapshot), itemCount: items.length, manifestHash: computedManifestHash },
  }) : dataset;
  return { dataset: updated, blockers, manifestHash: computedManifestHash };
}

export async function createExport(datasetId: string, actorId: string) {
  const dataset = await prisma.dataset.findUniqueOrThrow({ where: { id: datasetId }, include: { items: { orderBy: { sortOrder: "asc" } } } });
  if (!["APPROVED", "READY"].includes(dataset.status)) {
    const validated = await validateDataset(dataset);
    if (validated.blockers.length) throw new ApiError(422, "DATASET_BLOCKED", "数据集存在阻断项，不能导出", validated.blockers);
    throw new ApiError(409, "INVALID_STATE", "数据集已通过校验，需批准后才能导出");
  }
  const validated = await validateDataset(dataset, { persist: false, enforceSnapshot: true });
  if (validated.blockers.length) throw new ApiError(422, "DATASET_BLOCKED", "导出前冻结版本或授权校验失败", validated.blockers);

  const records = { briefs: [] as Record<string, unknown>[], cases: [] as Record<string, unknown>[], counterexamples: [] as Record<string, unknown>[], candidates: [] as Record<string, unknown>[], preferences: [] as Record<string, unknown>[] };
  const assets: Array<{ path: string; bytes: Buffer }> = [];
  for (const item of dataset.items) {
    const snapshot = item.snapshot as Record<string, unknown>;
    if (item.itemType === "BRIEF") records.briefs.push(snapshot);
    if (item.itemType === "CASE") records.cases.push({ ...snapshot, datasetItemId: item.id });
    if (item.itemType === "COUNTEREXAMPLE") records.counterexamples.push({ ...snapshot, datasetItemId: item.id });
    if (item.itemType === "CANDIDATE") records.candidates.push({ ...snapshot, datasetItemId: item.id });
    if (item.itemType === "PREFERENCE") records.preferences.push(snapshot);
    if (item.caseId && snapshot.caseVersionId) {
      const version = await prisma.caseVersion.findUnique({ where: { id: String(snapshot.caseVersionId) }, include: { assets: { include: { storedFile: true } } } });
      for (const asset of version?.assets ?? []) {
        const stored = await readStoredFile(asset.storedFileId, dataset.workspaceId);
        assets.push({ path: "assets/cases/" + String(snapshot.caseNo ?? item.id) + "/" + asset.kind.toLowerCase() + "." + extension(stored.file.mimeType), bytes: stored.bytes });
      }
    }
    if (item.counterexampleId && snapshot.counterexampleVersionId) {
      const version = await prisma.counterexampleVersion.findUnique({ where: { id: String(snapshot.counterexampleVersionId) }, include: { assets: { include: { storedFile: true } } } });
      for (const asset of version?.assets ?? []) {
        const stored = await readStoredFile(asset.storedFileId, dataset.workspaceId);
        assets.push({ path: "assets/counterexamples/" + String(snapshot.counterexampleNo ?? item.id) + "/" + asset.kind.toLowerCase() + "." + extension(stored.file.mimeType), bytes: stored.bytes });
      }
    }
    if (item.candidateId && snapshot.candidateVersionId) {
      const version = await prisma.candidateVersion.findUnique({ where: { id: String(snapshot.candidateVersionId) }, include: { assets: { include: { storedFile: true } } } });
      for (const asset of version?.assets ?? []) {
        const stored = await readStoredFile(asset.storedFileId, dataset.workspaceId);
        assets.push({ path: "assets/candidates/" + String(snapshot.candidateNo ?? item.id) + "/" + asset.kind.toLowerCase() + "." + extension(stored.file.mimeType), bytes: stored.bytes });
      }
    }
  }

  const files: Array<{ path: string; sha256: string; size_bytes: number }> = [];
  const textFiles: Array<{ path: string; text: string }> = [
    { path: "briefs.jsonl", text: records.briefs.map((row) => JSON.stringify(row)).join("\n") + (records.briefs.length ? "\n" : "") },
    { path: "cases.jsonl", text: records.cases.map((row) => JSON.stringify(row)).join("\n") + (records.cases.length ? "\n" : "") },
    { path: "counterexamples.jsonl", text: records.counterexamples.map((row) => JSON.stringify(row)).join("\n") + (records.counterexamples.length ? "\n" : "") },
    { path: "candidates.jsonl", text: records.candidates.map((row) => JSON.stringify(row)).join("\n") + (records.candidates.length ? "\n" : "") },
    { path: "briefs.csv", text: toCsv(records.briefs, ["briefNo","title","split","purpose","version","contentHash","manuscriptMarkdown","targetAudience","designCommission","brandRequirements","prohibitedItems"]) },
    { path: "cases.csv", text: toCsv(records.cases, ["caseNo","title","archetype","version","contentHash","applicableConditions","designMechanism","mechanismTags","antiPatterns","selfScores"]) },
    { path: "counterexamples.csv", text: toCsv(records.counterexamples, ["counterexampleNo","title","archetype","version","contentHash","failureSummary","failureLabels","reproductionSteps","repairSuggestion"]) },
    { path: "candidates.csv", text: toCsv(records.candidates, ["candidateNo","title","status","version","contentHash","modelProvider","modelName","modelVersion"]) },
  ];
  for (const file of textFiles) {
    const bytes = Buffer.from(file.text);
    files.push({ path: file.path, sha256: sha256(bytes), size_bytes: bytes.length });
  }
  for (const asset of assets) files.push({ path: asset.path, sha256: sha256(asset.bytes), size_bytes: asset.bytes.length });

  const contentHash = hashObject({ records, rights: dataset.rightsSnapshot, eligibility: dataset.eligibilitySnapshot });
  const manifest = {
    dataset_id: dataset.id, dataset_no: dataset.datasetNo, version: dataset.version, schema_version: "1.0",
    created_at: new Date().toISOString(), created_by: actorId, type: dataset.type,
    rights_snapshot: dataset.rightsSnapshot, item_count: dataset.itemCount, content_hash: contentHash,
    files,
  };

  const archive = archiver("zip", { zlib: { level: 9 } });
  const chunks: Buffer[] = [];
  archive.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => { archive.on("end", () => resolve(Buffer.concat(chunks))); archive.on("error", reject); });
  archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });
  for (const file of textFiles) archive.append(file.text, { name: file.path });
  archive.append("type,count\n" + Object.entries(records).map(([name, rows]) => name + "," + rows.length).join("\n") + "\n", { name: "summary.csv" });
  for (const asset of assets) archive.append(asset.bytes, { name: asset.path });
  await archive.finalize();
  const zip = await done;
  const stored = await saveFile({ workspaceId: dataset.workspaceId, createdBy: actorId, filename: dataset.datasetNo + "-v" + dataset.version + ".zip", mimeType: "application/zip", purpose: "DATASET", bytes: zip });
  const exportNo = "EX-" + Date.now().toString();
  const exportRecord = await prisma.$transaction(async (tx) => {
    const created = await tx.datasetExport.create({ data: { datasetId: dataset.id, datasetVersion: dataset.version, exportNo, format: dataset.format, status: "SUCCEEDED", fileId: stored.id, manifestFileId: stored.id, contentHash, sizeBytes: BigInt(zip.length), exportedBy: actorId, exportedAt: new Date(), expiresAt: new Date(Date.now() + 15 * 60_000) } });
    await tx.dataset.update({ where: { id: dataset.id }, data: { status: "READY", frozenAt: dataset.frozenAt ?? new Date() } });
    return created;
  });
  return { exportRecord, manifest, bytes: zip.length };
}

export async function buildDatasetItemSnapshot(item: DatasetItem, workspaceId: string) {
  if (item.itemType === "CASE" && item.caseId) {
    const value = await prisma.case.findFirstOrThrow({ where: { id: item.caseId, workspaceId }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
    return { itemType: "CASE" as const, caseId: value.id, caseNo: value.caseNo, title: value.title, version: value.currentVersion };
  }
  if (item.itemType === "BRIEF" && item.briefId) {
    const value = await prisma.brief.findFirstOrThrow({ where: { id: item.briefId, workspaceId }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
    return { itemType: "BRIEF" as const, briefId: value.id, briefNo: value.briefNo, title: value.title, version: value.currentVersion };
  }
  return { itemType: item.itemType };
}
