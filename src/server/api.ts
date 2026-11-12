import { errorResponse, json, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { handleCore } from "./api-core";
import { handleExperiments } from "./api-experiments";
import { handleData } from "./api-data";

export async function handleApi(request: Request, segments: string[]) {
  try {
    const method = request.method;
    if (segments.join("/") === "health" && method === "GET") return json({ ok: true, service: "wecraft-design-training-platform", time: new Date().toISOString() });
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

