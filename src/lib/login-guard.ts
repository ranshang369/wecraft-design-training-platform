import { ApiError } from "./api";
import { prisma } from "./db";
import { sha256 } from "./hash";

const WINDOW_MS = 15 * 60_000;
const BLOCK_MS = 15 * 60_000;
const ACCOUNT_LIMIT = 8;
const IP_LIMIT = 30;

type ThrottleTarget = { key: string; limit: number };

export function loginThrottleTargets(email: string, ip?: string | null): ThrottleTarget[] {
  const targets: ThrottleTarget[] = [{ key: "account:" + sha256(email.trim().toLowerCase()), limit: ACCOUNT_LIMIT }];
  if (ip) targets.push({ key: "ip:" + sha256(ip), limit: IP_LIMIT });
  return targets;
}

export async function assertLoginAllowed(email: string, ip?: string | null) {
  const now = new Date();
  const records = await prisma.authThrottle.findMany({
    where: { key: { in: loginThrottleTargets(email, ip).map((target) => target.key) }, blockedUntil: { gt: now } },
    select: { blockedUntil: true },
  });
  if (records.length) {
    const retryAt = new Date(Math.max(...records.map((record) => record.blockedUntil!.getTime())));
    throw new ApiError(429, "RATE_LIMITED", "登录尝试过多，请稍后再试", { retryAt: retryAt.toISOString() });
  }
}

export async function recordLoginFailure(email: string, ip?: string | null) {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    for (const target of loginThrottleTargets(email, ip)) {
      const existing = await tx.authThrottle.findUnique({ where: { key: target.key } });
      if (!existing || now.getTime() - existing.windowStartedAt.getTime() >= WINDOW_MS) {
        await tx.authThrottle.upsert({
          where: { key: target.key },
          create: { key: target.key, failures: 1, windowStartedAt: now },
          update: { failures: 1, windowStartedAt: now, blockedUntil: null },
        });
        continue;
      }
      const failures = existing.failures + 1;
      await tx.authThrottle.update({
        where: { key: target.key },
        data: { failures, blockedUntil: failures >= target.limit ? new Date(now.getTime() + BLOCK_MS) : existing.blockedUntil },
      });
    }
  });
}

export async function clearLoginFailures(email: string, ip?: string | null) {
  await prisma.authThrottle.deleteMany({ where: { key: { in: loginThrottleTargets(email, ip).map((target) => target.key) } } });
}
