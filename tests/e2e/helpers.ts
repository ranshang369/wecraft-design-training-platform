import { type APIRequestContext, type APIResponse, expect, request } from "@playwright/test";

export const BASE_URL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
export const PASSWORD = "Demo1234!";
export const USERS = {
  owner: "owner@example.test",
  admin: "admin@example.test",
  lead: "lead@example.test",
  annotator: "annotator@example.test",
  engineer: "engineer@example.test",
  viewer: "viewer@example.test",
} as const;

export const IDS = {
  workspace: "00000000-0000-4000-8000-000000000001",
  brief: "00000000-0000-4000-8000-000000000201",
  holdoutBrief: "00000000-0000-4000-8000-000000000203",
  eligibleCase: "00000000-0000-4000-8000-000000000301",
  owner: "00000000-0000-4000-8000-000000000101",
  admin: "00000000-0000-4000-8000-000000000102",
  lead: "00000000-0000-4000-8000-000000000103",
  annotator: "00000000-0000-4000-8000-000000000106",
  engineer: "00000000-0000-4000-8000-000000000107",
} as const;

export const DIMENSIONS = ["CONTENT_FIT","VISUAL_MECHANISM","TYPE_HIERARCHY","IMAGE_NARRATIVE","RHYTHM","COMPLETION"] as const;

export async function newSession(email: string): Promise<APIRequestContext> {
  const context = await request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { "Content-Type": "application/json" },
  });
  const response = await context.post("/api/v1/auth/login", { data: { email, password: PASSWORD } });
  const text = await response.text();
  if (response.status() !== 200) throw new Error("Login failed for " + email + ": " + response.status() + " " + text);
  return context;
}

export async function readJson<T>(response: APIResponse): Promise<T> {
  const text = await response.text();
  if (!response.ok()) throw new Error("HTTP " + response.status() + ": " + text);
  return (text ? JSON.parse(text) : null) as T;
}

export function scores(value: number) {
  return Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, value]));
}

export function reviewBody(value: number, recommendation: "PUBLISHABLE" | "CHANGES_REQUESTED" = "PUBLISHABLE") {
  return {
    recommendation,
    rationale: value >= 4 ? "视觉机制与内容结构匹配，证据充分。" : "完成度和证据不足，建议修改后再审。",
    scores: scores(value),
    evidence: [{ evidenceType: "SCREENSHOT_REGION", locator: "正文首屏", excerpt: "标题、正文与证据区域可对应。" }],
  };
}

export function blindBody(preference: "LEFT" | "RIGHT" | "TIE", rationale: string) {
  return {
    scores: { left: scores(4), right: scores(3) },
    preference,
    rationale,
    confidence: 4,
    durationMs: 12000,
    hardCheckAcknowledged: true,
    hardCheckNotes: "双方 BLOCK 项均已核对。",
  };
}

export const SCREENSHOT_DATA_URL = "data:image/svg+xml;base64," + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="375" height="600"><rect width="375" height="600" fill="#f4efe5"/><text x="28" y="72" font-size="28" fill="#111">E2E 案例</text><text x="28" y="110" font-size="14" fill="#333">375px 验收截图</text></svg>'
).toString("base64");

export const SAFE_HTML = "<!doctype html><html><head><style>body{color:#111;background:#fff;font-family:sans-serif;padding:24px}h1{font-size:36px}</style></head><body><h1>材料成为段落</h1><p>设计不是把文字放进模板，而是让内容结构与观看方式互相解释。这段正文用于端到端验收。</p><p>第二段继续验证正文完整性、层级和对比度。</p></body></html>";

export function expectStatus(response: APIResponse, status: number) {
  expect(response.status(), "unexpected response: " + response.status()).toBe(status);
}

