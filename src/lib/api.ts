import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

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

export async function body<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try { raw = await request.json(); } catch { throw new ApiError(400, "VALIDATION_ERROR", "请求体必须为 JSON"); }
  return schema.parse(raw);
}

export function param(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

