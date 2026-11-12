import { prisma } from "./db";

export async function notify(input: {
  workspaceId: string;
  recipientId: string;
  type: string;
  title: string;
  resourceType?: string;
  resourceId?: string;
  deepLink: string;
  dedupeKey: string;
  channel?: "IN_APP" | "FEISHU" | "EMAIL";
}) {
  return prisma.notification.upsert({
    where: { dedupeKey: input.dedupeKey },
    update: {},
    create: {
      workspaceId: input.workspaceId,
      recipientId: input.recipientId,
      type: input.type,
      title: input.title,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      deepLink: input.deepLink,
      dedupeKey: input.dedupeKey,
      channel: input.channel ?? "IN_APP",
      status: input.channel === "FEISHU" && !process.env.FEISHU_APP_ID ? "SKIPPED" : "PENDING",
    },
  });
}

