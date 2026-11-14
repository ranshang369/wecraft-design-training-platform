import sharp from "sharp";
import { expect, test } from "@playwright/test";
import { CASE_METADATA, IDS, SAFE_HTML, expectStatus, newSession, readJson } from "./helpers";

async function framedScreenshot() {
  const png = await sharp({ create: { width: 1200, height: 900, channels: 4, background: "#ffffff" } })
    .composite([{
      input: Buffer.from('<svg width="1000" height="700"><rect width="1000" height="700" fill="#f4efe5"/><rect x="48" y="48" width="560" height="280" fill="#c33"/><rect x="48" y="380" width="840" height="6" fill="#222"/></svg>'),
      left: 100,
      top: 100,
    }])
    .png()
    .toBuffer();
  return "data:image/png;base64," + png.toString("base64");
}

function imageAssets(assets: any[], versionKey: string, versionId: string) {
  return assets.filter((asset) => asset[versionKey] === versionId && ["SOURCE", "SCREENSHOT_375"].includes(asset.kind));
}

test("图片自动适配：案例、反例和候选同时保留原图并生成 750px 证据图", async () => {
  const annotator = await newSession("annotator@example.test");
  const engineer = await newSession("engineer@example.test");
  try {
    const screenshotDataUrl = await framedScreenshot();

    const caseCreated = await annotator.post("/api/v1/cases", { data: {
      title: "E2E 图片自动适配案例 " + Date.now(),
      briefId: null,
      applicableConditions: "适合验证宽图自动裁边与适配的内容。",
      designMechanism: "用清晰的标题与正文层级验证截图处理链路。",
      ...CASE_METADATA,
      antiPatterns: ["不要手工拉伸截图"],
      mechanismTags: ["证据处理"],
      selfScores: { CONTENT_FIT: 4, VISUAL_MECHANISM: 4, TYPE_HIERARCHY: 4, IMAGE_NARRATIVE: 4, RHYTHM: 4, COMPLETION: 4 },
      sourceType: "INTERNAL_ORIGINAL",
      sourceNote: "E2E 图片处理样例",
      html: SAFE_HTML,
      screenshotDataUrl,
    } });
    expectStatus(caseCreated, 201);
    const caseId = (await readJson<{ id: string }>(caseCreated)).id;
    const caseDetail = await readJson<any>(await annotator.get("/api/v1/cases/" + caseId));
    const caseVersion = caseDetail.versions[0];
    const caseImages = imageAssets(caseDetail.assets, "caseVersionId", caseVersion.id);
    expect(caseImages.find((asset) => asset.kind === "SOURCE")).toMatchObject({ width: 1200, height: 900 });
    expect(caseImages.find((asset) => asset.kind === "SCREENSHOT_375")).toMatchObject({ width: 750, height: 525 });

    const counterCreated = await annotator.post("/api/v1/counterexamples", { data: {
      title: "E2E 图片自动适配反例 " + Date.now(),
      archetype: "GENRE",
      briefId: null,
      failureSummary: "宽图未适配时难以作为移动端证据。",
      failureLabels: ["证据尺寸"],
      reproductionSteps: "上传 1200px 宽截图。",
      rootCause: "未在入库时归一化尺寸。",
      repairSuggestion: "保存原图并生成 750px 评审证据图。",
      applicableConditions: ["外部案例截图"],
      sourceType: "INTERNAL_ORIGINAL",
      sourceNote: "E2E 图片处理样例",
      html: SAFE_HTML,
      screenshotDataUrl,
    } });
    expectStatus(counterCreated, 201);
    const counterId = (await readJson<{ id: string }>(counterCreated)).id;
    const counterDetail = await readJson<any>(await annotator.get("/api/v1/counterexamples/" + counterId));
    const counterVersion = counterDetail.versions[0];
    const counterImages = imageAssets(counterDetail.assets, "counterexampleVersionId", counterVersion.id);
    expect(counterImages.find((asset) => asset.kind === "SOURCE")).toMatchObject({ width: 1200, height: 900 });
    expect(counterImages.find((asset) => asset.kind === "SCREENSHOT_375")).toMatchObject({ width: 750, height: 525 });

    const candidateCreated = await engineer.post("/api/v1/candidates", { data: {
      title: "E2E 图片自动适配候选 " + Date.now(),
      briefId: IDS.brief,
      modelProvider: "E2E",
      modelName: "Image Pipeline",
      modelVersion: "v1",
      html: SAFE_HTML,
      screenshotDataUrl,
    } });
    expectStatus(candidateCreated, 201);
    const candidateId = (await readJson<{ id: string }>(candidateCreated)).id;
    const candidateDetail = await readJson<any>(await engineer.get("/api/v1/candidates/" + candidateId));
    const candidateVersion = candidateDetail.versions[0];
    const candidateImages = imageAssets(candidateDetail.assets, "candidateVersionId", candidateVersion.id);
    expect(candidateImages.find((asset) => asset.kind === "SOURCE")).toMatchObject({ width: 1200, height: 900 });
    expect(candidateImages.find((asset) => asset.kind === "SCREENSHOT_375")).toMatchObject({ width: 750, height: 525 });
  } finally {
    await annotator.dispose();
    await engineer.dispose();
  }
});
