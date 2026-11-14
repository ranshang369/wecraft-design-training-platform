import { errorResponse, json, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleCore } from "./api-core";
import { handleExperiments } from "./api-experiments";
import { handleData } from "./api-data";

export async function handleApi(request: Request, segments: string[]) {
  try {
    const method = request.method;
    if (segments.join("/") === "health" && method === "GET") {
      let database = "ok";
      try { await prisma.$queryRaw`SELECT 1`; } catch { database = "error"; }
      const healthy = database === "ok";
      return json({ ok: healthy, service: "wecraft-design-training-platform", database, revision: process.env.APP_REVISION ?? "unknown", time: new Date().toISOString() }, healthy ? 200 : 503);
    }
    const core = await handleCore(request, segments, method);
    if (core) return core;
    const ctx = await requireAuth();
    const experiments = await handleExperiments(request, segments, method, ctx);
    if (experiments) return experiments;
    const data = await handleData(request, segments, method, ctx);
    if (data) return data;
    throw new ApiError(404, "NOT_FOUND", "接口不存在");
  } catch (error) {
    return errorResponse(error);
  }
}

