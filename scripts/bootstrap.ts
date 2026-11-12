import bcrypt from "bcryptjs";
import { PrismaClient, RoleCode } from "@prisma/client";
import { appendAudit } from "../src/lib/audit";

const prisma = new PrismaClient();

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

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function main() {
  const email = required("BOOTSTRAP_ADMIN_EMAIL").toLowerCase();
  const password = required("BOOTSTRAP_ADMIN_PASSWORD");
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || email.split("@")[0];
  const workspaceName = process.env.BOOTSTRAP_WORKSPACE_NAME?.trim() || "WeCraft 设计训练工作组";
  const workspaceSlug = process.env.BOOTSTRAP_WORKSPACE_SLUG?.trim() || "wecraft-design";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("BOOTSTRAP_ADMIN_EMAIL is invalid");
  if (password.length < 12) throw new Error("BOOTSTRAP_ADMIN_PASSWORD must contain at least 12 characters");
  if (password === "Demo1234!") throw new Error("Refusing to use the public demo password for production bootstrap");
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(workspaceSlug)) throw new Error("BOOTSTRAP_WORKSPACE_SLUG must be lowercase letters, numbers or hyphens");

  const passwordHash = await bcrypt.hash(password, 12);
  const result = await prisma.$transaction(async (tx) => {
    const roles: Record<string, string> = {};
    for (const [code, roleName, description] of roleDefs) {
      const role = await tx.role.upsert({ where: { code }, update: { name: roleName, description }, create: { code, name: roleName, description } });
      roles[code] = role.id;
    }

    const workspace = await tx.workspace.upsert({
      where: { slug: workspaceSlug },
      update: { name: workspaceName, status: "ACTIVE" },
      create: { name: workspaceName, slug: workspaceSlug, status: "ACTIVE" },
    });
    const existing = await tx.user.findUnique({ where: { email } });
    const user = existing
      ? await tx.user.update({ where: { id: existing.id }, data: { isActive: true } })
      : await tx.user.create({ data: { email, name, passwordHash } });
    const membership = await tx.membership.upsert({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
      update: { status: "ACTIVE" },
      create: { workspaceId: workspace.id, userId: user.id },
    });
    await tx.memberRole.upsert({
      where: { membershipId_roleId: { membershipId: membership.id, roleId: roles.OWNER } },
      update: {},
      create: { membershipId: membership.id, roleId: roles.OWNER },
    });
    await appendAudit(tx, {
      workspaceId: workspace.id,
      actorId: user.id,
      action: "BOOTSTRAP_ADMIN",
      resourceType: "WORKSPACE",
      resourceId: workspace.id,
      after: { email, workspaceSlug, role: "OWNER", existingUser: Boolean(existing) },
      reason: "Production bootstrap",
    });
    return { workspace, user, existing };
  });

  console.log(JSON.stringify({
    workspaceId: result.workspace.id,
    workspaceSlug: result.workspace.slug,
    email: result.user.email,
    role: "OWNER",
    existingUser: Boolean(result.existing),
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
