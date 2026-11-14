import { PrismaClient, RoleCode, MembershipStatus } from "@prisma/client";
import { appendAudit } from "../../src/lib/audit";

const prisma = new PrismaClient();

const ROLE_DEFS: Array<[RoleCode, string, string]> = [
  ["OWNER", "项目负责人", "最终签收、授权、导出与治理"],
  ["ADMIN", "平台管理员", "成员、配置、集成、审计与导出"],
  ["DESIGN_LEAD", "设计负责人", "案例批准、设计裁决、授权与导出"],
  ["CONTENT_LEAD", "内容负责人", "Brief 内容审批与内容事实裁决"],
  ["EDITOR", "内容/编辑", "创建和编辑 Brief"],
  ["ANNOTATOR", "标注/QA", "案例录入、标注与盲测评审"],
  ["AI_ENGINEER", "AI 工程", "候选提交、硬检查与实验管理"],
  ["VIEWER", "只读观察者", "查看已发布内容与聚合指标"],
];

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function booleanEnv(name: string) {
  return ["1", "true", "yes"].includes((process.env[name] ?? "").toLowerCase());
}

async function main() {
  if (!booleanEnv("CONFIRM_INITIALIZE_PILOT")) throw new Error("Set CONFIRM_INITIALIZE_PILOT=1 to initialize the pilot workspace");
  const ownerEmail = required("PILOT_OWNER_EMAIL").toLowerCase();
  const workspaceSlug = required("PILOT_WORKSPACE_SLUG");
  const workspaceName = required("PILOT_WORKSPACE_NAME");
  if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(workspaceSlug)) throw new Error("PILOT_WORKSPACE_SLUG must be 3-63 lowercase letters, numbers or hyphens");
  if (workspaceSlug === "wecraft-design") throw new Error("Refusing to use the demo workspace slug for the pilot workspace");

  const owner = await prisma.user.findUnique({ where: { email: ownerEmail } });
  if (!owner || !owner.isActive) throw new Error("Pilot owner must be an existing active user");

  const defaultRoleCodes = process.env.PILOT_OWNER_ROLES?.split(",").map((value) => value.trim()).filter(Boolean) ?? ["OWNER", "ADMIN", "DESIGN_LEAD", "CONTENT_LEAD", "EDITOR", "ANNOTATOR", "AI_ENGINEER"];
  const ownerRoleCodes = defaultRoleCodes as RoleCode[];
  const allowedRoleCodes = new Set(ROLE_DEFS.map(([code]) => code));
  if (!ownerRoleCodes.includes("OWNER")) throw new Error("PILOT_OWNER_ROLES must include OWNER");
  for (const code of ownerRoleCodes) if (!allowedRoleCodes.has(code)) throw new Error(`Unknown role code: ${code}`);

  const result = await prisma.$transaction(async (tx) => {
    const roles: Record<string, string> = {};
    for (const [code, name, description] of ROLE_DEFS) {
      const role = await tx.role.upsert({ where: { code }, update: { name, description }, create: { code, name, description } });
      roles[code] = role.id;
    }

    const workspace = await tx.workspace.upsert({
      where: { slug: workspaceSlug },
      update: { name: workspaceName, status: "ACTIVE" },
      create: { slug: workspaceSlug, name: workspaceName, status: "ACTIVE" },
    });
    const existingMembership = await tx.membership.findUnique({ where: { workspaceId_userId: { workspaceId: workspace.id, userId: owner.id } } });
    const membership = await tx.membership.upsert({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: owner.id } },
      update: { status: MembershipStatus.ACTIVE },
      create: { workspaceId: workspace.id, userId: owner.id, status: MembershipStatus.ACTIVE },
    });
    for (const code of ownerRoleCodes) {
      await tx.memberRole.upsert({
        where: { membershipId_roleId: { membershipId: membership.id, roleId: roles[code] } },
        update: {},
        create: { membershipId: membership.id, roleId: roles[code] },
      });
    }

    let removedOtherMemberships = 0;
    if (booleanEnv("PILOT_DEACTIVATE_OTHER_MEMBERSHIPS")) {
      const changed = await tx.membership.updateMany({
        where: { userId: owner.id, workspaceId: { not: workspace.id }, status: MembershipStatus.ACTIVE },
        data: { status: MembershipStatus.REMOVED },
      });
      removedOtherMemberships = changed.count;
    }

    let disabledDemoUsers = 0;
    if (booleanEnv("PILOT_DISABLE_DEMO_USERS")) {
      const demoUsers = await tx.user.findMany({ where: { email: { endsWith: "@example.test" }, isActive: true }, include: { memberships: true } });
      for (const demoUser of demoUsers) {
        await tx.user.update({ where: { id: demoUser.id }, data: { isActive: false } });
        for (const membership of demoUser.memberships) {
          await appendAudit(tx, {
            workspaceId: membership.workspaceId,
            actorId: owner.id,
            action: "DEMO_USER_DISABLED",
            resourceType: "USER",
            resourceId: demoUser.id,
            after: { email: demoUser.email, disabledAt: new Date().toISOString() },
            reason: "Formal pilot initialization",
          });
        }
        disabledDemoUsers++;
      }
    }

    await appendAudit(tx, {
      workspaceId: workspace.id,
      actorId: owner.id,
      action: existingMembership ? "PILOT_WORKSPACE_UPDATED" : "PILOT_WORKSPACE_INITIALIZED",
      resourceType: "WORKSPACE",
      resourceId: workspace.id,
      after: { name: workspaceName, slug: workspaceSlug, ownerEmail, ownerRoleCodes, removedOtherMemberships, disabledDemoUsers },
      reason: "Formal pilot initialization",
    });
    return { workspace, membership, removedOtherMemberships, disabledDemoUsers };
  });

  console.log(JSON.stringify({
    ok: true,
    workspaceId: result.workspace.id,
    workspaceSlug: result.workspace.slug,
    workspaceName: result.workspace.name,
    ownerEmail,
    ownerRoleCodes,
    removedOtherMemberships: result.removedOtherMemberships,
    disabledDemoUsers: result.disabledDemoUsers,
  }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
