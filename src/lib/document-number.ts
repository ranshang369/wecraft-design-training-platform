import type { Prisma } from "@prisma/client";

const PREFIX_PATTERN = /^[A-Z]{2,4}$/;

export function formatDocumentNumber(prefix: string, value: number): string {
  if (!PREFIX_PATTERN.test(prefix)) throw new Error("Invalid document number prefix");
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("Invalid document sequence value");
  return prefix + "-" + String(value).padStart(4, "0");
}

export async function allocateDocumentNumber(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  prefix: string,
): Promise<string> {
  if (!PREFIX_PATTERN.test(prefix)) throw new Error("Invalid document number prefix");
  const rows = await tx.$queryRaw<Array<{ value: number }>>`
    INSERT INTO "DocumentCounter" ("workspaceId", "prefix", "value", "updatedAt")
    VALUES (${workspaceId}::uuid, ${prefix}, 1, CURRENT_TIMESTAMP)
    ON CONFLICT ("workspaceId", "prefix") DO UPDATE
      SET "value" = "DocumentCounter"."value" + 1,
          "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "value"
  `;
  const value = Number(rows[0]?.value);
  return formatDocumentNumber(prefix, value);
}
