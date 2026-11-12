import { cookies } from "next/headers";
import { prisma } from "./db";
import { randomToken, sha256 } from "./hash";
import { ApiError } from "./api";

export const SESSION_COOKIE = "dt_session";
const SESSION_DAYS = 7;

export async function createSession(userId: string, workspaceId: string, ip?: string, userAgent?: string) {
  const token = randomToken(32);
  await prisma.session.create({
    data: {
      tokenHash: sha256(token),
      userId,
      workspaceId,
      expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000),
      ip,
      userAgent,
    },
  });
  const store = await cookies();
  const secure = process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : (process.env.APP_URL ?? "").startsWith("https://");
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  return token;
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
    store.delete(SESSION_COOKIE);
  }
}

export async function getSessionToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function sessionFromToken(token: string | undefined) {
  if (!token) return null;
  const session = await prisma.session.findFirst({
    where: { tokenHash: sha256(token), expiresAt: { gt: new Date() } },
    include: { user: true },
  });
  if (!session || !session.user.isActive) return null;
  return session;
}

export async function requireSession() {
  const session = await sessionFromToken(await getSessionToken());
  if (!session) throw new ApiError(401, "UNAUTHENTICATED", "请先登录");
  return session;
}

