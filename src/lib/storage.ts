import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "./db";
import { sha256 } from "./hash";
import { ApiError } from "./api";

const root = path.resolve(process.env.STORAGE_ROOT ?? "./storage");

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || "asset";
}

export async function saveFile(input: {
  workspaceId: string;
  bytes: Buffer;
  filename: string;
  mimeType: string;
  purpose: string;
  createdBy?: string;
}) {
  const objectKey = path.posix.join(input.workspaceId, crypto.randomUUID() + "-" + safeName(input.filename));
  const fullPath = path.join(root, objectKey);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, input.bytes);
  return prisma.storedFile.create({
    data: {
      workspaceId: input.workspaceId,
      provider: "local",
      bucket: "local",
      objectKey,
      mimeType: input.mimeType,
      sizeBytes: BigInt(input.bytes.length),
      sha256: sha256(input.bytes),
      purpose: input.purpose,
      createdBy: input.createdBy,
    },
  });
}

export async function getFile(fileId: string, workspaceId: string) {
  const file = await prisma.storedFile.findFirst({ where: { id: fileId, workspaceId, deletedAt: null } });
  if (!file) throw new ApiError(404, "NOT_FOUND", "文件不存在");
  return file;
}

export async function readStoredFile(fileId: string, workspaceId: string) {
  const file = await getFile(fileId, workspaceId);
  const fullPath = path.join(root, file.objectKey);
  try {
    return { file, bytes: await readFile(fullPath) };
  } catch {
    throw new ApiError(404, "NOT_FOUND", "文件内容不存在");
  }
}

export function storageRoot() {
  return root;
}

