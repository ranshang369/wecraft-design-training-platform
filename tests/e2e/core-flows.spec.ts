import { expect, test } from "@playwright/test";
import { blindBody, CASE_METADATA, IDS, newSession, readJson, reviewBody, SAFE_HTML, SCREENSHOT_DATA_URL, expectStatus } from "./helpers";

test("流程 A：案例创建、双评、分歧裁决与入库", async () => {
  const annotator = await newSession("annotator@example.test");
  const admin = await newSession("admin@example.test");
  const engineer = await newSession("engineer@example.test");
  const lead = await newSession("lead@example.test");
  const owner = await newSession("owner@example.test");
  try {
    const title = "E2E 流程 A 案例 " + Date.now();
    const created = await annotator.post("/api/v1/cases", { data: {
      title, briefId: null,
      applicableConditions: "适合材料隐喻清楚、正文较长的内容。",
      designMechanism: "用折页结构建立标题与段落层级，同时保留阅读效率。",
      ...CASE_METADATA,
      antiPatterns: ["避免纯装饰折痕"], mechanismTags: ["材料同构", "折页"],
      selfScores: { CONTENT_FIT: 4, VISUAL_MECHANISM: 4, TYPE_HIERARCHY: 4, IMAGE_NARRATIVE: 4, RHYTHM: 4, COMPLETION: 4 },
      sourceType: "INTERNAL_ORIGINAL", sourceNote: "E2E 非敏感样例",
      html: SAFE_HTML, screenshotDataUrl: SCREENSHOT_DATA_URL,
    }});
    expectStatus(created, 201);
    const caseId = (await readJson<{ id: string }>(created)).id;

    expectStatus(await lead.put("/api/v1/cases/" + caseId + "/authorization", { data: {
      canUseForGeneration: true, canUseForDisplay: true, canUseForTraining: true, canDeriveMechanism: true,
      canUseForEvaluation: true, canShowPublicly: false, evidenceStatus: "VERIFIED",
      evidenceNote: "E2E 内部原创样例，授权证据已核验", reason: "流程 A 入库前完成授权核验",
    } }), 200);

    expectStatus(await annotator.post("/api/v1/cases/" + caseId + "/submit", { data: {} }), 200);
    expectStatus(await lead.post("/api/v1/cases/" + caseId + "/assign", { data: { reviewerIds: [IDS.admin, IDS.engineer] } }), 200);

    const adminTasks = await readJson<Array<any>>(await admin.get("/api/v1/review-tasks"));
    const engineerTasks = await readJson<Array<any>>(await engineer.get("/api/v1/review-tasks"));
    const adminTask = adminTasks.find((task) => task.subjectId === caseId && task.type === "CASE_REVIEW");
    const engineerTask = engineerTasks.find((task) => task.subjectId === caseId && task.type === "CASE_REVIEW");
    expect(adminTask, "admin review task must exist").toBeTruthy();
    expect(engineerTask, "engineer review task must exist").toBeTruthy();

    const first = await admin.post("/api/v1/review-tasks/" + adminTask.id + "/submit", { data: reviewBody(5, "PUBLISHABLE") });
    expectStatus(first, 201);
    expect((await readJson<any>(first)).version).toBe(1);
    expectStatus(await admin.post("/api/v1/review-tasks/" + adminTask.id + "/submit", { data: reviewBody(5, "PUBLISHABLE") }), 409);

    expectStatus(await engineer.post("/api/v1/review-tasks/" + engineerTask.id + "/submit", { data: reviewBody(3, "CHANGES_REQUESTED") }), 201);
    const disputed = await readJson<any>(await owner.get("/api/v1/cases/" + caseId));
    expect(disputed.status).toBe("ARBITRATION");

    const leadTasks = await readJson<Array<any>>(await lead.get("/api/v1/review-tasks"));
    const arbitration = leadTasks.find((task) => task.subjectId === caseId && task.type === "ARBITRATION");
    expect(arbitration, "arbitration task must be created").toBeTruthy();
    const resolved = await lead.post("/api/v1/cases/" + caseId + "/resolve", { data: { outcome: "ELIGIBLE", reason: "综合两名评审证据，采用高分结论。" } });
    expectStatus(resolved, 200);
    expect((await readJson<any>(resolved)).status).toBe("ELIGIBLE");

    const finalCase = await readJson<any>(await lead.get("/api/v1/cases/" + caseId));
    expect(finalCase.status).toBe("ELIGIBLE");
    const logs = await readJson<Array<any>>(await owner.get("/api/v1/audit-logs"));
    expect(logs.some((row) => row.action === "CASE_ARBITRATION_RESOLVED" && row.resourceId === caseId)).toBeTruthy();
    expect(logs.filter((row) => row.action === "REVIEW_SUBMITTED" && row.resourceId === caseId).length).toBeGreaterThanOrEqual(2);
  } finally {
    await Promise.all([annotator.dispose(), admin.dispose(), engineer.dispose(), lead.dispose(), owner.dispose()]);
  }
});


test("评审修订：旧版本标记 SUPERSEDED，新版本保留审计", async () => {
  const admin = await newSession("admin@example.test");
  const engineer = await newSession("engineer@example.test");
  const lead = await newSession("lead@example.test");
  try {
    const caseId = "00000000-0000-4000-8000-000000000303";
    expectStatus(await lead.post("/api/v1/cases/" + caseId + "/assign", { data: { reviewerIds: [IDS.admin, IDS.engineer] } }), 200);
    const tasks = await readJson<Array<any>>(await admin.get("/api/v1/review-tasks"));
    const task = tasks.find((row) => row.subjectId === caseId && row.type === "CASE_REVIEW");
    expect(task, "admin case review task must exist").toBeTruthy();
    const first = await admin.post("/api/v1/review-tasks/" + task.id + "/submit", { data: reviewBody(4, "PUBLISHABLE") });
    expectStatus(first, 201);
    const firstBody = await readJson<any>(first);
    const revised = await admin.post("/api/v1/review-tasks/" + task.id + "/revise", { data: { ...reviewBody(4, "PUBLISHABLE"), rationale: "补充证据后修订，结论不变。", reason: "补充正文证据" } });
    expectStatus(revised, 201);
    const revisedBody = await readJson<any>(revised);
    expect(revisedBody.version).toBe(2);
    expect(revisedBody.supersedesId).toBe(firstBody.id);
    const detail = await readJson<any>(await admin.get("/api/v1/cases/" + caseId));
    const oldReview = detail.reviews.find((row: any) => row.id === firstBody.id);
    const newReview = detail.reviews.find((row: any) => row.id === revisedBody.id);
    expect(oldReview.status).toBe("SUPERSEDED");
    expect(newReview.status).toBe("SUBMITTED");
    const logs = await readJson<Array<any>>(await admin.get("/api/v1/audit-logs"));
    expect(logs.some((row) => row.action === "REVIEW_REVISED" && row.resourceId === caseId)).toBeTruthy();
  } finally {
    await Promise.all([admin.dispose(), engineer.dispose(), lead.dispose()]);
  }
});


test("流程 B：匿名 A/B 盲测、双评、裁决与实验关闭", async () => {
  const annotator = await newSession("annotator@example.test");
  const lead = await newSession("lead@example.test");
  const owner = await newSession("owner@example.test");
  try {
    const experiments = await readJson<Array<any>>(await owner.get("/api/v1/experiments"));
    const experiment = experiments.find((row) => row.experimentNo === "EX-0001");
    expect(experiment, "seed experiment EX-0001 must exist").toBeTruthy();
    const detail = await readJson<any>(await owner.get("/api/v1/experiments/" + experiment.id));
    const pairId = detail.pairs[0].id;
    const blindUrl = "/api/v1/experiments/" + experiment.id + "/pairs/" + pairId + "/blind";

    const before = await readJson<any>(await annotator.get(blindUrl));
    expect(before.left.side).toBe("A");
    expect(before.right.side).toBe("B");
    expect(before.reveal).toBeNull();
    expect(JSON.stringify(before)).not.toContain("modelName");
    expect(JSON.stringify(before)).not.toContain("modelProvider");
    expect(before.hardChecks.left.every((row: any) => row.status === "PASS" || row.status === "SKIPPED")).toBeTruthy();

    expectStatus(await annotator.post(blindUrl, { data: { ...blindBody("LEFT", "A 的层级更清楚"), hardCheckAcknowledged: false } }), 400);
    expectStatus(await annotator.post(blindUrl, { data: blindBody("LEFT", "A 的层级更清楚") }), 201);
    expectStatus(await annotator.post(blindUrl, { data: blindBody("LEFT", "A 的层级更清楚") }), 409);

    const leadBefore = await readJson<any>(await lead.get(blindUrl));
    expect(leadBefore.submitted).toBe(false);
    expect(leadBefore.existing).toBeNull();
    expect(JSON.stringify(leadBefore)).not.toContain("A 的层级更清楚");
    expectStatus(await lead.post(blindUrl, { data: blindBody("RIGHT", "B 更贴近设计委托") }), 201);

    const pairAfter = await readJson<any>(await owner.get("/api/v1/experiments/" + experiment.id));
    expect(pairAfter.pairs.find((pair: any) => pair.id === pairId).status).toBe("IN_PROGRESS");
    const tasks = await readJson<Array<any>>(await owner.get("/api/v1/review-tasks"));
    const arbitration = tasks.find((task) => task.type === "ARBITRATION" && task.experimentPairId === pairId);
    expect(arbitration, "blind arbitration task must exist").toBeTruthy();
    const resolved = await owner.post("/api/v1/review-tasks/" + arbitration.id + "/arbitrate", { data: { preference: "RIGHT", reason: "两名评审分歧，按内容贴合度裁决 B。" } });
    expectStatus(resolved, 200);
    expect((await readJson<any>(resolved)).status).toBe("COMPLETED");

    const closed = await owner.post("/api/v1/experiments/" + experiment.id + "/close", { data: {} });
    expectStatus(closed, 200);
    expect((await readJson<any>(closed)).status).toBe("CLOSED");
    const results = await readJson<any>(await owner.get("/api/v1/experiments/" + experiment.id + "/results"));
    expect(results.comparisons.length).toBeGreaterThanOrEqual(2);
    const afterClose = await readJson<any>(await annotator.get(blindUrl));
    expect(afterClose.reveal).not.toBeNull();
  } finally {
    await Promise.all([annotator.dispose(), lead.dispose(), owner.dispose()]);
  }
});

test("流程 D：Holdout 三评隔离、文件授权、裁决门槛与归一化结果", async () => {
  const owner = await newSession("owner@example.test");
  const admin = await newSession("admin@example.test");
  const annotator = await newSession("annotator@example.test");
  const engineer = await newSession("engineer@example.test");
  const lead = await newSession("lead@example.test");
  const viewer = await newSession("viewer@example.test");
  let ownerMembershipId = "";
  let originalOwnerRoles: string[] = [];
  try {
    const members = await readJson<any[]>(await owner.get("/api/v1/members"));
    const ownerMember = members.find((member) => member.user.email === "owner@example.test");
    expect(ownerMember, "owner membership must exist").toBeTruthy();
    ownerMembershipId = ownerMember.id;
    originalOwnerRoles = ownerMember.roles.map((row: any) => row.role.code);
    expectStatus(await owner.patch("/api/v1/members/" + ownerMembershipId + "/roles", { data: { roles: [...new Set([...originalOwnerRoles, "AI_ENGINEER"])] } }), 200);

    async function createHoldoutCandidate(title: string) {
      const response = await owner.post("/api/v1/candidates", { data: {
        title, briefId: IDS.holdoutBrief, modelProvider: "holdout-demo", modelName: "night-layout", modelVersion: "1",
        html: SAFE_HTML, screenshotDataUrl: SCREENSHOT_DATA_URL,
      }});
      expectStatus(response, 201);
      const candidateId = (await readJson<{ id: string }>(response)).id;
      const checked = await readJson<any>(await owner.post("/api/v1/candidates/" + candidateId + "/hard-check", { data: {} }));
      expect(checked.ok).toBe(true);
      return candidateId;
    }

    const leftCandidateId = await createHoldoutCandidate("Holdout 夜间方案 A " + Date.now());
    const rightCandidateId = await createHoldoutCandidate("Holdout 夜间方案 B " + Date.now());
    const created = await owner.post("/api/v1/experiments", { data: {
      name: "Holdout 三评实验 " + Date.now(), briefId: IDS.holdoutBrief,
      candidateIds: [leftCandidateId, rightCandidateId],
      reviewerIds: [IDS.annotator, IDS.lead, IDS.engineer], adjudicatorId: IDS.admin, protocolType: "HOLDOUT",
    }});
    expectStatus(created, 201);
    const experiment = await readJson<any>(created);
    expect(experiment.protocol.type).toBe("HOLDOUT");
    expect(experiment.protocol.reviewers).toBe(3);
    expect(experiment.protocol.revealAfterReviewers).toBe(3);

    const detail = await readJson<any>(await owner.get("/api/v1/experiments/" + experiment.id));
    const pairId = detail.pairs[0].id;
    const blindUrl = "/api/v1/experiments/" + experiment.id + "/pairs/" + pairId + "/blind";
    expectStatus(await owner.get(blindUrl), 403);

    const firstView = await readJson<any>(await annotator.get(blindUrl));
    expect(firstView.reveal).toBeNull();
    expect(JSON.stringify(firstView)).not.toContain("holdout-demo");
    expect(JSON.stringify(firstView)).not.toContain("night-layout");
    expectStatus(await annotator.get("/api/v1/files/" + firstView.left.screenshotFileId + "/content"), 200);
    expectStatus(await viewer.get("/api/v1/files/" + firstView.left.screenshotFileId + "/content"), 404);

    expectStatus(await annotator.post(blindUrl, { data: blindBody("LEFT", "Holdout A 更贴合夜间叙事") }), 201);
    expectStatus(await lead.post(blindUrl, { data: blindBody("RIGHT", "Holdout B 的层次更清楚") }), 201);
    const beforeThird = await readJson<any[]>(await admin.get("/api/v1/review-tasks"));
    expect(beforeThird.some((task) => task.type === "ARBITRATION" && task.experimentPairId === pairId)).toBe(false);

    expectStatus(await engineer.post(blindUrl, { data: blindBody("TIE", "两种夜间节奏各有证据") }), 201);
    const afterThird = await readJson<any[]>(await admin.get("/api/v1/review-tasks"));
    const arbitration = afterThird.find((task) => task.type === "ARBITRATION" && task.experimentPairId === pairId);
    expect(arbitration, "three reviews should trigger arbitration").toBeTruthy();
    expectStatus(await admin.post("/api/v1/review-tasks/" + arbitration.id + "/arbitrate", { data: { preference: "RIGHT", reason: "三评两票分歧，按 375px 层级证据裁决 B。" } }), 200);

    expectStatus(await owner.post("/api/v1/experiments/" + experiment.id + "/close", { data: {} }), 200);
    const results = await readJson<any>(await owner.get("/api/v1/experiments/" + experiment.id + "/results"));
    expect(results.summary.reviewerTarget).toBe(3);
    expect(results.summary.completePairs).toBe(1);
    expect(results.summary.reviewerSubmissions).toBe(3);
    expect(results.comparisons.every((row: any) => ["LEFT", "RIGHT", "TIE"].includes(row.normalizedPreference))).toBe(true);
  } finally {
    if (ownerMembershipId) await owner.patch("/api/v1/members/" + ownerMembershipId + "/roles", { data: { roles: originalOwnerRoles } }).catch(() => undefined);
    await Promise.all([owner.dispose(), admin.dispose(), annotator.dispose(), engineer.dispose(), lead.dispose(), viewer.dispose()]);
  }
});

test("流程 C：授权校验、版本冻结、JSONL/CSV ZIP 导出与审计", async () => {
  const owner = await newSession("owner@example.test");
  try {
    const datasets = await readJson<Array<any>>(await owner.get("/api/v1/datasets"));
    const blockedDataset = datasets.find((row) => row.datasetNo === "DS-0001");
    expect(blockedDataset, "seed dataset DS-0001 must exist").toBeTruthy();
    const blocked = await readJson<any>(await owner.post("/api/v1/datasets/" + blockedDataset.id + "/validate", { data: {} }));
    expect(blocked.blockers.some((row: any) => row.code === "RIGHTS_MISSING")).toBeTruthy();
    expectStatus(await owner.post("/api/v1/datasets/" + blockedDataset.id + "/export", { data: {} }), 422);

    const created = await owner.post("/api/v1/datasets", { data: { name: "E2E 训练集 " + Date.now(), type: "TRAIN", caseIds: [IDS.eligibleCase], briefIds: [], counterexampleIds: [], candidateIds: [] } });
    expectStatus(created, 201);
    const datasetId = (await readJson<{ id: string }>(created)).id;
    const checked = await readJson<any>(await owner.post("/api/v1/datasets/" + datasetId + "/validate", { data: {} }));
    expect(checked.blockers).toEqual([]);
    expect(checked.dataset.status).toBe("READY_FOR_APPROVAL");
    expectStatus(await owner.post("/api/v1/datasets/" + datasetId + "/approve", { data: {} }), 200);

    const exported = await owner.post("/api/v1/datasets/" + datasetId + "/export", { data: {} });
    expectStatus(exported, 201);
    const payload = await readJson<any>(exported);
    expect(payload.export.status).toBe("SUCCEEDED");
    expect(typeof payload.export.sizeBytes).toBe("string");
    const download = await owner.get(payload.downloadUrl);
    expectStatus(download, 200);
    expect(download.headers()["content-type"]).toContain("application/zip");
    const bytes = await download.body();
    expect(bytes.subarray(0, 2).toString()).toBe("PK");

    const detail = await readJson<any>(await owner.get("/api/v1/datasets/" + datasetId));
    expect(typeof detail.exports[0].sizeBytes).toBe("string");
    const logs = await readJson<Array<any>>(await owner.get("/api/v1/audit-logs"));
    expect(logs.some((row) => row.action === "DATASET_VALIDATED" && row.resourceId === datasetId)).toBeTruthy();
    expect(logs.some((row) => row.action === "DATASET_EXPORTED" && row.resourceId === datasetId)).toBeTruthy();
    expect(logs.some((row) => row.action === "DATASET_DOWNLOADED")).toBeTruthy();
  } finally {
    await owner.dispose();
  }
});

test("流程 C2：并发创建数据集时编号原子分配且不冲突", async () => {
  const owner = await newSession("owner@example.test");
  try {
    const responses = await Promise.all(Array.from({ length: 8 }, (_, index) => owner.post("/api/v1/datasets", {
      data: { name: "E2E 并发训练集 " + Date.now() + " #" + index, type: "TRAIN", caseIds: [IDS.eligibleCase], briefIds: [], counterexampleIds: [], candidateIds: [] },
    })));
    for (const response of responses) expectStatus(response, 201);
    const created = await Promise.all(responses.map((response) => readJson<{ datasetNo: string }>(response)));
    const numbers = created.map((row) => row.datasetNo);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(numbers.every((number) => /^DS-[0-9]{4,}$/.test(number))).toBeTruthy();
  } finally {
    await owner.dispose();
  }
});

