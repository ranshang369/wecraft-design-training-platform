import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { hashObject, sha256 } from "./hash";

type Db = Prisma.TransactionClient | typeof prisma;

export type AuditInput = {
  workspaceId: string;
  actorId?: string | null;
  actorType?: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  requestId?: string;
  ip?: string | null;
  userAgent?: string | null;
};

export async function appendAudit(db: Db, input: AuditInput) {
  if (db === prisma) {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)", input.workspaceId);
      return appendAuditUnlocked(tx, input);
    });
  }
  await db.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)", input.workspaceId);
  return appendAuditUnlocked(db, input);
}

async function appendAuditUnlocked(db: Db, input: AuditInput) {
  const last = await db.auditLog.findFirst({
    where: { workspaceId: input.workspaceId },
    orderBy: { id: "desc" },
    select: { entryHash: true },
  });
  const requestId = input.requestId ?? crypto.randomUUID();
  const occurredAt = new Date();
  const payload = {
    workspaceId: input.workspaceId,
    actorId: input.actorId ?? null,
    actorType: input.actorType ?? "USER",
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
    reason: input.reason ?? null,
    requestId,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    occurredAt: occurredAt.toISOString(),
  };
  const entryHash = hashObject({ payload, prevHash: last?.entryHash ?? null });
  return db.auditLog.create({
    data: {
      workspaceId: input.workspaceId,
      actorId: input.actorId ?? null,
      actorType: input.actorType ?? "USER",
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      before: (input.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (input.after ?? undefined) as Prisma.InputJsonValue | undefined,
      reason: input.reason ?? null,
      requestId,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      occurredAt,
      prevHash: last?.entryHash ?? null,
      entryHash,
    },
  });
}

export function requestMeta(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return {
    ip: forwarded?.split(",")[0]?.trim() ?? null,
    userAgent: request.headers.get("user-agent"),
    requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
  };
}

export function auditFingerprint(value: unknown) {
  return sha256(JSON.stringify(value ?? null));
}


