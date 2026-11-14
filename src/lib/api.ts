import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

export const MAX_JSON_BODY_BYTES = 10 * 1024 * 1024;

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function json(data: unknown, status = 200) {
  const safe = JSON.parse(JSON.stringify(data, (_, value) => typeof value === "bigint" ? value.toString() : value));
  return NextResponse.json(safe, { status });
}

export function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: { code: error.code, message: error.message, details: error.details } }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "输入不完整或格式错误", details: error.flatten() } }, { status: 400 });
  }
  console.error(error);
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } }, { status: 500 });
}

async function readJsonText(request: Request): Promise<string> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_JSON_BODY_BYTES)) {
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "请求体超过 10MB 上限");
  }
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_JSON_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new ApiError(413, "PAYLOAD_TOO_LARGE", "请求体超过 10MB 上限");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function body<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try { raw = JSON.parse(await readJsonText(request)); } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "VALIDATION_ERROR", "请求体必须为 JSON");
  }
  return schema.parse(raw);
}

export function param(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

