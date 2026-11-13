import { PrismaClient, RoleCode, BriefStatus, BriefPurpose, Split, Archetype, CaseStatus, CounterexampleStatus, AssetKind, AuthSubjectType, EvidenceStatus, ReviewTaskType, ReviewTaskStatus, ReviewRole, ReviewRecommendation, ReviewVersionStatus, ReviewEvidenceType, CandidateStatus, HardCheckRunStatus, HardCheckSeverity, HardCheckStatus, ExperimentStatus, ExperimentPairStatus, DatasetType, DatasetStatus, DatasetFormat, DatasetItemType, DatasetItemStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { saveFile } from "../src/lib/storage";
import { appendAudit } from "../src/lib/audit";

const prisma = new PrismaClient();
const PASSWORD = process.env.DEMO_PASSWORD ?? "Demo1234!";
const W = "00000000-0000-4000-8000-000000000001";

function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function json(value: unknown) { return JSON.parse(JSON.stringify(value)); }

const screenshotSvg = (title: string, accent: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="375" height="600" viewBox="0 0 375 600">
<rect width="375" height="600" fill="#f6f1e8"/>
<rect x="0" y="0" width="375" height="8" fill="${accent}"/>
<text x="28" y="92" font-family="Georgia, serif" font-size="42" fill="#161616">${title}</text>
<text x="28" y="126" font-family="Arial, sans-serif" font-size="12" fill="#555" letter-spacing="2">WECRAFT DESIGN STUDY</text>
<line x1="28" y1="160" x2="347" y2="160" stroke="#161616" stroke-width="1"/>
<rect x="28" y="190" width="319" height="250" fill="${accent}" opacity="0.18"/>
<circle cx="188" cy="315" r="78" fill="none" stroke="${accent}" stroke-width="2"/>
<text x="28" y="492" font-family="Arial, sans-serif" font-size="15" fill="#333">当内容成为版面的材料，</text>
<text x="28" y="516" font-family="Arial, sans-serif" font-size="15" fill="#333">阅读也成为一种观看。</text>
<text x="28" y="568" font-family="Arial, sans-serif" font-size="11" fill="#777">375px / internal training fixture</text>
</svg>`;

const htmlDoc = (title: string, accent: string, body: string) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>
*{box-sizing:border-box}body{margin:0;background:#f6f1e8;color:#161616;font-family:Arial,sans-serif;padding:24px;max-width:375px}h1{font-family:Georgia,serif;font-size:42px;line-height:1.08;margin:24px 0 8px;color:#161616}.kicker{font-size:11px;letter-spacing:2px;color:#555}.rule{height:1px;background:#161616;margin:24px 0}.hero{height:250px;background:${accent};opacity:.3;display:flex;align-items:center;justify-content:center}.hero span{font-size:80px;color:#161616;opacity:.8}p{font-size:15px;line-height:1.65;color:#333}.foot{font-size:11px;color:#777;margin-top:36px}
</style></head><body><div class="kicker">WECRAFT DESIGN STUDY</div><h1>${title}</h1><div class="rule"></div><div class="hero"><span>↗</span></div><p>${body}</p><p>设计不是把文字装进模板，而是让内容的结构、节奏与观看方式互相解释。</p><div class="foot">375px / internal training fixture</div></body></html>`;

async function seedFile(workspaceId: string, actorId: string, name: string, mime: string, text: string, purpose: string) {
  return saveFile({ workspaceId, createdBy: actorId, filename: name, mimeType: mime, purpose, bytes: Buffer.from(text) });
}

async function main() {
  const seedIfEmpty = process.env.DEMO_SEED_IF_EMPTY === "1";
  if (process.env.NODE_ENV === "production" && !seedIfEmpty) throw new Error("Refusing to seed production without DEMO_SEED_IF_EMPTY=1");
  if (seedIfEmpty) {
    const existingWorkspaces = await prisma.workspace.count();
    if (existingWorkspaces > 0) {
      console.log("Demo seed skipped: workspace already contains data.");
      return;
    }
  }
  if (!process.env.DATABASE_URL?.includes("wecraft_dt") && process.env.ALLOW_SEED_RESET !== "1") {
    throw new Error("Seed reset is restricted to the wecraft_dt database");
  }
  await prisma.$executeRawUnsafe(`
    DO $$
    DECLARE r RECORD;
    BEGIN
      FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
      LOOP
        EXECUTE format('TRUNCATE TABLE %I CASCADE', r.tablename);
      END LOOP;
    END $$;
  `);

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const workspace = await prisma.workspace.create({ data: { id: W, name: "WeCraft 设计训练工作组", slug: "wecraft-design", status: "ACTIVE" } });
  const roleDefs: Array<[RoleCode, string, string]> = [
    ["OWNER", "项目负责人", "最终签收、授权、导出与治理"],
    ["ADMIN", "平台管理员", "成员、配置、集成、审计与导出"],
    ["DESIGN_LEAD", "设计负责人", "案例批准、设计裁决、授权与导出"],
    ["CONTENT_LEAD", "内容负责人", "Brief 内容审批与内容事实裁决"],
    ["EDITOR", "内容/编辑", "创建和编辑 Brief"],
    ["ANNOTATOR", "标注/QA", "案例录入、标注与盲测评审"],
    ["AI_ENGINEER", "AI 工程", "候选提交、硬检查与实验管理"],
    ["VIEWER", "只读观察者", "查看已发布内容与聚合指标"],
  ];
  const roles: Record<string, string> = {};
  for (const [code, name, description] of roleDefs) {
    const role = await prisma.role.create({ data: { code, name, description } });
    roles[code] = role.id;
  }

  const userDefs: Array<[string, string, RoleCode]> = [
    ["00000000-0000-4000-8000-000000000101", "owner@example.test", "OWNER"],
    ["00000000-0000-4000-8000-000000000102", "admin@example.test", "ADMIN"],
    ["00000000-0000-4000-8000-000000000103", "lead@example.test", "DESIGN_LEAD"],
    ["00000000-0000-4000-8000-000000000104", "content@example.test", "CONTENT_LEAD"],
    ["00000000-0000-4000-8000-000000000105", "editor@example.test", "EDITOR"],
    ["00000000-0000-4000-8000-000000000106", "annotator@example.test", "ANNOTATOR"],
    ["00000000-0000-4000-8000-000000000107", "engineer@example.test", "AI_ENGINEER"],
    ["00000000-0000-4000-8000-000000000108", "viewer@example.test", "VIEWER"],
  ];
  const users: Record<string, string> = {};
  for (const [id, email, roleCode] of userDefs) {
    const user = await prisma.user.create({ data: { id, email, name: email.split("@")[0], passwordHash } });
    const membership = await prisma.membership.create({ data: { workspaceId: W, userId: user.id } });
    await prisma.memberRole.create({ data: { membershipId: membership.id, roleId: roles[roleCode] } });
    users[roleCode] = user.id;
  }
  const owner = users.OWNER, lead = users.DESIGN_LEAD, annotator = users.ANNOTATOR, engineer = users.AI_ENGINEER;

  const briefDefs = [
    { id: "00000000-0000-4000-8000-000000000201", no: "BR-0001", title: "把文章做成一件材料", purpose: BriefPurpose.GOLDEN_EVAL, split: Split.DEV, archetype: Archetype.MATERIAL, copy: "一篇关于纸张、折痕与阅读痕迹的文章。请用版面材料表达文本的时间感。" },
    { id: "00000000-0000-4000-8000-000000000202", no: "BR-0002", title: "当标题指向它自己", purpose: BriefPurpose.CASE_SOURCE, split: Split.DEV, archetype: Archetype.SELF_REFERENTIAL, copy: "请设计一组自我指涉的标题与导语，让排版本身成为内容的一部分。" },
    { id: "00000000-0000-4000-8000-000000000203", no: "BR-0003", title: "保留集：夜间阅读的城市", purpose: BriefPurpose.GOLDEN_EVAL, split: Split.HOLDOUT, archetype: Archetype.SCENE, copy: "这是一份 Holdout 评测 brief，用于检验场景叙事能力。普通角色不可在列表和任务中看到。" },
  ];
  const briefs: Record<string, string> = {};
  for (const [index, b] of briefDefs.entries()) {
    const brief = await prisma.brief.create({ data: { id: b.id, workspaceId: W, briefNo: b.no, title: b.title, status: BriefStatus.READY, purpose: b.purpose, split: b.split, ownerId: owner, approvedBy: lead, approvedAt: new Date(), currentVersion: 1 } });
    briefs[b.id] = brief.id;
    await prisma.briefVersion.create({ data: { briefId: brief.id, version: 1, manuscriptMarkdown: b.copy, images: [], targetAudience: "关注内容设计的编辑、设计师与 AI 工程读者", designCommission: "制作一张适配公众号首屏的 375px 设计稿，并保留可审查的 HTML 结构。", brandRequirements: "克制、纸张质感、强标题层级、允许留白。", prohibitedItems: "不得使用外部图片、脚本、表单和自动跳转。", userIntent: b.purpose === BriefPurpose.GOLDEN_EVAL ? "检验内容是否被设计机制重新组织" : null, hardConstraints: b.purpose === BriefPurpose.GOLDEN_EVAL ? ["375px 不横向溢出", "无脚本", "正文对比度达标"] : undefined, acceptableArchetypes: [b.archetype], mustAvoid: ["纯模板堆叠"], humanReference: b.purpose === BriefPurpose.GOLDEN_EVAL ? [{ label: "人工参考 A", note: "标题与材料同构" }] : undefined, rubricTargets: { CONTENT_FIT: 4, VISUAL_MECHANISM: 4, COMPLETION: 4 }, acceptanceNotes: b.purpose === BriefPurpose.GOLDEN_EVAL ? "允许不同版式，但必须解释材料与内容的关系。" : null, contentHash: hash(b.title + b.copy), createdBy: owner } });
  }

  const caseDefs = [
    { id: "00000000-0000-4000-8000-000000000301", no: "CA-0001", title: "折痕作为段落", archetype: Archetype.MATERIAL, briefId: briefDefs[0].id, accent: "#b15a3c", status: CaseStatus.ELIGIBLE, auth: { canUseForTraining: true, canUseForEvaluation: true } },
    { id: "00000000-0000-4000-8000-000000000302", no: "CA-0002", title: "标题吃掉自己", archetype: Archetype.SELF_REFERENTIAL, briefId: briefDefs[1].id, accent: "#2d5d55", status: CaseStatus.ELIGIBLE, auth: { canUseForTraining: true, canUseForEvaluation: true } },
    { id: "00000000-0000-4000-8000-000000000303", no: "CA-0003", title: "场景从边角进入", archetype: Archetype.SCENE, briefId: briefDefs[0].id, accent: "#375b8c", status: CaseStatus.IN_REVIEW, auth: { canUseForTraining: false, canUseForEvaluation: true } },
    { id: "00000000-0000-4000-8000-000000000304", no: "CA-0004", title: "图式变成阅读地图", archetype: Archetype.SCHEMA, briefId: briefDefs[1].id, accent: "#7b4d7f", status: CaseStatus.DRAFT, auth: { canUseForTraining: false, canUseForEvaluation: false } },
    { id: "00000000-0000-4000-8000-000000000305", no: "CA-0005", title: "界面语法写社论", archetype: Archetype.INTERFACE, briefId: briefDefs[0].id, accent: "#8a6a22", status: CaseStatus.ELIGIBLE, auth: { canUseForTraining: false, canUseForEvaluation: true } },
  ];
  const cases: Record<string, string> = {};
  for (const c of caseDefs) {
    const item = await prisma.case.create({ data: { id: c.id, workspaceId: W, caseNo: c.no, title: c.title, status: c.status, archetype: c.archetype, briefId: briefs[c.briefId], currentVersion: 1, createdBy: annotator, ownerId: lead, approvedBy: c.status === CaseStatus.ELIGIBLE ? lead : null, approvedAt: c.status === CaseStatus.ELIGIBLE ? new Date() : null } });
    cases[c.id] = item.id;
    const screenshot = await seedFile(W, annotator, c.no + "-375.svg", "image/svg+xml", screenshotSvg(c.title, c.accent), "CASE_SCREENSHOT");
    const html = await seedFile(W, annotator, c.no + ".html", "text/html", htmlDoc(c.title, c.accent, "这篇内容把材料、折痕与阅读时间组织成同一种视觉语法。"), "CASE_HTML");
    const version = await prisma.caseVersion.create({ data: {
      caseId: item.id,
      version: 1,
      applicableConditions: "适合有明确材料隐喻、标题需要承担叙事重量的长文。",
      designMechanism: "让材料痕迹成为段落分隔和标题层次，避免把机制当作装饰。",
      bodyMechanism: "首屏用色条、超大标题与分隔线建立秩序，后文继续以同一分隔线、单色几何块和等宽尾注组织停顿，不新增另一套装饰语法。",
      startPoints: ["perspective"],
      intentTags: ["restrained", "editorial"],
      structureSignature: "accent-strip > oversized-serif-title > rule > geometric-pause > body-close",
      visualGrammar: {
        surfaceMaterial: "暖白平涂纸面，顶部色条作为装订边或材料切口，正文区域保持干净，不让纹理穿过文字。",
        typeSystem: "大号衬线标题承担展示层，无衬线正文承担阅读层，疏排等宽小字只用于刊头和尾注。",
        imageTreatment: "没有真实摄影；单色几何块和细线圆环承担图像位，作为章节停顿而不是信息图。",
        composition: "首屏为通栏色条、标题和分隔线，中段用近满宽几何块打断长文，结尾回到窄栏正文与尾注。",
        colorLight: "纸色与墨色维持高对比，案例色只用于顶部条、几何块和圆环，面积受控。",
        decorationAnnotations: "细分隔线定义阅读节奏，刊头微字提供出处，圆环只出现一次作为视觉停顿。",
        firstScreenAction: "首屏先落下一条通栏色条，再让超大标题压住正文基线，以分隔线把标题和导语切成两个时间层。",
      },
      antiPatterns: ["不要把折痕做成无意义的背景纹理", "不要牺牲正文可读性"],
      mechanismTags: ["材料同构", "段落折叠", "标题层级"],
      selfScores: { CONTENT_FIT: 4, VISUAL_MECHANISM: 5, TYPE_HIERARCHY: 4, IMAGE_NARRATIVE: 4, RHYTHM: 4, COMPLETION: 4 },
      sourceType: "INTERNAL_ORIGINAL",
      sourceNote: "非敏感演示样例，由内部设计训练组制作",
      contentHash: hash(c.title + c.no),
      createdBy: annotator,
    } });
    await prisma.caseAsset.create({ data: { caseId: item.id, caseVersionId: version.id, storedFileId: screenshot.id, kind: AssetKind.SCREENSHOT_375, sortOrder: 0, isPrimary: true, width: 375, height: 600, altText: c.title + " 的 375px 截图" } });
    await prisma.caseAsset.create({ data: { caseId: item.id, caseVersionId: version.id, storedFileId: html.id, kind: AssetKind.HTML, sortOrder: 1, width: 375, height: 600, altText: c.title + " 的 HTML 证据" } });
    await prisma.authorizationGrant.create({ data: { workspaceId: W, subjectType: AuthSubjectType.CASE, subjectId: item.id, canDeriveMechanism: true, canUseForGeneration: c.auth.canUseForTraining, canUseForDisplay: true, canUseForTraining: c.auth.canUseForTraining, canUseForEvaluation: c.auth.canUseForEvaluation, canShowPublicly: false, evidenceStatus: EvidenceStatus.VERIFIED, evidenceNote: "演示样例授权：内部原创，已核验", updatedBy: owner } });
  }

  const counterDefs = [
    ["00000000-0000-4000-8000-000000000401", "CE-0001", "装饰遮住内容", Archetype.GENRE, CounterexampleStatus.APPROVED, "用大块纹理覆盖标题，导致阅读顺序断裂。"],
    ["00000000-0000-4000-8000-000000000402", "CE-0002", "层级只剩颜色", Archetype.INTERFACE, CounterexampleStatus.DRAFT, "只靠颜色区分标题与正文，灰度打印后层级消失。"],
  ] as const;
  for (const [id, no, title, archetype, status, failure] of counterDefs) {
    const item = await prisma.counterexample.create({ data: { id, workspaceId: W, counterexampleNo: no, title, status, archetype, briefId: briefs[briefDefs[0].id], currentVersion: 1, createdBy: annotator, ownerId: annotator, approvedBy: status === CounterexampleStatus.APPROVED ? lead : null, approvedAt: status === CounterexampleStatus.APPROVED ? new Date() : null } });
    const screenshot = await seedFile(W, annotator, no + "-375.svg", "image/svg+xml", screenshotSvg(title, "#8d3c3c"), "COUNTEREXAMPLE_SCREENSHOT");
    const html = await seedFile(W, annotator, no + ".html", "text/html", htmlDoc(title, "#8d3c3c", failure), "COUNTEREXAMPLE_HTML");
    const version = await prisma.counterexampleVersion.create({ data: { counterexampleId: item.id, version: 1, failureSummary: failure, failureLabels: ["视觉机制", "可读性"], reproductionSteps: "在 375px 宽度下打开 HTML，观察标题被纹理遮挡的位置。", rootCause: "把装饰层叠在信息层之上，缺少层级优先级。", repairSuggestion: "将纹理移出正文区域，并让标题通过字号与留白建立层级。", applicableConditions: ["标题含长句", "背景纹理对比度高"], sourceType: "INTERNAL_ORIGINAL", sourceNote: "非敏感演示反例", contentHash: hash(no + failure), createdBy: annotator } });
    await prisma.counterexampleAsset.create({ data: { counterexampleId: item.id, counterexampleVersionId: version.id, storedFileId: screenshot.id, kind: AssetKind.SCREENSHOT_375, sortOrder: 0, width: 375, height: 600, altText: title } });
    await prisma.counterexampleAsset.create({ data: { counterexampleId: item.id, counterexampleVersionId: version.id, storedFileId: html.id, kind: AssetKind.HTML, sortOrder: 1 } });
    await prisma.authorizationGrant.create({ data: { workspaceId: W, subjectType: AuthSubjectType.COUNTEREXAMPLE, subjectId: item.id, canDeriveMechanism: true, canUseForGeneration: false, canUseForDisplay: true, canUseForTraining: true, canUseForEvaluation: true, canShowPublicly: false, evidenceStatus: EvidenceStatus.VERIFIED, evidenceNote: "演示反例，内部原创", updatedBy: owner } });
  }

  // Submitted double reviews for eligible cases.
  const reviewPairs: Array<[string, string, string, string]> = [
    [caseDefs[0].id, annotator, lead, "材料与段落的关系清晰，标题层级在 375px 下仍可读。"],
    [caseDefs[1].id, lead, annotator, "自我指涉有明确内容依据，不是标题装饰。"],
    [caseDefs[4].id, annotator, lead, "界面语法进入社论后仍保持了阅读顺序。"],
  ];
  for (const [caseId, reviewerA, reviewerB, rationale] of reviewPairs) {
    for (const reviewer of [reviewerA, reviewerB]) {
      const task = await prisma.reviewTask.create({ data: { workspaceId: W, type: ReviewTaskType.CASE_REVIEW, subjectType: "CASE", subjectId: caseId, subjectVersionId: (await prisma.caseVersion.findFirstOrThrow({ where: { caseId } })).id, assigneeId: reviewer, reviewRole: ReviewRole.REVIEWER, status: ReviewTaskStatus.SUBMITTED, assignedBy: lead, submittedAt: new Date() } });
      const snapshot = { caseId, reviewedAt: new Date().toISOString(), note: "演示评审快照" };
      const review = await prisma.caseReview.create({ data: { workspaceId: W, taskId: task.id, caseId, caseVersionId: task.subjectVersionId!, reviewerId: reviewer, recommendation: ReviewRecommendation.PUBLISHABLE, snapshot: json(snapshot), contentHash: hash(JSON.stringify(snapshot) + reviewer), rationale, submittedAt: new Date() } });
      await prisma.reviewScore.createMany({ data: ["CONTENT_FIT", "VISUAL_MECHANISM", "TYPE_HIERARCHY", "IMAGE_NARRATIVE", "RHYTHM", "COMPLETION"].map((dimensionCode) => ({ caseReviewId: review.id, dimensionCode, score: dimensionCode === "CONTENT_FIT" || dimensionCode === "COMPLETION" ? 4 : 4 })) });
      await prisma.reviewEvidence.create({ data: { caseReviewId: review.id, evidenceType: ReviewEvidenceType.SCREENSHOT_REGION, locator: "375px / 标题区", excerpt: rationale } });
    }
  }

  // One in-review case with one submitted review and one pending task.
  const inReviewVersion = await prisma.caseVersion.findFirstOrThrow({ where: { caseId: caseDefs[2].id } });
  const pendingTask = await prisma.reviewTask.create({ data: { workspaceId: W, type: ReviewTaskType.CASE_REVIEW, subjectType: "CASE", subjectId: caseDefs[2].id, subjectVersionId: inReviewVersion.id, assigneeId: annotator, reviewRole: ReviewRole.REVIEWER, status: ReviewTaskStatus.ASSIGNED, assignedBy: lead } });
  await prisma.reviewTask.create({ data: { workspaceId: W, type: ReviewTaskType.CASE_REVIEW, subjectType: "CASE", subjectId: caseDefs[2].id, subjectVersionId: inReviewVersion.id, assigneeId: lead, reviewRole: ReviewRole.REVIEWER, status: ReviewTaskStatus.SUBMITTED, assignedBy: owner, submittedAt: new Date() } });

  const experiment = await prisma.experiment.create({ data: { workspaceId: W, experimentNo: "EX-0001", name: "首轮封面方向盲测", status: ExperimentStatus.RUNNING, protocol: { reviewers: 2, adjudicator: 1, hideModel: true, hideSource: true, tieAllowed: true }, createdBy: engineer, frozenAt: new Date(), startsAt: new Date() } });
  await prisma.experimentBrief.create({ data: { experimentId: experiment.id, briefId: briefs[briefDefs[0].id], briefVersionId: (await prisma.briefVersion.findFirstOrThrow({ where: { briefId: briefs[briefDefs[0].id] } })).id } });

  const candidateDefs = [
    ["00000000-0000-4000-8000-000000000501", "CD-0001", "折痕方案 A", "#b15a3c", "模型供应商 A", "poster-alpha", "2026.11-a"],
    ["00000000-0000-4000-8000-000000000502", "CD-0002", "折痕方案 B", "#2d5d55", "模型供应商 B", "poster-beta", "2026.11-b"],
  ] as const;
  const candidateIds: string[] = [];
  for (const [id, no, title, accent, provider, name, version] of candidateDefs) {
    const candidate = await prisma.candidate.create({ data: { id, workspaceId: W, candidateNo: no, title, briefId: briefs[briefDefs[0].id], experimentId: experiment.id, status: CandidateStatus.IN_BLIND, createdBy: engineer, submittedAt: new Date() } });
    candidateIds.push(candidate.id);
    const html = await seedFile(W, engineer, no + ".html", "text/html", htmlDoc(title, accent, "用材料的折线组织阅读节奏，并保留完整的标题与正文层级。"), "CANDIDATE_HTML");
    const screenshot = await seedFile(W, engineer, no + "-375.svg", "image/svg+xml", screenshotSvg(title, accent), "CANDIDATE_SCREENSHOT");
    const cv = await prisma.candidateVersion.create({ data: { candidateId: candidate.id, version: 1, html: htmlDoc(title, accent, "用材料的折线组织阅读节奏，并保留完整的标题与正文层级。"), modelProvider: provider, modelName: name, modelVersion: version, contentHash: hash(no + version), createdBy: engineer } });
    await prisma.candidateAsset.create({ data: { candidateId: candidate.id, candidateVersionId: cv.id, storedFileId: html.id, kind: AssetKind.HTML, sortOrder: 0 } });
    await prisma.candidateAsset.create({ data: { candidateId: candidate.id, candidateVersionId: cv.id, storedFileId: screenshot.id, kind: AssetKind.SCREENSHOT_375, sortOrder: 1, width: 375, height: 600 } });
    const run = await prisma.hardCheckRun.create({ data: { candidateId: candidate.id, candidateVersionId: cv.id, status: HardCheckRunStatus.COMPLETED, startedAt: new Date(), completedAt: new Date(), createdBy: engineer } });
    await prisma.hardCheck.createMany({ data: [
      { runId: run.id, ruleId: "HC-01", ruleVersion: "v1", severity: HardCheckSeverity.BLOCK, status: HardCheckStatus.PASS, message: "正文完整性通过" },
      { runId: run.id, ruleId: "HC-02", ruleVersion: "v1", severity: HardCheckSeverity.WARN, status: HardCheckStatus.PASS, message: "图片位置通过" },
      { runId: run.id, ruleId: "HC-03", ruleVersion: "v1", severity: HardCheckSeverity.BLOCK, status: HardCheckStatus.PASS, message: "安全 HTML 通过" },
      { runId: run.id, ruleId: "HC-04", ruleVersion: "v1", severity: HardCheckSeverity.BLOCK, status: HardCheckStatus.PASS, message: "375px 无横向溢出" },
      { runId: run.id, ruleId: "HC-05", ruleVersion: "v1", severity: HardCheckSeverity.BLOCK, status: HardCheckStatus.PASS, message: "正文对比度通过" },
    ] });
  }
  const pair = await prisma.experimentPair.create({ data: { workspaceId: W, experimentId: experiment.id, briefId: briefs[briefDefs[0].id], pairNo: "P-0001", leftCandidateId: candidateIds[0], leftCandidateVersionId: (await prisma.candidateVersion.findFirstOrThrow({ where: { candidateId: candidateIds[0] } })).id, leftContentHash: hash("left"), rightCandidateId: candidateIds[1], rightCandidateVersionId: (await prisma.candidateVersion.findFirstOrThrow({ where: { candidateId: candidateIds[1] } })).id, rightContentHash: hash("right"), status: ExperimentPairStatus.READY } });
  for (const reviewer of [annotator, lead]) {
    await prisma.reviewTask.create({ data: { workspaceId: W, type: ReviewTaskType.BLIND_PAIRWISE, subjectType: "EXPERIMENT_PAIR", subjectId: pair.id, experimentPairId: pair.id, assigneeId: reviewer, reviewRole: ReviewRole.REVIEWER, status: ReviewTaskStatus.ASSIGNED, assignedBy: engineer, blindPolicySnapshot: { hideModel: true, hideSource: true, hidePreviousScores: true, revealAfterReviewers: 2 } } });
  }
  await prisma.reviewTask.create({ data: { workspaceId: W, type: ReviewTaskType.ARBITRATION, subjectType: "EXPERIMENT_PAIR", subjectId: pair.id, experimentPairId: pair.id, assigneeId: owner, reviewRole: ReviewRole.ADJUDICATOR, status: ReviewTaskStatus.ASSIGNED, assignedBy: engineer } });

  const dataset = await prisma.dataset.create({ data: { workspaceId: W, datasetNo: "DS-0001", version: 1, name: "设计训练集 · 首轮", type: DatasetType.TRAIN, status: DatasetStatus.DRAFT, format: DatasetFormat.WECRAFT_V1, filterSnapshot: { caseIds: [caseDefs[0].id, caseDefs[4].id] }, createdBy: lead } });
  for (const [index, caseId] of [caseDefs[0].id, caseDefs[4].id].entries()) {
    const cv = await prisma.caseVersion.findFirstOrThrow({ where: { caseId } });
    const grant = await prisma.authorizationGrant.findUniqueOrThrow({ where: { subjectType_subjectId: { subjectType: AuthSubjectType.CASE, subjectId: caseId } } });
    const snapshot = { caseId, caseVersionId: cv.id, title: caseDefs.find((c) => c.id === caseId)?.title };
    await prisma.datasetItem.create({ data: { workspaceId: W, datasetId: dataset.id, itemType: DatasetItemType.CASE, caseId, split: Split.DEV, status: DatasetItemStatus.READY, snapshot: json(snapshot), contentHash: hash(JSON.stringify(snapshot)), rightsSnapshot: json(grant), sortOrder: index } });
  }

  await prisma.notification.createMany({ data: [
    { workspaceId: W, recipientId: annotator, type: "TASK_ASSIGNED", title: "你有一个盲测任务待完成", resourceType: "EXPERIMENT_PAIR", resourceId: pair.id, deepLink: "/experiments/" + experiment.id + "/blind", dedupeKey: "seed-blind-" + annotator, status: "PENDING" },
    { workspaceId: W, recipientId: lead, type: "REVIEW_PENDING", title: "案例 CA-0003 仍在评审中", resourceType: "CASE", resourceId: caseDefs[2].id, deepLink: "/cases/" + caseDefs[2].id, dedupeKey: "seed-case-" + lead, status: "PENDING" },
  ] });
  await appendAudit(prisma, { workspaceId: W, actorId: owner, action: "SEED_DEMO_DATA", resourceType: "WORKSPACE", resourceId: W, reason: "Demo workspace seed", requestId: crypto.randomUUID() });

  console.log("Seeded workspace", workspace.slug);
  console.log("Users:", userDefs.map(([, email]) => email).join(", "));
}

main().catch((error) => { console.error(error); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });

