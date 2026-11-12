import { prisma } from "./db";
import { ApiError } from "./api";
import { getSessionToken, sessionFromToken, requireSession } from "./session";
import type { AuthContext } from "./rbac";
import type { RoleCode } from "@prisma/client";

export async function getAuthContext(): Promise<AuthContext | null> {
  const session = await sessionFromToken(await getSessionToken());
  if (!session) return null;
  const memberships = await prisma.membership.findMany({
    where: { userId: session.userId, status: "ACTIVE" },
    include: { roles: { include: { role: true } } },
    orderBy: { createdAt: "asc" },
  });
  const preferred = session.workspaceId ? memberships.find((m) => m.workspaceId === session.workspaceId) : undefined;
  const membership = preferred ?? memberships[0];
  if (!membership) return null;
  return {
    userId: session.userId,
    workspaceId: membership.workspaceId,
    email: session.user.email,
    name: session.user.name,
    roles: membership.roles.map((r) => r.role.code) as RoleCode[],
  };
}

export async function requireAuth(): Promise<AuthContext> {
  const session = await requireSession();
  const ctx = await getAuthContext();
  if (!ctx) throw new ApiError(403, "FORBIDDEN", "当前账号没有可用 Workspace");
  return ctx;
}

export async function requireWorkspaceAccess(workspaceId: string) {
  const ctx = await requireAuth();
  if (ctx.workspaceId !== workspaceId) throw new ApiError(404, "NOT_FOUND", "资源不存在");
  return ctx;
}

export async function findMembershipRoles(userId: string, workspaceId: string): Promise<RoleCode[]> {
  const membership = await prisma.membership.findFirst({
    where: { userId, workspaceId, status: "ACTIVE" },
    include: { roles: { include: { role: true } } },
  });
  return (membership?.roles.map((r) => r.role.code) ?? []) as RoleCode[];
}

