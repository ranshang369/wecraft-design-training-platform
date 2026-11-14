import bcrypt from "bcryptjs";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ApiError, body, json } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { createSession, destroySession } from "@/lib/session";
import { can, assertCapability, type AuthContext } from "@/lib/rbac";
import { appendAudit, requestMeta } from "@/lib/audit";
import { randomToken, hashObject, sha256 } from "@/lib/hash";
import { saveFile } from "@/lib/storage";
import { notify } from "@/lib/notifications";
import { DIMENSION_CODES, DIMENSIONS } from "@/lib/constants";
import { parseScreenshotDataUrl } from "@/lib/image";
import { aggregateReviewEvidence } from "@/lib/review-aggregation";
import { experimentReviewerCount } from "@/lib/experiment-protocol";
import { assertLoginAllowed, clearLoginFailures, recordLoginFailure } from "@/lib/login-guard";
import { allocateDocumentNumber } from "@/lib/document-number";
import { INTENT_TAG_IDS, START_POINT_IDS, caseMetadataReview, inferInternalArchetype } from "@/lib/case-metadata";

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const inviteSchema = z.object({ email: z.string().email(), roleCode: z.enum(["OWNER","ADMIN","DESIGN_LEAD","CONTENT_LEAD","EDITOR","ANNOTATOR","AI_ENGINEER","VIEWER"]) });
const acceptSchema = z.object({ token: z.string().min(20), name: z.string().min(1).max(80), password: z.string().min(8) });
const briefSchema = z.object({
  title: z.string().min(1).max(200), purpose: z.enum(["CASE_SOURCE","GOLDEN_EVAL","BOTH"]).default("CASE_SOURCE"), split: z.enum(["DEV","HOLDOUT"]).default("DEV"),
  manuscriptMarkdown: z.string().min(1), images: z.array(z.string()).default([]), targetAudience: z.string().min(1), designCommission: z.string().min(1), brandRequirements: z.string().min(1), prohibitedItems: z.string().min(1),
  userIntent: z.string().optional(), hardConstraints: z.array(z.string()).optional(), acceptableArchetypes: z.array(z.string()).optional(), mustAvoid: z.array(z.string()).optional(), rubricTargets: z.record(z.number()).optional(), acceptanceNotes: z.string().optional(),
});
const scoresSchema = z.record(z.union([z.number().int().min(1).max(5), z.null()]));
const evidenceSchema = z.object({ evidenceType: z.enum(["SCREENSHOT_REGION","HTML_FRAGMENT","MANUSCRIPT_EXCERPT"]), locator: z.string().min(1), excerpt: z.string().min(1) });
const reviewSubmitSchema = z.object({ recommendation: z.enum(["PUBLISHABLE","NOT_PUBLISHABLE","CHANGES_REQUESTED"]), rationale: z.string().min(2), scores: scoresSchema, evidence: z.array(evidenceSchema).min(1) });
const reviewReviseSchema = reviewSubmitSchema.extend({ reason: z.string().min(2) });
const authorizationSchema = z.object({
  canDeriveMechanism: z.boolean(), canUseForGeneration: z.boolean(), canUseForDisplay: z.boolean(), canUseForTraining: z.boolean(), canUseForEvaluation: z.boolean(), canShowPublicly: z.boolean(),
  evidenceStatus: z.enum(["MISSING","PENDING","VERIFIED","REJECTED","EXPIRED","REVOKED"]).default("MISSING"), evidenceNote: z.string().optional(), reason: z.string().min(2),
});
const visualGrammarText = z.string().trim().min(1).max(600);
const visualGrammarSchema = z.object({
  surfaceMaterial: visualGrammarText,
  typeSystem: visualGrammarText,
  imageTreatment: visualGrammarText,
  composition: visualGrammarText,
  colorLight: visualGrammarText,
  decorationAnnotations: visualGrammarText,
  firstScreenAction: visualGrammarText,
}).strict();
const caseCreateSchema = z.object({
  title: z.string().min(1), archetype: z.enum(["SELF_REFERENTIAL","MATERIAL","SCENE","GENRE","SCHEMA","INTERFACE","CITATION","PSYCHOLOGICAL","PROCESS"]).optional(), briefId: z.string().uuid().optional().nullable(),
  applicableConditions: z.string().min(1), designMechanism: z.string().min(1), bodyMechanism: z.string().trim().min(1).max(2_000),
  startPoints: z.array(z.enum(START_POINT_IDS)).min(1).max(3), intentTags: z.array(z.enum(INTENT_TAG_IDS)).max(8).default([]),
  structureSignature: z.string().trim().max(1_000).optional().default(""), visualGrammar: visualGrammarSchema,
  antiPatterns: z.array(z.string()).default([]), mechanismTags: z.array(z.string()).default([]), selfScores: scoresSchema,
  sourceType: z.enum(["INTERNAL_ORIGINAL","USER_CONTENT","THIRD_PARTY","PUBLIC_DOMAIN"]).default("INTERNAL_ORIGINAL"), sourceNote: z.string().min(1),
  html: z.string().min(20), screenshotDataUrl: z.string().startsWith("data:image/"),
});
const caseUpdateSchema = caseCreateSchema.partial();
const counterCreateSchema = z.object({
  title: z.string().min(1), archetype: z.enum(["SELF_REFERENTIAL","MATERIAL","SCENE","GENRE","SCHEMA","INTERFACE","CITATION","PSYCHOLOGICAL","PROCESS"]), briefId: z.string().uuid().optional().nullable(),
  failureSummary: z.string().min(1), failureLabels: z.array(z.string()).min(1), reproductionSteps: z.string().min(1), rootCause: z.string().optional(), repairSuggestion: z.string().min(1),
  applicableConditions: z.array(z.string()).default([]), sourceType: z.enum(["INTERNAL_ORIGINAL","USER_CONTENT","THIRD_PARTY","PUBLIC_DOMAIN"]).default("INTERNAL_ORIGINAL"), sourceNote: z.string().min(1),
  html: z.string().min(20), screenshotDataUrl: z.string().startsWith("data:image/"),
});

function fullScores(value: Record<string, number | null>) {
  for (const code of DIMENSION_CODES) if (!(code in value)) throw new ApiError(400, "VALIDATION_ERROR", "缺少评分维度：" + code);
  for (const [code, score] of Object.entries(value)) {
    if (!DIMENSION_CODES.includes(code as typeof DIMENSION_CODES[number])) throw new ApiError(400, "VALIDATION_ERROR", "未知评分维度");
    if (score === null && code !== "IMAGE_NARRATIVE") throw new ApiError(400, "VALIDATION_ERROR", "只有图像叙事可以为 N/A");
    if (score !== null && (!Number.isInteger(score) || score < 1 || score > 5)) throw new ApiError(400, "VALIDATION_ERROR", "评分必须是 1–5 整数");
  }
  return value;
}
function assertCaseReviewGate(
  reviews: Parameters<typeof aggregateReviewEvidence>[0],
  options: { allowNonPublishable?: boolean } = {},
) {
  const evidence = aggregateReviewEvidence(reviews);
  if (evidence.reviewers < 2) throw new ApiError(409, "INVALID_STATE", "必须有两名独立评审已提交");
  if (!options.allowNonPublishable && !evidence.publishable) throw new ApiError(409, "INVALID_STATE", "存在未通过或需修改的评审，不能进入可用案例库");
  if (!evidence.scoresComplete) throw new ApiError(409, "INVALID_STATE", "双评六维分数不完整，不能进入可用案例库");
  if (!evidence.qualityFloorMet) throw new ApiError(409, "INVALID_STATE", "双评中位分未达到训练样例门槛（均分至少 4，单项至少 3）");
}
function isHoldoutAdmin(ctx: AuthContext) {
  return ctx.roles.includes("OWNER") || ctx.roles.includes("ADMIN");
}
async function assertBriefReference(ctx: AuthContext, briefId: string | null | undefined) {
  if (!briefId) return;
  const brief = await prisma.brief.findFirst({ where: { id: briefId, workspaceId: ctx.workspaceId, deletedAt: null }, select: { split: true } });
  if (!brief) throw new ApiError(404, "NOT_FOUND", "Brief 不存在");
  if (brief.split === "HOLDOUT" && !isHoldoutAdmin(ctx)) throw new ApiError(404, "NOT_FOUND", "Brief 不存在");
}
async function taskName(task: { type: string; subjectId: string }) {
  if (task.type === "CASE_REVIEW") { const c = await prisma.case.findUnique({ where: { id: task.subjectId }, select: { caseNo: true, title: true } }); return c ? c.caseNo + " · " + c.title : "案例评审"; }
  if (task.type === "COUNTEREXAMPLE_REVIEW") { const c = await prisma.counterexample.findUnique({ where: { id: task.subjectId }, select: { counterexampleNo: true, title: true } }); return c ? c.counterexampleNo + " · " + c.title : "反例评审"; }
  if (task.type === "BLIND_PAIRWISE" || task.type === "ARBITRATION") return "盲测比较 · " + task.subjectId.slice(0, 8);
  return "评审任务";
}
async function assertNotHoldoutForReview(ctx: AuthContext, briefId: string | null | undefined) {
  if (!briefId) return;
  const brief = await prisma.brief.findFirst({ where: { id: briefId, workspaceId: ctx.workspaceId }, select: { split: true, briefNo: true } });
  if (brief?.split === "HOLDOUT") throw new ApiError(409, "HOLDOUT_RESTRICTED", "Holdout Brief 不得进入普通评审任务");
}

export async function issueReviewTasks(ctx: AuthContext, caseId: string, reviewerIds: string[]) {
  const caseValue = await prisma.case.findFirstOrThrow({ where: { id: caseId, workspaceId: ctx.workspaceId }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
  if (!caseValue.versions[0]) throw new ApiError(409, "INVALID_STATE", "案例没有可评审版本");
  await assertNotHoldoutForReview(ctx, caseValue.briefId);
  const unique = [...new Set(reviewerIds)].filter((id) => id !== caseValue.createdBy);
  if (unique.length < 2) throw new ApiError(400, "VALIDATION_ERROR", "至少需要 2 名非作者评审");
  const tasks = [];
  for (const reviewerId of unique.slice(0, 2)) {
    const membership = await prisma.membership.findFirst({ where: { userId: reviewerId, workspaceId: ctx.workspaceId, status: "ACTIVE" }, include: { roles: { include: { role: true } } } });
    if (!membership) throw new ApiError(400, "VALIDATION_ERROR", "评审人不在当前 Workspace");
    const existing = await prisma.reviewTask.findFirst({ where: { type: "CASE_REVIEW", subjectId: caseId, subjectVersionId: caseValue.versions[0].id, assigneeId: reviewerId, status: { not: "CANCELLED" } } });
    if (existing) { tasks.push(existing); continue; }
    const task = await prisma.reviewTask.create({ data: { workspaceId: ctx.workspaceId, type: "CASE_REVIEW", subjectType: "CASE", subjectId: caseId, subjectVersionId: caseValue.versions[0].id, assigneeId: reviewerId, reviewRole: "REVIEWER", status: "ASSIGNED", assignedBy: ctx.userId } });
    await notify({ workspaceId: ctx.workspaceId, recipientId: reviewerId, type: "TASK_ASSIGNED", title: "案例评审待处理：" + caseValue.caseNo, resourceType: "CASE", resourceId: caseId, deepLink: "/tasks/" + task.id, dedupeKey: "task:" + task.id });
    tasks.push(task);
  }
  await prisma.case.update({ where: { id: caseId }, data: { status: "IN_REVIEW" } });
  return tasks;
}

async function issueCounterexampleReviewTasks(ctx: AuthContext, counterexampleId: string, reviewerIds: string[]) {
  const item = await prisma.counterexample.findFirstOrThrow({ where: { id: counterexampleId, workspaceId: ctx.workspaceId }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
  if (!item.versions[0]) throw new ApiError(409, "INVALID_STATE", "反例没有可评审版本");
  await assertNotHoldoutForReview(ctx, item.briefId);
  const unique = [...new Set(reviewerIds)].filter((id) => id !== item.createdBy);
  if (unique.length < 2) throw new ApiError(400, "VALIDATION_ERROR", "至少需要 2 名非作者评审");
  const tasks = [];
  for (const reviewerId of unique.slice(0, 2)) {
    const membership = await prisma.membership.findFirst({ where: { userId: reviewerId, workspaceId: ctx.workspaceId, status: "ACTIVE" } });
    if (!membership) throw new ApiError(400, "VALIDATION_ERROR", "评审人不在当前 Workspace");
    const existing = await prisma.reviewTask.findFirst({ where: { type: "COUNTEREXAMPLE_REVIEW", subjectId: counterexampleId, subjectVersionId: item.versions[0].id, assigneeId: reviewerId, status: { not: "CANCELLED" } } });
    if (existing) { tasks.push(existing); continue; }
    const task = await prisma.reviewTask.create({ data: { workspaceId: ctx.workspaceId, type: "COUNTEREXAMPLE_REVIEW", subjectType: "COUNTEREXAMPLE", subjectId: counterexampleId, subjectVersionId: item.versions[0].id, assigneeId: reviewerId, reviewRole: "REVIEWER", status: "ASSIGNED", assignedBy: ctx.userId } });
    await notify({ workspaceId: ctx.workspaceId, recipientId: reviewerId, type: "TASK_ASSIGNED", title: "反例评审待处理：" + item.counterexampleNo, resourceType: "COUNTEREXAMPLE", resourceId: counterexampleId, deepLink: "/tasks/" + task.id, dedupeKey: "task:" + task.id });
    tasks.push(task);
  }
  await prisma.counterexample.update({ where: { id: counterexampleId }, data: { status: "IN_REVIEW" } });
  return tasks;
}
export async function handleCore(request: Request, segments: string[], method: string): Promise<Response | null> {
  const path = segments.join("/");
  const meta = requestMeta(request);
  if (path === "auth/login" && method === "POST") {
    const input = await body(request, loginSchema);
    const email = input.email.trim().toLowerCase();
    await assertLoginAllowed(email, meta.ip);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive || !(await bcrypt.compare(input.password, user.passwordHash))) {
      await recordLoginFailure(email, meta.ip);
      throw new ApiError(401, "UNAUTHENTICATED", "邮箱或密码错误");
    }
    const membership = await prisma.membership.findFirst({ where: { userId: user.id, status: "ACTIVE" }, include: { roles: { include: { role: true } } } });
    if (!membership) throw new ApiError(403, "FORBIDDEN", "账号没有可用 Workspace");
    await createSession(user.id, membership.workspaceId, meta.ip ?? undefined, meta.userAgent ?? undefined);
    await clearLoginFailures(email, meta.ip);
    await appendAudit(prisma, { workspaceId: membership.workspaceId, actorId: user.id, action: "LOGIN", resourceType: "USER", resourceId: user.id, requestId: meta.requestId, ip: meta.ip, userAgent: meta.userAgent });
    return json({ user: { id: user.id, name: user.name, email: user.email }, roles: membership.roles.map((r) => r.role.code), workspaceId: membership.workspaceId });
  }
  if (path === "auth/logout" && method === "POST") { await destroySession(); return json({ ok: true }); }
  if (path === "invitations/accept" && method === "POST") {
    const input = await body(request, acceptSchema);
    const invitation = await prisma.invitation.findFirst({ where: { tokenHash: sha256(input.token), status: "PENDING", expiresAt: { gt: new Date() } } });
    if (!invitation) throw new ApiError(400, "INVALID_STATE", "邀请链接无效或已过期");
    const result = await prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({ where: { email: invitation.email } });
      if (user) {
        if (!user.isActive || !(await bcrypt.compare(input.password, user.passwordHash))) throw new ApiError(401, "UNAUTHENTICATED", "该邮箱已有账号，请使用原密码接受邀请");
      } else {
        user = await tx.user.create({ data: { email: invitation.email, name: input.name, passwordHash: await bcrypt.hash(input.password, 10) } });
      }
      let membership = await tx.membership.findUnique({ where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId: user.id } } });
      if (!membership) membership = await tx.membership.create({ data: { workspaceId: invitation.workspaceId, userId: user.id } });
      else if (membership.status !== "ACTIVE") membership = await tx.membership.update({ where: { id: membership.id }, data: { status: "ACTIVE" } });
      const role = await tx.role.findUniqueOrThrow({ where: { code: invitation.roleCode } });
      await tx.memberRole.upsert({ where: { membershipId_roleId: { membershipId: membership.id, roleId: role.id } }, update: {}, create: { membershipId: membership.id, roleId: role.id } });
      await tx.invitation.update({ where: { id: invitation.id }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
      return { user, membership };
    });
    await createSession(result.user.id, result.membership.workspaceId, meta.ip ?? undefined, meta.userAgent ?? undefined);
    await appendAudit(prisma, { workspaceId: invitation.workspaceId, actorId: result.user.id, action: "INVITATION_ACCEPTED", resourceType: "INVITATION", resourceId: invitation.id, requestId: meta.requestId, ip: meta.ip, userAgent: meta.userAgent });
    return json({ user: { id: result.user.id, name: result.user.name, email: result.user.email }, workspaceId: result.membership.workspaceId });
  }

  const ctx = await requireAuth();
  if (path === "auth/me" && method === "GET") return json({ ...ctx });

  if (path === "invitations" && method === "GET") {
    assertCapability(can.manageMembers(ctx.roles));
    return json(await prisma.invitation.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { createdAt: "desc" } }));
  }
  if (path === "invitations" && method === "POST") {
    assertCapability(can.manageMembers(ctx.roles));
    const input = await body(request, inviteSchema);
    const token = randomToken(32);
    if (input.roleCode === "OWNER" && !ctx.roles.includes("OWNER")) throw new ApiError(403, "FORBIDDEN", "只有 Owner 可以邀请 Owner");
    const existingMember = await prisma.membership.findFirst({ where: { workspaceId: ctx.workspaceId, user: { email: input.email.toLowerCase() } } });
    if (existingMember) throw new ApiError(409, "INVALID_STATE", "该邮箱已是当前 Workspace 成员");
    const invitation = await prisma.invitation.create({ data: { workspaceId: ctx.workspaceId, email: input.email.toLowerCase(), roleCode: input.roleCode, tokenHash: sha256(token), invitedBy: ctx.userId, expiresAt: new Date(Date.now() + 7 * 86400_000) } });
    await appendAudit(prisma, { workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "INVITATION_CREATED", resourceType: "INVITATION", resourceId: invitation.id, after: { email: invitation.email, roleCode: invitation.roleCode }, requestId: meta.requestId, ip: meta.ip, userAgent: meta.userAgent });
    return json({ invitation, acceptUrl: "/invite/" + token });
  }
  const memberRoleMatch = path.match(/^members\/([^/]+)\/roles$/);
  if (memberRoleMatch && method === "PATCH") {
    assertCapability(can.manageMembers(ctx.roles));
    const membershipId = memberRoleMatch[1];
    const input = await body(request, z.object({ roles: z.array(z.enum(["OWNER","ADMIN","DESIGN_LEAD","CONTENT_LEAD","EDITOR","ANNOTATOR","AI_ENGINEER","VIEWER"])).min(1) }));
    const membership = await prisma.membership.findFirstOrThrow({ where: { id: membershipId, workspaceId: ctx.workspaceId }, include: { roles: { include: { role: true } } } });
    if (!ctx.roles.includes("OWNER") && input.roles.includes("OWNER")) throw new ApiError(403, "FORBIDDEN", "只有 Owner 可以授予 Owner");
    const removingOwner = membership.roles.some((r) => r.role.code === "OWNER") && !input.roles.includes("OWNER");
    if (removingOwner) {
      const owners = await prisma.memberRole.count({ where: { role: { code: "OWNER" }, membership: { workspaceId: ctx.workspaceId, status: "ACTIVE" } } });
      if (owners <= 1) throw new ApiError(409, "INVALID_STATE", "不能移除最后一个 Owner");
    }
    const roleRows = await prisma.role.findMany({ where: { code: { in: input.roles } } });
    await prisma.$transaction(async (tx) => {
      await tx.memberRole.deleteMany({ where: { membershipId } });
      await tx.memberRole.createMany({ data: roleRows.map((role) => ({ membershipId, roleId: role.id })) });
    });
    await appendAudit(prisma, { workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "MEMBER_ROLES_CHANGED", resourceType: "MEMBERSHIP", resourceId: membershipId, before: membership.roles.map((r) => r.role.code), after: input.roles, requestId: meta.requestId, ip: meta.ip, userAgent: meta.userAgent });
    return json({ ok: true });
  }
  if (path === "members" && method === "GET") {
    assertCapability(can.viewMembers(ctx.roles));
    return json(await prisma.membership.findMany({ where: { workspaceId: ctx.workspaceId, status: "ACTIVE" }, include: { user: { select: { id: true, name: true, email: true } }, roles: { include: { role: true } } }, orderBy: { createdAt: "asc" } }));
  }

  if (path === "briefs" && method === "GET") {
    const canSeeHoldout = ctx.roles.includes("OWNER") || ctx.roles.includes("ADMIN");
    const url = new URL(request.url);
    const split = url.searchParams.get("split");
    const status = url.searchParams.get("status");
    return json(await prisma.brief.findMany({ where: { workspaceId: ctx.workspaceId, deletedAt: null, ...(canSeeHoldout ? {} : { split: { not: "HOLDOUT" } }), ...(split && canSeeHoldout ? { split: split as "DEV" | "HOLDOUT" } : {}), ...(status ? { status: status as "DRAFT" | "READY" | "ARCHIVED" } : {}) }, include: { versions: { orderBy: { version: "desc" }, take: 1 }, _count: { select: { cases: true } } }, orderBy: { createdAt: "desc" } }));
  }
  if (path === "briefs" && method === "POST") {
    assertCapability(can.editBriefs(ctx.roles));
    const input = await body(request, briefSchema);
    if (input.split === "HOLDOUT" && !ctx.roles.includes("OWNER") && !ctx.roles.includes("ADMIN")) throw new ApiError(403, "FORBIDDEN", "只有 Owner/Admin 可以创建 Holdout Brief");
    const brief = await prisma.$transaction(async (tx) => {
      const created = await tx.brief.create({ data: { workspaceId: ctx.workspaceId, briefNo: await allocateDocumentNumber(tx, ctx.workspaceId, "BR"), title: input.title, purpose: input.purpose, split: input.split, ownerId: ctx.userId } });
      const version = await tx.briefVersion.create({ data: { briefId: created.id, version: 1, manuscriptMarkdown: input.manuscriptMarkdown, images: input.images, targetAudience: input.targetAudience, designCommission: input.designCommission, brandRequirements: input.brandRequirements, prohibitedItems: input.prohibitedItems, userIntent: input.userIntent, hardConstraints: input.hardConstraints ?? [], acceptableArchetypes: input.acceptableArchetypes ?? [], mustAvoid: input.mustAvoid ?? [], rubricTargets: input.rubricTargets ?? {}, acceptanceNotes: input.acceptanceNotes, contentHash: hashObject(input), createdBy: ctx.userId } });
      await appendAudit(tx, { workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "BRIEF_CREATED", resourceType: "BRIEF", resourceId: created.id, after: { ...input, version: 1 }, requestId: meta.requestId, ip: meta.ip, userAgent: meta.userAgent });
      return { ...created, currentVersionData: version };
    });
    return json(brief, 201);
  }
  const briefMatch = path.match(/^briefs\/([^/]+)(?:\/(approve))?$/);
  if (briefMatch) {
    const brief = await prisma.brief.findFirst({ where: { id: briefMatch[1], workspaceId: ctx.workspaceId, deletedAt: null }, include: { versions: { orderBy: { version: "desc" } }, cases: { select: { id: true, caseNo: true, title: true, status: true } } } });
    if (!brief) throw new ApiError(404, "NOT_FOUND", "Brief 不存在");
    if (brief.split === "HOLDOUT" && !ctx.roles.includes("OWNER") && !ctx.roles.includes("ADMIN")) throw new ApiError(404, "NOT_FOUND", "Brief 不存在");
    if (method === "GET" && !briefMatch[2]) return json(brief);
    if (method === "PATCH" && !briefMatch[2]) {
      assertCapability(can.editBriefs(ctx.roles));
      const input = await body(request, briefSchema);
      const versionNo = brief.currentVersion + 1;
      const updated = await prisma.$transaction(async (tx) => {
        const version = await tx.briefVersion.create({ data: { briefId: brief.id, version: versionNo, manuscriptMarkdown: input.manuscriptMarkdown, images: input.images, targetAudience: input.targetAudience, designCommission: input.designCommission, brandRequirements: input.brandRequirements, prohibitedItems: input.prohibitedItems, userIntent: input.userIntent, hardConstraints: input.hardConstraints ?? [], acceptableArchetypes: input.acceptableArchetypes ?? [], mustAvoid: input.mustAvoid ?? [], rubricTargets: input.rubricTargets ?? {}, acceptanceNotes: input.acceptanceNotes, contentHash: hashObject(input), createdBy: ctx.userId } });
        const changed = await tx.brief.update({ where: { id: brief.id }, data: { title: input.title, purpose: input.purpose, split: input.split, currentVersion: versionNo } });
        await appendAudit(tx, { workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "BRIEF_VERSION_CREATED", resourceType: "BRIEF", resourceId: brief.id, before: { currentVersion: brief.currentVersion }, after: { currentVersion: versionNo }, requestId: meta.requestId, ip: meta.ip, userAgent: meta.userAgent });
        return { ...changed, currentVersionData: version };
      });
      return json(updated);
    }
    if (method === "POST" && briefMatch[2] === "approve") {
      assertCapability(can.approveBriefs(ctx.roles));
      const updated = await prisma.brief.update({ where: { id: brief.id }, data: { status: "READY", approvedBy: ctx.userId, approvedAt: new Date() } });
      await appendAudit(prisma, { workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "BRIEF_APPROVED", resourceType: "BRIEF", resourceId: brief.id, requestId: meta.requestId, ip: meta.ip, userAgent: meta.userAgent });
      return json(updated);
    }
  }

  if (path === "cases" && method === "GET") {
    const canSeeHoldout = ctx.roles.includes("OWNER") || ctx.roles.includes("ADMIN");
    const visible = ctx.roles.includes("VIEWER") ? { status: "ELIGIBLE" as const } : {};
    const holdoutFilter = canSeeHoldout ? {} : { OR: [{ briefId: null }, { brief: { split: { not: "HOLDOUT" as const } } }] };
    return json(await prisma.case.findMany({ where: { workspaceId: ctx.workspaceId, deletedAt: null, ...visible, ...holdoutFilter }, include: { versions: { orderBy: { version: "desc" }, take: 1 }, assets: { include: { storedFile: true } }, _count: { select: { reviews: true } } }, orderBy: { createdAt: "desc" } }));
  }
  if (path === "cases" && method === "POST") {
    assertCapability(can.editCases(ctx.roles));
    const input = await body(request, caseCreateSchema);
    await assertBriefReference(ctx, input.briefId);
    fullScores(input.selfScores);
    const metadata = caseMetadataReview(input);
    if (metadata.errors.length) throw new ApiError(422, "VALIDATION_ERROR", metadata.errors.join("；"));
    const screenshot = parseScreenshotDataUrl(input.screenshotDataUrl);
    const created = await prisma.$transaction(async (tx) => {
      const archetype = input.archetype ?? inferInternalArchetype(input.startPoints);
      const caseValue = await tx.case.create({ data: { workspaceId: ctx.workspaceId, caseNo: await allocateDocumentNumber(tx, ctx.workspaceId, "CA"), title: input.title, archetype, briefId: input.briefId || null, createdBy: ctx.userId, ownerId: ctx.userId } });
      const version = await tx.caseVersion.create({ data: { caseId: caseValue.id, version: 1, applicableConditions: input.applicableConditions, designMechanism: input.designMechanism, bodyMechanism: input.bodyMechanism, startPoints: input.startPoints, intentTags: input.intentTags, structureSignature: input.structureSignature, visualGrammar: input.visualGrammar, antiPatterns: input.antiPatterns, mechanismTags: input.mechanismTags, selfScores: input.selfScores, sourceType: input.sourceType ?? "INTERNAL_ORIGINAL", sourceNote: input.sourceNote, contentHash: hashObject(input), createdBy: ctx.userId } });
      const screenshotFile = await saveFile({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, filename: caseValue.caseNo + "-375.png", mimeType: screenshot.mimeType, purpose: "CASE_SCREENSHOT", bytes: screenshot.bytes });
      const htmlFile = await saveFile({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, filename: caseValue.caseNo + ".html", mimeType: "text/html", purpose: "CASE_HTML", bytes: Buffer.from(input.html) });
      await tx.caseAsset.create({ data: { caseId: caseValue.id, caseVersionId: version.id, storedFileId: screenshotFile.id, kind: "SCREENSHOT_375", width: screenshot.width, height: screenshot.height, isPrimary: true } });
      await tx.caseAsset.create({ data: { caseId: caseValue.id, caseVersionId: version.id, storedFileId: htmlFile.id, kind: "HTML" } });
      await tx.authorizationGrant.create({ data: { workspaceId: ctx.workspaceId, subjectType: "CASE", subjectId: caseValue.id, updatedBy: ctx.userId } });
      await appendAudit(tx, { workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "CASE_CREATED", resourceType: "CASE", resourceId: caseValue.id, after: { title: input.title, archetype: input.archetype }, requestId: meta.requestId, ip: meta.ip, userAgent: meta.userAgent });
      return caseValue;
    });
    return json({ ...created, warnings: metadata.warnings }, 201);
  }
  const caseMatch = path.match(/^cases\/([^/]+)(?:\/(submit|assign|approve|authorization|versions|resolve))?$/);
  if (caseMatch) {
    const caseValue = await prisma.case.findFirst({ where: { id: caseMatch[1], workspaceId: ctx.workspaceId, deletedAt: null }, include: { brief: true, versions: { orderBy: { version: "desc" } }, assets: { include: { storedFile: true } }, reviews: { include: { scores: true, evidence: true } } } });
    if (!caseValue) throw new ApiError(404, "NOT_FOUND", "案例不存在");
    if (ctx.roles.includes("VIEWER") && caseValue.status !== "ELIGIBLE") throw new ApiError(404, "NOT_FOUND", "案例不存在");
    const canSeeHoldout = ctx.roles.includes("OWNER") || ctx.roles.includes("ADMIN");
    if (caseValue.brief?.split === "HOLDOUT" && !canSeeHoldout) throw new ApiError(404, "NOT_FOUND", "案例不存在");
    if (method === "GET" && !caseMatch[2]) {
      const privileged = ctx.roles.some((r) => ["OWNER","ADMIN","DESIGN_LEAD","CONTENT_LEAD"].includes(r));
      const reviewerCount = new Set(caseValue.reviews.map((review) => review.reviewerId)).size;
      const reviews = privileged || reviewerCount >= 2 ? caseValue.reviews : caseValue.reviews.filter((review) => review.reviewerId === ctx.userId);
      return json({ ...caseValue, reviews, authorization: await prisma.authorizationGrant.findUnique({ where: { subjectType_subjectId: { subjectType: "CASE", subjectId: caseValue.id } } }) });
    }
    if (method === "PATCH" && !caseMatch[2]) {
      assertCapability(can.editCases(ctx.roles));
      const input = await body(request, caseUpdateSchema);
      if (input.briefId !== undefined) await assertBriefReference(ctx, input.briefId);
      if (input.selfScores) fullScores(input.selfScores);
      const current = caseValue.versions[0];
      if (!current) throw new ApiError(409, "INVALID_STATE", "案例没有可编辑版本");
      const currentAssets = caseValue.assets.filter((asset) => asset.caseVersionId === current.id);
      const htmlAsset = currentAssets.find((asset) => asset.kind === "HTML");
      const screenshotAsset = currentAssets.find((asset) => asset.kind === "SCREENSHOT_375");
      if (!input.screenshotDataUrl && !screenshotAsset) throw new ApiError(400, "VALIDATION_ERROR", "案例必须保留 375px 截图");
      if (!input.html && !htmlAsset) throw new ApiError(400, "VALIDATION_ERROR", "案例必须保留 HTML 证据");
      const screenshot = input.screenshotDataUrl ? parseScreenshotDataUrl(input.screenshotDataUrl) : null;
      const versionNo = caseValue.currentVersion + 1;
      const merged = {
        applicableConditions: input.applicableConditions ?? current.applicableConditions,
        designMechanism: input.designMechanism ?? current.designMechanism,
        bodyMechanism: input.bodyMechanism ?? current.bodyMechanism,
        startPoints: (input.startPoints ?? (Array.isArray(current.startPoints) ? current.startPoints : [])) as Prisma.InputJsonValue,
        intentTags: (input.intentTags ?? (Array.isArray(current.intentTags) ? current.intentTags : [])) as Prisma.InputJsonValue,
        structureSignature: input.structureSignature ?? current.structureSignature,
        visualGrammar: (input.visualGrammar ?? current.visualGrammar ?? undefined) as Prisma.InputJsonValue | undefined,
        antiPatterns: input.antiPatterns ?? (current.antiPatterns as string[]),
        mechanismTags: input.mechanismTags ?? (current.mechanismTags as string[]),
        selfScores: input.selfScores ?? (current.selfScores as Record<string, number | null>),
        sourceType: input.sourceType ?? current.sourceType,
        sourceNote: input.sourceNote ?? current.sourceNote,
      };
      const metadata = caseMetadataReview(merged);
      if (metadata.errors.length) throw new ApiError(422, "VALIDATION_ERROR", metadata.errors.join("；"));
      const screenshotFile = screenshot ? await saveFile({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, filename: caseValue.caseNo + "-v" + versionNo + "-375.png", mimeType: screenshot.mimeType, purpose: "CASE_SCREENSHOT", bytes: screenshot.bytes }) : null;
      const htmlFile = input.html ? await saveFile({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, filename: caseValue.caseNo + "-v" + versionNo + ".html", mimeType: "text/html", purpose: "CASE_HTML", bytes: Buffer.from(input.html) }) : null;
      const result = await prisma.$transaction(async (tx) => {
        const version = await tx.caseVersion.create({ data: { caseId: caseValue.id, version: versionNo, ...merged, contentHash: hashObject({ ...merged, previousHash: current.contentHash, htmlChanged: Boolean(input.html) }), createdBy: ctx.userId } });
        const screenshotFileId = screenshotFile?.id ?? screenshotAsset?.storedFileId;
        if (screenshotFileId) await tx.caseAsset.create({ data: { caseId: caseValue.id, caseVersionId: version.id, storedFileId: screenshotFileId, kind: "SCREENSHOT_375", width: screenshot?.width ?? screenshotAsset?.width ?? 375, height: screenshot?.height ?? screenshotAsset?.height ?? 600, isPrimary: true } });
        await tx.caseAsset.create({ data: { caseId: caseValue.id, caseVersionId: version.id, storedFileId: htmlFile?.id ?? htmlAsset!.storedFileId, kind: "HTML" } });
        const nextArchetype = input.archetype
          ?? (input.startPoints ? inferInternalArchetype(input.startPoints) : caseValue.archetype);
        const updated = await tx.case.update({ where: { id: caseValue.id }, data: { title: input.title ?? caseValue.title, archetype: nextArchetype, briefId: input.briefId === undefined ? caseValue.briefId : input.briefId, currentVersion: versionNo, status: "SUBMITTED", approvedBy: null, approvedAt: null, rowVersion: { increment: 1 } } });
        await appendAudit(tx, { workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "CASE_VERSION_CREATED", resourceType: "CASE", resourceId: caseValue.id, before: { currentVersion: caseValue.currentVersion }, after: { currentVersion: versionNo }, requestId: meta.requestId, ip: meta.ip, userAgent: meta.userAgent });
        return { ...updated, version };
      });
      return json({ ...result, warnings: metadata.warnings }, 201);
    }
    if (method === "POST" && caseMatch[2] === "submit") {
      assertCapability(can.editCases(ctx.roles));
      if (!caseValue.assets.some((a) => a.kind === "SCREENSHOT_375") || !caseValue.assets.some((a) => a.kind === "HTML")) throw new ApiError(400, "VALIDATION_ERROR", "必须上传 375px 截图和 HTML");
      const updated = await prisma.case.update({ where: { id: caseValue.id }, data: { status: "SUBMITTED" } });
      await appendAudit(prisma, { workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "CASE_SUBMITTED", resourceType: "CASE", resourceId: caseValue.id, requestId: meta.requestId, ip: meta.ip, userAgent: meta.userAgent });
      return json(updated);
    }
    if (method === "POST" && caseMatch[2] === "assign") {
      assertCapability(can.assignReviews(ctx.roles));
      const input = await body(request, z.object({ reviewerIds: z.array(z.string().uuid()).min(2) }));
      const tasks = await issueReviewTasks(ctx, caseValue.id, input.reviewerIds);
      await appendAudit(prisma, { workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "CASE_REVIEWERS_ASSIGNED", resourceType: "CASE", resourceId: caseValue.id, after: { reviewerIds: input.reviewerIds }, requestId: meta.requestId, ip: meta.ip, userAgent: meta.userAgent });
      return json(tasks);
    }
    if (method === "POST" && caseMatch[2] === "approve") {
      assertCapability(can.approveCases(ctx.roles));
      const reviews = await prisma.caseReview.findMany({ where: { caseId: caseValue.id, caseVersionId: caseValue.versions[0].id, status: "SUBMITTED" }, include: { scores: true } });
      assertCaseReviewGate(reviews);
      const grant = await prisma.authorizationGrant.findUnique({ where: { subjectType_subjectId: { subjectType: "CASE", subjectId: caseValue.id } } });
      if (!grant || grant.evidenceStatus !== "VERIFIED") throw new ApiError(409, "INVALID_STATE", "授权证据尚未核验");
      const updated = await prisma.case.update({ where: { id: caseValue.id }, data: { status: "ELIGIBLE", approvedBy: ctx.userId, approvedAt: new Date() } });
      await appendAudit(prisma, { workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "CASE_PUBLISHED", resourceType: "CASE", resourceId: caseValue.id, requestId: meta.requestId, ip: meta.ip, userAgent: meta.userAgent });
      return json(updated);
    }
    if (method === "PUT" && caseMatch[2] === "authorization") {
      assertCapability(can.editAuthorization(ctx.roles), "只有 Owner 或 Design Lead 可以修改授权");
      const input = await body(request, authorizationSchema);
      const before = await prisma.authorizationGrant.findUnique({ where: { subjectType_subjectId: { subjectType: "CASE", subjectId: caseValue.id } } });
      const { reason, ...grantInput } = input;
      const grant = await prisma.$transaction(async (tx) => {
        const updated = await tx.authorizationGrant.upsert({ where: { subjectType_subjectId: { subjectType: "CASE", subjectId: caseValue.id } }, update: { ...grantInput, updatedBy: ctx.userId }, create: { workspaceId: ctx.workspaceId, subjectType: "CASE", subjectId: caseValue.id, ...grantInput, updatedBy: ctx.userId } });
        await tx.authorizationEvent.create({ data: { grantId: updated.id, actorId: ctx.userId, action: "AUTHORIZATION_UPDATED", before: JSON.parse(JSON.stringify(before ?? {})), after: JSON.parse(JSON.stringify(grantInput)), reason } });
        await appendAudit(tx, { workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "AUTHORIZATION_UPDATED", resourceType: "CASE", resourceId: caseValue.id, before, after: updated, reason: input.reason, requestId: meta.requestId, ip: meta.ip, userAgent: meta.userAgent });
        return updated;
      });
      return json(grant);
    }
    if (method === "POST" && caseMatch[2] === "resolve") {
      assertCapability(can.adjudicate(ctx.roles));
      const input = await body(request, z.object({ outcome: z.enum(["ELIGIBLE","REJECTED","CHANGES_REQUESTED"]), reason: z.string().min(2) }));
      if (input.outcome === "ELIGIBLE") {
        const reviews = caseValue.reviews.filter((review) => (
          review.status === "SUBMITTED" && review.caseVersionId === caseValue.versions[0]?.id
        ));
        assertCaseReviewGate(reviews, { allowNonPublishable: true });
        const grant = await prisma.authorizationGrant.findUnique({ where: { subjectType_subjectId: { subjectType: "CASE", subjectId: caseValue.id } } });
        if (!grant || grant.evidenceStatus !== "VERIFIED") throw new ApiError(409, "INVALID_STATE", "授权证据尚未核验");
      }
      const updated = await prisma.case.update({ where: { id: caseValue.id }, data: { status: input.outcome, approvedBy: input.outcome === "ELIGIBLE" ? ctx.userId : undefined, approvedAt: input.outcome === "ELIGIBLE" ? new Date() : undefined } });
      await prisma.reviewTask.updateMany({ where: { type: "ARBITRATION", subjectId: caseValue.id, status: "ASSIGNED" }, data: { status: "SUBMITTED", submittedAt: new Date() } });
      await appendAudit(prisma, { workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "CASE_ARBITRATION_RESOLVED", resourceType: "CASE", resourceId: caseValue.id, after: input, reason: input.reason, requestId: meta.requestId, ip: meta.ip, userAgent: meta.userAgent });
      return json(updated);
    }
  }

  if (path === "counterexamples" && method === "GET") {
    const canSeeHoldout = ctx.roles.includes("OWNER") || ctx.roles.includes("ADMIN");
    const holdoutFilter = canSeeHoldout ? {} : { OR: [{ briefId: null }, { brief: { split: { not: "HOLDOUT" as const } } }] };
    const visible = ctx.roles.includes("VIEWER") ? { status: "APPROVED" as const } : {};
    return json(await prisma.counterexample.findMany({ where: { workspaceId: ctx.workspaceId, deletedAt: null, ...visible, ...holdoutFilter }, include: { versions: { orderBy: { version: "desc" }, take: 1 }, assets: { include: { storedFile: true } } }, orderBy: { createdAt: "desc" } }));
  }
  if (path === "counterexamples" && method === "POST") {
    assertCapability(can.editCounterexamples(ctx.roles));
    const input = await body(request, counterCreateSchema);
    await assertBriefReference(ctx, input.briefId);
    const screenshot = parseScreenshotDataUrl(input.screenshotDataUrl);
    const created = await prisma.$transaction(async (tx) => {
      const item = await tx.counterexample.create({ data: { workspaceId: ctx.workspaceId, counterexampleNo: await allocateDocumentNumber(tx, ctx.workspaceId, "CE"), title: input.title, archetype: input.archetype, briefId: input.briefId || null, createdBy: ctx.userId, ownerId: ctx.userId } });
      const version = await tx.counterexampleVersion.create({ data: { counterexampleId: item.id, version: 1, failureSummary: input.failureSummary, failureLabels: input.failureLabels, reproductionSteps: input.reproductionSteps, rootCause: input.rootCause, repairSuggestion: input.repairSuggestion, applicableConditions: input.applicableConditions, sourceType: input.sourceType ?? "INTERNAL_ORIGINAL", sourceNote: input.sourceNote, contentHash: hashObject(input), createdBy: ctx.userId } });
      const screenshotFile = await saveFile({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, filename: item.counterexampleNo + "-375.png", mimeType: screenshot.mimeType, purpose: "COUNTEREXAMPLE_SCREENSHOT", bytes: screenshot.bytes });
      const htmlFile = await saveFile({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, filename: item.counterexampleNo + ".html", mimeType: "text/html", purpose: "COUNTEREXAMPLE_HTML", bytes: Buffer.from(input.html) });
      await tx.counterexampleAsset.create({ data: { counterexampleId: item.id, counterexampleVersionId: version.id, storedFileId: screenshotFile.id, kind: "SCREENSHOT_375", width: 375 } });
      await tx.counterexampleAsset.create({ data: { counterexampleId: item.id, counterexampleVersionId: version.id, storedFileId: htmlFile.id, kind: "HTML" } });
      await tx.authorizationGrant.create({ data: { workspaceId: ctx.workspaceId, subjectType: "COUNTEREXAMPLE", subjectId: item.id, updatedBy: ctx.userId } });
      await appendAudit(tx, { workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "COUNTEREXAMPLE_CREATED", resourceType: "COUNTEREXAMPLE", resourceId: item.id, after: input, requestId: meta.requestId, ip: meta.ip, userAgent: meta.userAgent });
      return item;
    });
    return json(created, 201);
  }
  const counterMatch = path.match(/^counterexamples\/([^/]+)(?:\/(submit|assign|approve|authorization))?$/);
  if (counterMatch) {
    const item = await prisma.counterexample.findFirst({ where: { id: counterMatch[1], workspaceId: ctx.workspaceId, deletedAt: null }, include: { brief: true, versions: { orderBy: { version: "desc" } }, assets: { include: { storedFile: true } }, reviews: { include: { scores: true, evidence: true } } } });
    if (!item) throw new ApiError(404, "NOT_FOUND", "反例不存在");
    if (item.brief?.split === "HOLDOUT" && !ctx.roles.includes("OWNER") && !ctx.roles.includes("ADMIN")) throw new ApiError(404, "NOT_FOUND", "反例不存在");
    if (method === "GET" && !counterMatch[2]) {
      const privileged = ctx.roles.some((role) => ["OWNER","ADMIN","DESIGN_LEAD","CONTENT_LEAD"].includes(role));
      const reviewerCount = new Set(item.reviews.map((review) => review.reviewerId)).size;
      const reviews = privileged || reviewerCount >= 2 ? item.reviews : item.reviews.filter((review) => review.reviewerId === ctx.userId);
      return json({ ...item, reviews, authorization: await prisma.authorizationGrant.findUnique({ where: { subjectType_subjectId: { subjectType: "COUNTEREXAMPLE", subjectId: item.id } } }) });
    }
    if (method === "POST" && counterMatch[2] === "submit") {
      assertCapability(can.editCounterexamples(ctx.roles));
      if (!item.assets.some((asset) => asset.kind === "SCREENSHOT_375") || !item.assets.some((asset) => asset.kind === "HTML")) throw new ApiError(400, "VALIDATION_ERROR", "必须上传 375px 截图和 HTML");
      const updated = await prisma.counterexample.update({ where: { id: item.id }, data: { status: "SUBMITTED" } });
      await appendAudit(prisma, { workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "COUNTEREXAMPLE_SUBMITTED", resourceType: "COUNTEREXAMPLE", resourceId: item.id, requestId: meta.requestId, ip: meta.ip, userAgent: meta.userAgent });
      return json(updated);
    }
    if (method === "POST" && counterMatch[2] === "assign") {
      assertCapability(can.assignReviews(ctx.roles));
      const input = await body(request, z.object({ reviewerIds: z.array(z.string().uuid()).min(2) }));
      const tasks = await issueCounterexampleReviewTasks(ctx, item.id, input.reviewerIds);
      await appendAudit(prisma, { workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "COUNTEREXAMPLE_REVIEWERS_ASSIGNED", resourceType: "COUNTEREXAMPLE", resourceId: item.id, after: { reviewerIds: input.reviewerIds }, requestId: meta.requestId, ip: meta.ip, userAgent: meta.userAgent });
      return json(tasks);
    }
    if (method === "POST" && counterMatch[2] === "approve") {
      assertCapability(can.approveCases(ctx.roles));
      const updated = await prisma.counterexample.update({ where: { id: item.id }, data: { status: "APPROVED", approvedBy: ctx.userId, approvedAt: new Date() } });
      await appendAudit(prisma, { workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "COUNTEREXAMPLE_PUBLISHED", resourceType: "COUNTEREXAMPLE", resourceId: item.id, requestId: meta.requestId, ip: meta.ip, userAgent: meta.userAgent });
      return json(updated);
    }
    if (method === "PUT" && counterMatch[2] === "authorization") {
      assertCapability(can.editAuthorization(ctx.roles), "只有 Owner 或 Design Lead 可以修改授权");
      const input = await body(request, authorizationSchema);
      const before = await prisma.authorizationGrant.findUnique({ where: { subjectType_subjectId: { subjectType: "COUNTEREXAMPLE", subjectId: item.id } } });
      const { reason, ...grantInput } = input;
      const grant = await prisma.authorizationGrant.upsert({ where: { subjectType_subjectId: { subjectType: "COUNTEREXAMPLE", subjectId: item.id } }, update: { ...grantInput, updatedBy: ctx.userId }, create: { workspaceId: ctx.workspaceId, subjectType: "COUNTEREXAMPLE", subjectId: item.id, ...grantInput, updatedBy: ctx.userId } });
      await prisma.authorizationEvent.create({ data: { grantId: grant.id, actorId: ctx.userId, action: "AUTHORIZATION_UPDATED", before: JSON.parse(JSON.stringify(before ?? {})), after: JSON.parse(JSON.stringify(grantInput)), reason } });
      await appendAudit(prisma, { workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "AUTHORIZATION_UPDATED", resourceType: "COUNTEREXAMPLE", resourceId: item.id, before, after: grant, reason: input.reason, requestId: meta.requestId, ip: meta.ip, userAgent: meta.userAgent });
      return json(grant);
    }
  }

  if (path === "review-tasks" && method === "GET") {
    const tasks = await prisma.reviewTask.findMany({ where: { workspaceId: ctx.workspaceId, assigneeId: ctx.userId, status: { in: ["PENDING","ASSIGNED","IN_PROGRESS"] } }, orderBy: { assignedAt: "desc" } });
    const canSeeHoldout = ctx.roles.includes("OWNER") || ctx.roles.includes("ADMIN");
    const visible = [];
    for (const task of tasks) {
      if (!canSeeHoldout && (task.type === "CASE_REVIEW" || task.type === "COUNTEREXAMPLE_REVIEW")) {
        const subject = task.type === "CASE_REVIEW" ? await prisma.case.findUnique({ where: { id: task.subjectId }, select: { brief: { select: { split: true } } } }) : await prisma.counterexample.findUnique({ where: { id: task.subjectId }, select: { brief: { select: { split: true } } } });
        if (subject?.brief?.split === "HOLDOUT") continue;
      }
      visible.push({ ...task, title: await taskName(task) });
    }
    return json(visible);
  }
  const taskMatch = path.match(/^review-tasks\/([^/]+)(?:\/(claim|submit|revise|resolve|arbitrate))?$/);
  if (taskMatch) {
    const task = await prisma.reviewTask.findFirst({ where: { id: taskMatch[1], workspaceId: ctx.workspaceId } });
    if (!task) throw new ApiError(404, "NOT_FOUND", "任务不存在");
    const allowed = task.assigneeId === ctx.userId || can.assignReviews(ctx.roles) || can.adjudicate(ctx.roles);
    if (!allowed) throw new ApiError(404, "NOT_FOUND", "任务不存在");
    if ((task.type === "CASE_REVIEW" || task.type === "COUNTEREXAMPLE_REVIEW") && !ctx.roles.includes("OWNER") && !ctx.roles.includes("ADMIN")) {
      const subjectCase = task.type === "CASE_REVIEW" ? await prisma.case.findUnique({ where: { id: task.subjectId }, select: { brief: { select: { split: true } } } }) : await prisma.counterexample.findUnique({ where: { id: task.subjectId }, select: { brief: { select: { split: true } } } });
      if (subjectCase?.brief?.split === "HOLDOUT") throw new ApiError(404, "NOT_FOUND", "任务不存在");
    }
    if (method === "GET" && !taskMatch[2]) {
      if (task.type === "BLIND_PAIRWISE") {
        const pair = task.experimentPairId ? await prisma.experimentPair.findUnique({ where: { id: task.experimentPairId } }) : null;
        return json({ ...task, blind: pair ? { pairId: pair.id, experimentId: pair.experimentId, briefId: pair.briefId, pairNo: pair.pairNo } : null });
      }
      if (task.type === "CASE_REVIEW") {
        const caseValue = await prisma.case.findUnique({ where: { id: task.subjectId }, include: { versions: { where: { id: task.subjectVersionId! }, take: 1 }, assets: { include: { storedFile: true } }, brief: { include: { versions: { orderBy: { version: "desc" }, take: 1 } } } } });
        const myReview = await prisma.caseReview.findFirst({ where: { taskId: task.id }, orderBy: { version: "desc" }, include: { scores: true, evidence: true } });
        const otherSubmitted = await prisma.caseReview.count({ where: { caseId: task.subjectId, caseVersionId: task.subjectVersionId!, status: "SUBMITTED" } });
        return json({ ...task, case: caseValue, myReview, canSeeOthers: otherSubmitted >= 2 });
      }
      if (task.type === "ARBITRATION" && task.subjectType === "EXPERIMENT_PAIR" && task.experimentPairId) {
        const pair = await prisma.experimentPair.findUnique({ where: { id: task.experimentPairId }, include: { comparisons: { where: { status: "SUBMITTED" }, include: { scores: true } } } });
        if (!pair) throw new ApiError(404, "NOT_FOUND", "盲测 pair 不存在");
        const leftCandidate = await prisma.candidate.findUnique({ where: { id: pair.leftCandidateId }, include: { versions: { orderBy: { version: "desc" }, take: 1 }, assets: true } });
        const rightCandidate = await prisma.candidate.findUnique({ where: { id: pair.rightCandidateId }, include: { versions: { orderBy: { version: "desc" }, take: 1 }, assets: true } });
        const side = (candidate: typeof leftCandidate, label: "LEFT"|"RIGHT") => ({ side: label, version: candidate?.versions[0]?.version, htmlFileId: candidate?.assets.find((asset) => asset.kind === "HTML")?.storedFileId ?? null, screenshotFileId: candidate?.assets.find((asset) => asset.kind === "SCREENSHOT_375")?.storedFileId ?? null });
        return json({
          ...task,
          arbitration: {
            pairId: pair.id, pairNo: pair.pairNo, status: pair.status, adjudicatedPreference: pair.adjudicatedPreference, adjudicationReason: pair.adjudicationReason, adjudicatedAt: pair.adjudicatedAt,
            sides: { left: side(leftCandidate, "LEFT"), right: side(rightCandidate, "RIGHT") },
            comparisons: pair.comparisons.map((comparison, index) => ({
              reviewerLabel: "评审 " + (index + 1), preference: comparison.preference,
              normalizedPreference: comparison.preference === "TIE" ? "TIE" : comparison.preferredCandidateId === pair.leftCandidateId ? "LEFT" : "RIGHT",
              rationale: comparison.rationale, confidence: comparison.confidence, scores: comparison.scores,
            })),
          },
        });
      }
      if (task.type === "COUNTEREXAMPLE_REVIEW") {
        const item = await prisma.counterexample.findUnique({ where: { id: task.subjectId }, include: { versions: { where: { id: task.subjectVersionId! }, take: 1 }, assets: { include: { storedFile: true } }, brief: { include: { versions: { orderBy: { version: "desc" }, take: 1 } } } } });
        const myReview = await prisma.counterexampleReview.findFirst({ where: { taskId: task.id }, orderBy: { version: "desc" }, include: { scores: true, evidence: true } });
        const otherSubmitted = await prisma.counterexampleReview.count({ where: { counterexampleId: task.subjectId, status: "SUBMITTED" } });
        return json({ ...task, counterexample: item, myReview, canSeeOthers: otherSubmitted >= 2 });
      }
      return json(task);
    }
    if (method === "POST" && taskMatch[2] === "arbitrate") {
      if (task.type !== "ARBITRATION" || task.subjectType !== "EXPERIMENT_PAIR" || !task.experimentPairId) throw new ApiError(400, "VALIDATION_ERROR", "该任务不是盲测裁决");
      if (task.assigneeId !== ctx.userId && !can.adjudicate(ctx.roles)) throw new ApiError(403, "FORBIDDEN", "只有裁决人可以提交裁决");
      const input = await body(request, z.object({ preference: z.enum(["LEFT","RIGHT","TIE"]), reason: z.string().min(2) }));
      const pair = await prisma.experimentPair.findUniqueOrThrow({ where: { id: task.experimentPairId }, include: { comparisons: { where: { status: "SUBMITTED" } } } });
      const experiment = await prisma.experiment.findUniqueOrThrow({ where: { id: pair.experimentId } });
      const requiredReviewers = experimentReviewerCount(experiment.protocol);
      const submittedReviewers = new Set(pair.comparisons.map((comparison) => comparison.reviewerId)).size;
      if (submittedReviewers < requiredReviewers) throw new ApiError(409, "INVALID_STATE", `仍有独立评审未提交（${submittedReviewers}/${requiredReviewers}）`);
      const adjudicatedCandidateId = input.preference === "LEFT" ? pair.leftCandidateId : input.preference === "RIGHT" ? pair.rightCandidateId : null;
      const updated = await prisma.$transaction(async (tx) => {
        const changed = await tx.experimentPair.update({ where: { id: pair.id }, data: { adjudicatedPreference: input.preference, adjudicatedCandidateId, adjudicationReason: input.reason, adjudicatedBy: ctx.userId, adjudicatedAt: new Date(), status: "COMPLETED" } });
        await tx.reviewTask.update({ where: { id: task.id }, data: { status: "SUBMITTED", submittedAt: new Date() } });
        await appendAudit(tx, { workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "BLIND_PAIR_ADJUDICATED", resourceType: "EXPERIMENT_PAIR", resourceId: pair.id, after: { preference: input.preference, candidateId: adjudicatedCandidateId }, reason: input.reason, requestId: meta.requestId, ip: meta.ip, userAgent: meta.userAgent });
        return changed;
      });
      return json(updated);
    }
    if (method === "POST" && taskMatch[2] === "claim") {
      if (task.assigneeId !== ctx.userId) throw new ApiError(403, "FORBIDDEN", "只能领取分配给自己的任务");
      if (!["ASSIGNED","PENDING"].includes(task.status)) throw new ApiError(409, "INVALID_STATE", "任务当前不可领取");
      return json(await prisma.reviewTask.update({ where: { id: task.id }, data: { status: "IN_PROGRESS", acceptedAt: new Date() } }));
    }
    if (method === "POST" && taskMatch[2] === "revise") {
      if (task.assigneeId !== ctx.userId) throw new ApiError(403, "FORBIDDEN", "只能修订自己的评审");
      if (task.status !== "SUBMITTED") throw new ApiError(409, "INVALID_STATE", "只有已提交的评审可以修订");
      if (task.type !== "CASE_REVIEW" && task.type !== "COUNTEREXAMPLE_REVIEW") throw new ApiError(400, "VALIDATION_ERROR", "该任务不支持评审修订");
      const input = await body(request, reviewReviseSchema);
      fullScores(input.scores);
      if (task.type === "CASE_REVIEW") {
        const caseValue = await prisma.case.findUniqueOrThrow({ where: { id: task.subjectId }, include: { versions: { where: { id: task.subjectVersionId! }, take: 1 } } });
        await assertNotHoldoutForReview(ctx, caseValue.briefId);
        if (!["IN_REVIEW","CHANGES_REQUESTED"].includes(caseValue.status)) throw new ApiError(409, "INVALID_STATE", "案例当前状态不允许评审修订");
        const previous = await prisma.caseReview.findFirst({ where: { taskId: task.id, status: "SUBMITTED" }, orderBy: { version: "desc" } });
        if (!previous) throw new ApiError(409, "INVALID_STATE", "找不到可修订的评审");
        const snapshot = { caseId: caseValue.id, caseNo: caseValue.caseNo, title: caseValue.title, version: caseValue.versions[0]?.version, contentHash: caseValue.versions[0]?.contentHash, reviewedAt: new Date().toISOString(), revisionReason: input.reason };
        const review = await prisma.$transaction(async (tx) => {
          await tx.caseReview.update({ where: { id: previous.id }, data: { status: "SUPERSEDED" } });
          const created = await tx.caseReview.create({ data: { workspaceId: ctx.workspaceId, taskId: task.id, caseId: caseValue.id, caseVersionId: task.subjectVersionId!, reviewerId: ctx.userId, version: previous.version + 1, supersedesId: previous.id, recommendation: input.recommendation, rationale: input.rationale, snapshot: JSON.parse(JSON.stringify(snapshot)), contentHash: hashObject(snapshot) } });
          await tx.reviewScore.createMany({ data: Object.entries(input.scores).map(([dimensionCode, score]) => ({ caseReviewId: created.id, dimensionCode, score, isNa: score === null })) });
          await tx.reviewEvidence.createMany({ data: input.evidence.map((e) => ({ caseReviewId: created.id, evidenceType: e.evidenceType, locator: e.locator, excerpt: e.excerpt })) });
          await appendAudit(tx, { workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "REVIEW_REVISED", resourceType: "CASE", resourceId: caseValue.id, before: { reviewId: previous.id, version: previous.version }, after: { reviewId: created.id, version: created.version }, reason: input.reason, requestId: meta.requestId, ip: meta.ip, userAgent: meta.userAgent });
          return created;
        });
        return json(review, 201);
      }
      const item = await prisma.counterexample.findUniqueOrThrow({ where: { id: task.subjectId }, include: { versions: { where: { id: task.subjectVersionId! }, take: 1 } } });
      await assertNotHoldoutForReview(ctx, item.briefId);
      if (!["IN_REVIEW","CHANGES_REQUESTED"].includes(item.status)) throw new ApiError(409, "INVALID_STATE", "反例当前状态不允许评审修订");
      const previous = await prisma.counterexampleReview.findFirst({ where: { taskId: task.id, status: "SUBMITTED" }, orderBy: { version: "desc" } });
      if (!previous) throw new ApiError(409, "INVALID_STATE", "找不到可修订的评审");
      const snapshot = { counterexampleId: item.id, counterexampleNo: item.counterexampleNo, title: item.title, version: item.versions[0]?.version, contentHash: item.versions[0]?.contentHash, reviewedAt: new Date().toISOString(), revisionReason: input.reason };
      const review = await prisma.$transaction(async (tx) => {
        await tx.counterexampleReview.update({ where: { id: previous.id }, data: { status: "SUPERSEDED" } });
        const created = await tx.counterexampleReview.create({ data: { workspaceId: ctx.workspaceId, taskId: task.id, counterexampleId: item.id, counterexampleVersionId: task.subjectVersionId!, reviewerId: ctx.userId, version: previous.version + 1, supersedesId: previous.id, recommendation: input.recommendation, rationale: input.rationale, snapshot: JSON.parse(JSON.stringify(snapshot)), contentHash: hashObject(snapshot) } });
        await tx.reviewScore.createMany({ data: Object.entries(input.scores).map(([dimensionCode, score]) => ({ counterexampleReviewId: created.id, dimensionCode, score, isNa: score === null })) });
        await tx.reviewEvidence.createMany({ data: input.evidence.map((e) => ({ counterexampleReviewId: created.id, evidenceType: e.evidenceType, locator: e.locator, excerpt: e.excerpt })) });
        await appendAudit(tx, { workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "REVIEW_REVISED", resourceType: "COUNTEREXAMPLE", resourceId: item.id, before: { reviewId: previous.id, version: previous.version }, after: { reviewId: created.id, version: created.version }, reason: input.reason, requestId: meta.requestId, ip: meta.ip, userAgent: meta.userAgent });
        return created;
      });
      return json(review, 201);
    }
    if (method === "POST" && taskMatch[2] === "submit") {
      if (task.assigneeId !== ctx.userId) throw new ApiError(403, "FORBIDDEN", "只能提交自己的任务");
      if (task.status === "SUBMITTED") throw new ApiError(409, "INVALID_STATE", "评审已提交，不能原地修改；请创建修订版本");
      if (task.type !== "CASE_REVIEW" && task.type !== "COUNTEREXAMPLE_REVIEW") throw new ApiError(400, "VALIDATION_ERROR", "该任务不是案例评分任务");
      const input = await body(request, reviewSubmitSchema);
      fullScores(input.scores);
      if (task.type === "CASE_REVIEW") {
        const caseValue = await prisma.case.findUniqueOrThrow({ where: { id: task.subjectId }, include: { versions: { where: { id: task.subjectVersionId! }, take: 1 } } });
        await assertNotHoldoutForReview(ctx, caseValue.briefId);
        if (caseValue.createdBy === ctx.userId) throw new ApiError(403, "FORBIDDEN", "不能评审自己创建的案例");
        const snapshot = { caseId: caseValue.id, caseNo: caseValue.caseNo, title: caseValue.title, version: caseValue.versions[0]?.version, contentHash: caseValue.versions[0]?.contentHash, reviewedAt: new Date().toISOString() };
        const review = await prisma.$transaction(async (tx) => {
          const created = await tx.caseReview.create({ data: { workspaceId: ctx.workspaceId, taskId: task.id, caseId: caseValue.id, caseVersionId: task.subjectVersionId!, reviewerId: ctx.userId, recommendation: input.recommendation, rationale: input.rationale, snapshot: JSON.parse(JSON.stringify(snapshot)), contentHash: hashObject(snapshot) } });
          await tx.reviewScore.createMany({ data: Object.entries(input.scores).map(([dimensionCode, score]) => ({ caseReviewId: created.id, dimensionCode, score, isNa: score === null })) });
          await tx.reviewEvidence.createMany({ data: input.evidence.map((e) => ({ caseReviewId: created.id, evidenceType: e.evidenceType, locator: e.locator, excerpt: e.excerpt })) });
          await tx.reviewTask.update({ where: { id: task.id }, data: { status: "SUBMITTED", submittedAt: new Date() } });
          await appendAudit(tx, { workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "REVIEW_SUBMITTED", resourceType: "CASE", resourceId: caseValue.id, after: { reviewId: created.id, recommendation: input.recommendation }, requestId: meta.requestId, ip: meta.ip, userAgent: meta.userAgent });
          return created;
        });
        const latest = await prisma.caseReview.findMany({ where: { caseId: caseValue.id, caseVersionId: task.subjectVersionId!, status: "SUBMITTED" }, include: { scores: true } });
        const reviewers = new Set(latest.map((r) => r.reviewerId));
        if (reviewers.size >= 2) {
          const byReviewer = new Map<string, typeof latest>();
          for (const r of latest) byReviewer.set(r.reviewerId, [...(byReviewer.get(r.reviewerId) ?? []), r]);
          const pair = [...byReviewer.values()].slice(0, 2).map((rows) => rows[0]);
          let dispute = pair.some((r) => r.recommendation !== pair[0].recommendation);
          for (const dim of DIMENSION_CODES) {
            const a = pair[0]?.scores.find((s) => s.dimensionCode === dim)?.score;
            const b = pair[1]?.scores.find((s) => s.dimensionCode === dim)?.score;
            if (a != null && b != null && Math.abs(a - b) >= 2) dispute = true;
          }
          if (dispute) {
            const leadMembership = await prisma.membership.findFirst({ where: { workspaceId: ctx.workspaceId, status: "ACTIVE", roles: { some: { role: { code: "DESIGN_LEAD" } } } }, include: { user: true } });
            await prisma.case.update({ where: { id: caseValue.id }, data: { status: "ARBITRATION" } });
            if (leadMembership) {
              const exists = await prisma.reviewTask.findFirst({ where: { type: "ARBITRATION", subjectId: caseValue.id, status: "ASSIGNED" } });
              if (!exists) await prisma.reviewTask.create({ data: { workspaceId: ctx.workspaceId, type: "ARBITRATION", subjectType: "CASE", subjectId: caseValue.id, subjectVersionId: task.subjectVersionId, assigneeId: leadMembership.userId, reviewRole: "ADJUDICATOR", status: "ASSIGNED", assignedBy: ctx.userId } });
            }
          }
        }
        return json(review, 201);
      }
      const item = await prisma.counterexample.findUniqueOrThrow({ where: { id: task.subjectId }, include: { versions: { where: { id: task.subjectVersionId! }, take: 1 } } });
      await assertNotHoldoutForReview(ctx, item.briefId);
      if (item.createdBy === ctx.userId) throw new ApiError(403, "FORBIDDEN", "不能评审自己创建的反例");
      const snapshot = { counterexampleId: item.id, counterexampleNo: item.counterexampleNo, title: item.title, version: item.versions[0]?.version, contentHash: item.versions[0]?.contentHash, reviewedAt: new Date().toISOString() };
      const review = await prisma.$transaction(async (tx) => {
        const created = await tx.counterexampleReview.create({ data: { workspaceId: ctx.workspaceId, taskId: task.id, counterexampleId: item.id, counterexampleVersionId: task.subjectVersionId!, reviewerId: ctx.userId, recommendation: input.recommendation, rationale: input.rationale, snapshot: JSON.parse(JSON.stringify(snapshot)), contentHash: hashObject(snapshot) } });
        await tx.reviewScore.createMany({ data: Object.entries(input.scores).map(([dimensionCode, score]) => ({ counterexampleReviewId: created.id, dimensionCode, score, isNa: score === null })) });
        await tx.reviewEvidence.createMany({ data: input.evidence.map((e) => ({ counterexampleReviewId: created.id, evidenceType: e.evidenceType, locator: e.locator, excerpt: e.excerpt })) });
        await tx.reviewTask.update({ where: { id: task.id }, data: { status: "SUBMITTED", submittedAt: new Date() } });
        await appendAudit(tx, { workspaceId: ctx.workspaceId, actorId: ctx.userId, action: "REVIEW_SUBMITTED", resourceType: "COUNTEREXAMPLE", resourceId: item.id, after: { reviewId: created.id }, requestId: meta.requestId, ip: meta.ip, userAgent: meta.userAgent });
        return created;
      });
      return json(review, 201);
    }
  }
  return null;
}

